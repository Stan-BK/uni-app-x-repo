import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  COMMUNITY_COMMENT_BODY_MAX,
  NotificationType,
} from "@activity/shared";
import {
  CommunityDeletedBy as PrismaCommunityDeletedBy,
  LikeTargetType as PrismaLikeTargetType,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateCommentDto } from "./dto/create-comment.dto";
import { findLikedTargetIds } from "./likes.lookup";
import { authorDisplayName } from "./posts.mapper";
import { isCommunityUploadUrl, normalizePaging } from "./posts.service";

const COMMENT_INCLUDE = {
  author: { select: { id: true, nickname: true, avatarUrl: true } },
} satisfies Prisma.CommentInclude;

type CommentRow = Prisma.CommentGetPayload<{ include: typeof COMMENT_INCLUDE }>;

export function mapComment(row: CommentRow, opts: { likedByMe?: boolean } = {}) {
  return {
    id: row.id,
    postId: row.postId,
    parentId: row.parentId,
    body: row.body,
    imageUrl: row.imageUrl,
    author: {
      id: row.author.id,
      nickname: authorDisplayName(row.author.nickname),
      avatarUrl: row.author.avatarUrl,
    },
    likeCount: row.likeCount,
    likedByMe: opts.likedByMe ?? false,
    createdAt: row.createdAt.toISOString(),
  };
}

export type CommentDto = ReturnType<typeof mapComment>;
export type CommentWithRepliesDto = CommentDto & { replies: CommentDto[] };

export type ListCommentsInput = { page?: number; pageSize?: number };

@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(authorId: string, postId: string, dto: CreateCommentDto) {
    const body = (dto.body ?? "").trim();
    const imageUrl = dto.imageUrl?.trim() || null;

    if (body.length > COMMUNITY_COMMENT_BODY_MAX) {
      throw new BadRequestException(
        `评论最多 ${COMMUNITY_COMMENT_BODY_MAX} 字`,
      );
    }
    if (!body && !imageUrl) {
      throw new BadRequestException("评论内容与图片至少填写一项");
    }
    if (imageUrl && !isCommunityUploadUrl(imageUrl)) {
      throw new BadRequestException("图片地址无效");
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const post = await tx.post.findUnique({
        where: { id: postId },
        select: { id: true, authorId: true, deletedAt: true },
      });
      if (!post) throw new NotFoundException("动态不存在");
      if (post.deletedAt) throw new NotFoundException("动态已删除");

      // 回复目标（用户点的那条）与实际挂载的一级祖先分开：通知发给前者
      const target = dto.parentId
        ? await this.findReplyTarget(tx, postId, dto.parentId)
        : null;
      const rootParentId = target ? (target.parentId ?? target.id) : null;

      const created = await tx.comment.create({
        data: {
          postId,
          authorId,
          parentId: rootParentId,
          body,
          imageUrl,
        },
        include: COMMENT_INCLUDE,
      });
      await tx.post.update({
        where: { id: postId },
        data: { commentCount: { increment: 1 } },
      });

      // 回复只通知被回复者；一级评论通知动态作者；不给自己发
      const recipientId = target ? target.authorId : post.authorId;
      if (recipientId !== authorId) {
        await tx.notification.create({
          data: {
            recipientId,
            actorId: authorId,
            type: target
              ? NotificationType.ReplyComment
              : NotificationType.CommentPost,
            postId,
            commentId: created.id,
          },
        });
      }
      return created;
    });
    return mapComment(row);
  }

  async listForPost(
    postId: string,
    input: ListCommentsInput = {},
    userId?: string,
  ) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, deletedAt: true },
    });
    if (!post) throw new NotFoundException("动态不存在");
    if (post.deletedAt) throw new NotFoundException("动态已删除");

    const { page, pageSize } = normalizePaging(input);
    const where = { postId, parentId: null, deletedAt: null };
    const [rows, total] = await Promise.all([
      this.prisma.comment.findMany({
        where,
        orderBy: { createdAt: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          ...COMMENT_INCLUDE,
          replies: {
            where: { deletedAt: null },
            orderBy: { createdAt: "asc" },
            include: COMMENT_INCLUDE,
          },
        },
      }),
      this.prisma.comment.count({ where }),
    ]);
    // 一级 + 回复合并为一次批量查赞
    const liked = await findLikedTargetIds(
      this.prisma,
      userId,
      PrismaLikeTargetType.comment,
      rows.flatMap((row) => [row.id, ...row.replies.map((r) => r.id)]),
    );
    const items: CommentWithRepliesDto[] = rows.map((row) => ({
      ...mapComment(row, { likedByMe: liked.has(row.id) }),
      replies: row.replies.map((r) =>
        mapComment(r, { likedByMe: liked.has(r.id) }),
      ),
    }));
    return { items, total, page, pageSize };
  }

  /**
   * 作者软删。删一级评论时级联软删其下未删回复（整枝不可见），
   * commentCount 递减「本次实际软删条数」（下限 0）。已删则幂等不重复扣减。
   */
  async softDelete(userId: string, commentId: string) {
    const row = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, authorId: true, postId: true, parentId: true },
    });
    if (!row) throw new NotFoundException("评论不存在");
    if (row.authorId !== userId) {
      throw new ForbiddenException("只能删除自己的评论");
    }

    await this.prisma.$transaction(async (tx) => {
      const data = {
        deletedAt: new Date(),
        deletedBy: PrismaCommunityDeletedBy.author,
      };
      const self = await tx.comment.updateMany({
        where: { id: commentId, deletedAt: null },
        data,
      });
      if (self.count === 0) return;

      let removed = self.count;
      if (row.parentId === null) {
        const replies = await tx.comment.updateMany({
          where: { parentId: commentId, deletedAt: null },
          data,
        });
        removed += replies.count;
      }

      const dec = await tx.post.updateMany({
        where: { id: row.postId, commentCount: { gte: removed } },
        data: { commentCount: { decrement: removed } },
      });
      if (dec.count === 0) {
        await tx.post.updateMany({
          where: { id: row.postId, commentCount: { lt: removed } },
          data: { commentCount: 0 },
        });
      }
    });
  }

  private async findReplyTarget(
    tx: Prisma.TransactionClient,
    postId: string,
    parentId: string,
  ) {
    const parent = await tx.comment.findFirst({
      where: { id: parentId, postId, deletedAt: null },
      select: { id: true, parentId: true, authorId: true },
    });
    if (!parent) throw new BadRequestException("回复的评论不存在");
    return parent;
  }
}

import { Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, AuditTargetType } from "@activity/shared";
import { CommunityDeletedBy } from "@prisma/client";
import { mapComment } from "../community/comments.service";
import { POST_INCLUDE, mapPost } from "../community/posts.mapper";
import { normalizePaging } from "../community/posts.service";
import { PrismaService } from "../prisma/prisma.service";

const AUTHOR_SELECT = {
  id: true,
  nickname: true,
  avatarUrl: true,
} as const;

const COMMENT_INCLUDE = {
  author: { select: AUTHOR_SELECT },
  replyToAuthor: { select: AUTHOR_SELECT },
} as const;

function mapAdminPost(row: Parameters<typeof mapPost>[0]) {
  const { likedByMe: _omit, ...rest } = mapPost(row);
  return rest;
}

@Injectable()
export class AdminCommunityService {
  constructor(private readonly prisma: PrismaService) {}

  async listPosts(input: { q?: string; page?: number; pageSize?: number }) {
    const { page, pageSize } = normalizePaging(input);
    const keyword = input.q?.trim() || undefined;
    const where = {
      deletedAt: null as null,
      ...(keyword
        ? {
            OR: [
              { body: { contains: keyword, mode: "insensitive" as const } },
              {
                author: {
                  nickname: { contains: keyword, mode: "insensitive" as const },
                },
              },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: POST_INCLUDE,
      }),
      this.prisma.post.count({ where }),
    ]);
    return {
      items: rows.map((row) => mapAdminPost(row)),
      total,
      page,
      pageSize,
    };
  }

  async getPost(id: string) {
    const row = await this.prisma.post.findUnique({
      where: { id },
      include: POST_INCLUDE,
    });
    if (!row) throw new NotFoundException("动态不存在");
    if (row.deletedAt) throw new NotFoundException("动态已删除");
    return mapAdminPost(row);
  }

  async listComments(
    postId: string,
    input: { page?: number; pageSize?: number },
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

    const items = rows.map((row) => {
      const rootMapped = mapComment(row);
      const { likedByMe: _a, ...root } = rootMapped;
      return {
        ...root,
        replies: row.replies.map((r) => {
          const mapped = mapComment(r, { replyToFallback: root.author });
          const { likedByMe: _b, ...rest } = mapped;
          return rest;
        }),
      };
    });

    return { items, total, page, pageSize };
  }

  /**
   * Admin 软删动态；不存在或已删均返回 404。
   * 用 `deletedAt: null` 条件更新做并发闸门，仅更新成功的请求才写审计，避免双写。
   */
  async softDeletePost(id: string, adminId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.post.updateMany({
        where: { id, deletedAt: null },
        data: {
          deletedAt: new Date(),
          deletedBy: CommunityDeletedBy.admin,
        },
      });

      if (count === 0) {
        const post = await tx.post.findUnique({
          where: { id },
          select: { id: true },
        });
        if (!post) throw new NotFoundException("动态不存在");
        throw new NotFoundException("动态已删除");
      }

      await tx.auditLog.create({
        data: {
          actorType: "admin",
          actorId: adminId,
          action: AuditAction.SoftDeletePost,
          targetType: AuditTargetType.Post,
          targetId: id,
        },
      });
    });
  }

  /**
   * Admin 软删评论；不存在或已删均返回 404。
   * 与作者软删一致：删一级评论时级联软删其下未删回复，commentCount 递减「本次实际软删条数」（下限 0）。
   * 以 `deletedAt: null` 条件更新做并发闸门，仅更新成功的请求才扣减计数与写审计。
   */
  async softDeleteComment(id: string, adminId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const comment = await tx.comment.findUnique({
        where: { id },
        select: { id: true, postId: true, parentId: true },
      });
      if (!comment) throw new NotFoundException("评论不存在");

      const data = {
        deletedAt: new Date(),
        deletedBy: CommunityDeletedBy.admin,
      };
      const self = await tx.comment.updateMany({
        where: { id, deletedAt: null },
        data,
      });
      if (self.count === 0) throw new NotFoundException("评论已删除");

      let removed = self.count;
      if (comment.parentId === null) {
        const replies = await tx.comment.updateMany({
          where: { parentId: id, deletedAt: null },
          data,
        });
        removed += replies.count;
      }

      const dec = await tx.post.updateMany({
        where: { id: comment.postId, commentCount: { gte: removed } },
        data: { commentCount: { decrement: removed } },
      });
      if (dec.count === 0) {
        await tx.post.updateMany({
          where: { id: comment.postId, commentCount: { lt: removed } },
          data: { commentCount: 0 },
        });
      }

      await tx.auditLog.create({
        data: {
          actorType: "admin",
          actorId: adminId,
          action: AuditAction.SoftDeleteComment,
          targetType: AuditTargetType.Comment,
          targetId: id,
        },
      });
    });
  }
}

import { Injectable, NotFoundException } from "@nestjs/common";
import {
  LikeTargetType as PrismaLikeTargetType,
  NotificationType as PrismaNotificationType,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { LikeResultDto } from "./dto/like.dto";

type LikeTarget = {
  type: PrismaLikeTargetType;
  /** 被点赞对象的作者（通知接收人） */
  authorId: string;
  postId: string;
  commentId: string | null;
  likeCount: number;
};

@Injectable()
export class LikesService {
  constructor(private readonly prisma: PrismaService) {}

  likePost(userId: string, postId: string) {
    return this.like(userId, PrismaLikeTargetType.post, postId);
  }

  unlikePost(userId: string, postId: string) {
    return this.unlike(userId, PrismaLikeTargetType.post, postId);
  }

  likeComment(userId: string, commentId: string) {
    return this.like(userId, PrismaLikeTargetType.comment, commentId);
  }

  unlikeComment(userId: string, commentId: string) {
    return this.unlike(userId, PrismaLikeTargetType.comment, commentId);
  }

  /**
   * 幂等点赞：Like 行 + 计数 + 通知同一事务。
   * 并发下唯一约束 P2002 会使 Postgres 事务中止并整体回滚，
   * 因此在事务外捕获，视为「已赞」并返回最新计数。
   */
  private async like(
    userId: string,
    type: PrismaLikeTargetType,
    targetId: string,
  ): Promise<LikeResultDto> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const target = await this.loadTarget(tx, type, targetId, true);

        const existing = await tx.like.findUnique({
          where: {
            userId_targetType_targetId: { userId, targetType: type, targetId },
          },
          select: { id: true },
        });
        if (existing) return { liked: true, likeCount: target.likeCount };

        await tx.like.create({
          data: { userId, targetType: type, targetId },
        });
        await this.incrementCount(tx, type, targetId);

        // 自赞不通知
        if (target.authorId !== userId) {
          await tx.notification.create({
            data: {
              recipientId: target.authorId,
              actorId: userId,
              type:
                type === PrismaLikeTargetType.post
                  ? PrismaNotificationType.like_post
                  : PrismaNotificationType.like_comment,
              postId: target.postId,
              commentId: target.commentId,
            },
          });
        }
        return { liked: true, likeCount: target.likeCount + 1 };
      });
    } catch (error) {
      if (!this.isUniqueConstraint(error)) throw error;
      // 并发另一请求已落库：幂等成功，读取当前计数
      const target = await this.loadTarget(this.prisma, type, targetId, true);
      return { liked: true, likeCount: target.likeCount };
    }
  }

  /** 取消点赞：未赞时为成功空操作；计数下限 0。 */
  private async unlike(
    userId: string,
    type: PrismaLikeTargetType,
    targetId: string,
  ): Promise<LikeResultDto> {
    return this.prisma.$transaction(async (tx) => {
      // 取消允许作用于已软删对象（清理自己的赞），但对象须存在
      const target = await this.loadTarget(tx, type, targetId, false);

      const removed = await tx.like.deleteMany({
        where: { userId, targetType: type, targetId },
      });
      if (removed.count === 0) {
        return { liked: false, likeCount: target.likeCount };
      }
      await this.decrementCount(tx, type, targetId);
      return {
        liked: false,
        likeCount: Math.max(0, target.likeCount - 1),
      };
    });
  }

  private async loadTarget(
    db: Prisma.TransactionClient | PrismaService,
    type: PrismaLikeTargetType,
    targetId: string,
    requireVisible: boolean,
  ): Promise<LikeTarget> {
    if (type === PrismaLikeTargetType.post) {
      const post = await db.post.findUnique({
        where: { id: targetId },
        select: { id: true, authorId: true, likeCount: true, deletedAt: true },
      });
      if (!post) throw new NotFoundException("动态不存在");
      if (requireVisible && post.deletedAt) {
        throw new NotFoundException("动态已删除");
      }
      return {
        type,
        authorId: post.authorId,
        postId: post.id,
        commentId: null,
        likeCount: post.likeCount,
      };
    }

    const comment = await db.comment.findUnique({
      where: { id: targetId },
      select: {
        id: true,
        postId: true,
        authorId: true,
        likeCount: true,
        deletedAt: true,
        post: { select: { deletedAt: true } },
      },
    });
    if (!comment) throw new NotFoundException("评论不存在");
    if (requireVisible && (comment.deletedAt || comment.post.deletedAt)) {
      throw new NotFoundException("评论已删除");
    }
    return {
      type,
      authorId: comment.authorId,
      postId: comment.postId,
      commentId: comment.id,
      likeCount: comment.likeCount,
    };
  }

  private async incrementCount(
    tx: Prisma.TransactionClient,
    type: PrismaLikeTargetType,
    targetId: string,
  ) {
    const data = { likeCount: { increment: 1 } };
    if (type === PrismaLikeTargetType.post) {
      await tx.post.update({ where: { id: targetId }, data });
    } else {
      await tx.comment.update({ where: { id: targetId }, data });
    }
  }

  /** 条件递减：仅 likeCount >= 1 时减，否则兜底归 0，避免出现负数 */
  private async decrementCount(
    tx: Prisma.TransactionClient,
    type: PrismaLikeTargetType,
    targetId: string,
  ) {
    const dec =
      type === PrismaLikeTargetType.post
        ? await tx.post.updateMany({
            where: { id: targetId, likeCount: { gte: 1 } },
            data: { likeCount: { decrement: 1 } },
          })
        : await tx.comment.updateMany({
            where: { id: targetId, likeCount: { gte: 1 } },
            data: { likeCount: { decrement: 1 } },
          });
    if (dec.count > 0) return;
    if (type === PrismaLikeTargetType.post) {
      await tx.post.updateMany({
        where: { id: targetId, likeCount: { lt: 1 } },
        data: { likeCount: 0 },
      });
    } else {
      await tx.comment.updateMany({
        where: { id: targetId, likeCount: { lt: 1 } },
        data: { likeCount: 0 },
      });
    }
  }

  private isUniqueConstraint(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    );
  }
}

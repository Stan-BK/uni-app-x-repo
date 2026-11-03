import { Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, AuditTargetType } from "@activity/shared";
import { CommunityDeletedBy } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AdminCommunityService {
  constructor(private readonly prisma: PrismaService) {}

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

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
}

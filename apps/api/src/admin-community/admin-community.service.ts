import { Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, AuditTargetType } from "@activity/shared";
import { CommunityDeletedBy } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AdminCommunityService {
  constructor(private readonly prisma: PrismaService) {}

  /** Admin 软删动态；不存在或已删均返回 404 */
  async softDeletePost(id: string, adminId: string): Promise<void> {
    const post = await this.prisma.post.findUnique({
      where: { id },
      select: { id: true, deletedAt: true },
    });
    if (!post) throw new NotFoundException("动态不存在");
    if (post.deletedAt) throw new NotFoundException("动态已删除");

    await this.prisma.$transaction(async (tx) => {
      await tx.post.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          deletedBy: CommunityDeletedBy.admin,
        },
      });
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

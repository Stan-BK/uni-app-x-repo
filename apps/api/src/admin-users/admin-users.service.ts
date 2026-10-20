import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { FreezePublishDto } from "./dto/freeze-publish.dto";

export type ListUsersQuery = {
  page?: number;
  pageSize?: number;
};

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListUsersQuery = {}) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 20));
    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        select: { id: true, nickname: true, canPublish: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      this.prisma.user.count(),
    ]);
    return { items, total, page, pageSize };
  }

  async freezePublish(id: string, adminId: string, dto: FreezePublishDto) {
    await this.requireUser(id);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { canPublish: false },
      });
      await tx.auditLog.create({
        data: {
          actorType: "admin",
          actorId: adminId,
          action: "freeze_publish",
          targetType: "user",
          targetId: id,
          reason: dto.reason,
        },
      });
      return updated;
    });
  }

  async unfreezePublish(id: string, adminId: string, dto: FreezePublishDto) {
    await this.requireUser(id);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { canPublish: true },
      });
      await tx.auditLog.create({
        data: {
          actorType: "admin",
          actorId: adminId,
          action: "unfreeze_publish",
          targetType: "user",
          targetId: id,
          reason: dto.reason,
        },
      });
      return updated;
    });
  }

  private async requireUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException("User not found");
    }
    return user;
  }
}

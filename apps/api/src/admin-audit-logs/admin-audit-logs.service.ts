import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export type ListAuditLogsInput = {
  action?: string;
  targetType?: string;
  targetId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

@Injectable()
export class AdminAuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListAuditLogsInput = {}) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 20));
    const fromDate = query.from ? new Date(query.from) : undefined;
    const toDate = query.to ? new Date(query.to) : undefined;

    if (fromDate && toDate && fromDate > toDate) {
      return { items: [], total: 0, page, pageSize };
    }

    const where: Prisma.AuditLogWhereInput = {
      ...(query.action ? { action: query.action } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(query.targetId ? { targetId: query.targetId } : {}),
      ...(fromDate || toDate
        ? {
            createdAt: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const adminIds = [
      ...new Set(
        rows.filter((r) => r.actorType === "admin").map((r) => r.actorId),
      ),
    ];
    const userIds = [
      ...new Set(
        rows.filter((r) => r.targetType === "user").map((r) => r.targetId),
      ),
    ];
    const activityIds = [
      ...new Set(
        rows.filter((r) => r.targetType === "activity").map((r) => r.targetId),
      ),
    ];

    const [admins, users, activities] = await Promise.all([
      adminIds.length
        ? this.prisma.adminUser.findMany({
            where: { id: { in: adminIds } },
            select: { id: true, displayName: true, email: true },
          })
        : Promise.resolve([]),
      userIds.length
        ? this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, nickname: true },
          })
        : Promise.resolve([]),
      activityIds.length
        ? this.prisma.activity.findMany({
            where: { id: { in: activityIds } },
            select: { id: true, title: true },
          })
        : Promise.resolve([]),
    ]);

    const adminMap = new Map(admins.map((a) => [a.id, a]));
    const userMap = new Map(users.map((u) => [u.id, u]));
    const activityMap = new Map(activities.map((a) => [a.id, a]));

    const items = rows.map((logRow) => {
      const admin = adminMap.get(logRow.actorId);
      let label = "";
      if (logRow.targetType === "user") {
        label = userMap.get(logRow.targetId)?.nickname?.trim() ?? "";
      } else if (logRow.targetType === "activity") {
        label = activityMap.get(logRow.targetId)?.title ?? "";
      }
      return {
        id: logRow.id,
        createdAt: logRow.createdAt,
        action: logRow.action,
        targetType: logRow.targetType,
        targetId: logRow.targetId,
        reason: logRow.reason,
        actor: {
          id: logRow.actorId,
          displayName: admin?.displayName ?? null,
          email: admin?.email ?? null,
        },
        target: { id: logRow.targetId, label },
      };
    });

    return { items, total, page, pageSize };
  }
}

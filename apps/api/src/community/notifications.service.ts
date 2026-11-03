import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { ReadNotificationsDto } from "./dto/read-notifications.dto";
import { authorDisplayName } from "./posts.mapper";
import { normalizePaging } from "./posts.service";

const NOTIFICATION_INCLUDE = {
  actor: { select: { id: true, nickname: true, avatarUrl: true } },
} satisfies Prisma.NotificationInclude;

type NotificationRow = Prisma.NotificationGetPayload<{
  include: typeof NOTIFICATION_INCLUDE;
}>;

export function mapNotification(row: NotificationRow) {
  return {
    id: row.id,
    type: row.type,
    postId: row.postId,
    commentId: row.commentId,
    actor: {
      id: row.actor.id,
      nickname: authorDisplayName(row.actor.nickname),
      avatarUrl: row.actor.avatarUrl,
    },
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export type NotificationDto = ReturnType<typeof mapNotification>;

export type ListNotificationsInput = { page?: number; pageSize?: number };

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(recipientId: string, input: ListNotificationsInput = {}) {
    const { page, pageSize } = normalizePaging(input);
    const where = { recipientId };
    const [rows, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: NOTIFICATION_INCLUDE,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return { items: rows.map(mapNotification), total, page, pageSize };
  }

  async unreadCount(recipientId: string) {
    const count = await this.prisma.notification.count({
      where: { recipientId, readAt: null },
    });
    return { count };
  }

  /**
   * 标记已读：只会更新属于当前用户且未读的行（他人 id 静默忽略，不泄露存在性）。
   * all=true 优先于 ids。
   */
  async markRead(recipientId: string, dto: ReadNotificationsDto) {
    const where: Prisma.NotificationWhereInput = { recipientId, readAt: null };
    if (!dto.all) {
      const ids = [...new Set(dto.ids ?? [])];
      if (ids.length === 0) {
        throw new BadRequestException("请指定 ids 或 all=true");
      }
      where.id = { in: ids };
    }
    const res = await this.prisma.notification.updateMany({
      where,
      data: { readAt: new Date() },
    });
    return { updated: res.count };
  }
}

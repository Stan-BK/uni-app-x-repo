import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  PublicActivityErrorCode,
  PublicActivityOrder,
  PublicActivitySort,
} from "@activity/shared";
import { ActivityLifecycle, RegistrationStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { hostNameFromNickname, toPublicDto } from "./public-activity.mapper";

export type ListPublicQuery = {
  q?: string;
  sort?: string;
  order?: string;
  page?: number;
  pageSize?: number;
};

@Injectable()
export class PublicActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListPublicQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 20));
    const sort = query.sort ?? PublicActivitySort.StartAt;
    if (
      sort !== PublicActivitySort.StartAt &&
      sort !== PublicActivitySort.PublishedAt
    ) {
      throw new BadRequestException("Invalid sort");
    }

    const defaultOrder =
      sort === PublicActivitySort.PublishedAt
        ? PublicActivityOrder.Desc
        : PublicActivityOrder.Asc;
    const order = query.order ?? defaultOrder;
    if (
      order !== PublicActivityOrder.Asc &&
      order !== PublicActivityOrder.Desc
    ) {
      throw new BadRequestException("Invalid order");
    }

    const q = query.q?.trim() ?? "";
    const now = new Date();
    const where = {
      ...this.publicListWhere(now),
      ...(q
        ? { title: { contains: q, mode: "insensitive" as const } }
        : {}),
    };
    const orderBy =
      sort === PublicActivitySort.PublishedAt
        ? { publishedAt: order }
        : { startAt: order };

    const skip = (page - 1) * pageSize;
    const [rows, total] = await Promise.all([
      this.prisma.activity.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
        include: { owner: { select: { nickname: true } } },
      }),
      this.prisma.activity.count({ where }),
    ]);

    const ids = rows.map((row) => row.id);
    const [occupiedByActivity, attendeesByActivity] = await Promise.all([
      this.countOccupiedByActivityIds(ids),
      this.listConfirmedAttendeesByActivityIds(ids, 3),
    ]);

    return {
      items: rows.map((row) =>
        toPublicDto(row, {
          includeRules: false,
          now,
          confirmedCount: 0,
          occupiedCount: occupiedByActivity.get(row.id) ?? 0,
          attendees: attendeesByActivity.get(row.id) ?? [],
        }),
      ),
      total,
      page,
      pageSize,
    };
  }

  async getById(id: string) {
    const row = await this.prisma.activity.findUnique({
      where: { id },
      include: { owner: { select: { nickname: true } } },
    });
    if (!row || row.lifecycle === ActivityLifecycle.draft) {
      throw new NotFoundException("活动不存在");
    }
    if (row.lifecycle === ActivityLifecycle.cancelled) {
      throw new NotFoundException({
        message: "活动已取消",
        code: PublicActivityErrorCode.Cancelled,
      });
    }
    if (row.lifecycle === ActivityLifecycle.removed) {
      throw new NotFoundException({
        message: "活动已下架",
        code: PublicActivityErrorCode.Removed,
      });
    }
    if (row.lifecycle !== ActivityLifecycle.published) {
      throw new NotFoundException("活动不存在");
    }
    const [confirmedCount, occupiedCount, attendeeRows] = await Promise.all([
      this.prisma.registration.count({
        where: { activityId: row.id, status: RegistrationStatus.confirmed },
      }),
      this.prisma.registration.count({
        where: {
          activityId: row.id,
          status: {
            in: [
              RegistrationStatus.confirmed,
              RegistrationStatus.pending_payment,
            ],
          },
        },
      }),
      this.prisma.registration.findMany({
        where: { activityId: row.id, status: RegistrationStatus.confirmed },
        orderBy: { createdAt: "asc" },
        take: 20,
        select: {
          user: { select: { nickname: true, avatarUrl: true } },
        },
      }),
    ]);
    return toPublicDto(row, {
      includeRules: true,
      confirmedCount,
      occupiedCount,
      attendees: attendeeRows.map((item) => this.mapAttendee(item.user)),
    });
  }

  async listHot(limit = 3) {
    const now = new Date();
    const rows = await this.prisma.activity.findMany({
      where: this.publicListWhere(now),
      include: { owner: { select: { nickname: true } } },
    });
    const ids = rows.map((row) => row.id);
    const [confirmedByActivity, occupiedByActivity, attendeesByActivity] =
      await Promise.all([
        this.countConfirmedByActivityIds(ids),
        this.countOccupiedByActivityIds(ids),
        this.listConfirmedAttendeesByActivityIds(ids, 3),
      ]);
    return [...rows]
      .sort((a, b) => {
        const countDiff =
          (confirmedByActivity.get(b.id) ?? 0) -
          (confirmedByActivity.get(a.id) ?? 0);
        if (countDiff !== 0) return countDiff;
        return (
          (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0)
        );
      })
      .slice(0, limit)
      .map((row) =>
        toPublicDto(row, {
          includeRules: false,
          now,
          confirmedCount: confirmedByActivity.get(row.id) ?? 0,
          occupiedCount: occupiedByActivity.get(row.id) ?? 0,
          attendees: attendeesByActivity.get(row.id) ?? [],
        }),
      );
  }

  private publicListWhere(now: Date) {
    return {
      lifecycle: ActivityLifecycle.published,
      endAt: { gt: now },
    };
  }

  private mapAttendee(user: {
    nickname: string | null;
    avatarUrl: string | null;
  }) {
    return {
      nickname: hostNameFromNickname(user.nickname),
      avatarUrl: user.avatarUrl ?? null,
    };
  }

  private async listConfirmedAttendeesByActivityIds(
    activityIds: string[],
    takePerActivity: number,
  ) {
    const grouped = new Map<
      string,
      { nickname: string; avatarUrl: string | null }[]
    >();
    if (activityIds.length === 0) return grouped;
    const rows = await this.prisma.registration.findMany({
      where: {
        activityId: { in: activityIds },
        status: RegistrationStatus.confirmed,
      },
      orderBy: { createdAt: "asc" },
      select: {
        activityId: true,
        user: { select: { nickname: true, avatarUrl: true } },
      },
    });
    for (const row of rows) {
      const list = grouped.get(row.activityId) ?? [];
      if (list.length >= takePerActivity) continue;
      list.push(this.mapAttendee(row.user));
      grouped.set(row.activityId, list);
    }
    return grouped;
  }

  private async countConfirmedByActivityIds(activityIds: string[]) {
    if (activityIds.length === 0) return new Map<string, number>();
    const groups = await this.prisma.registration.groupBy({
      by: ["activityId"],
      where: {
        activityId: { in: activityIds },
        status: RegistrationStatus.confirmed,
      },
      _count: { _all: true },
    });
    return new Map(groups.map((g) => [g.activityId, g._count._all]));
  }

  private async countOccupiedByActivityIds(activityIds: string[]) {
    if (activityIds.length === 0) return new Map<string, number>();
    const groups = await this.prisma.registration.groupBy({
      by: ["activityId"],
      where: {
        activityId: { in: activityIds },
        status: {
          in: [
            RegistrationStatus.confirmed,
            RegistrationStatus.pending_payment,
          ],
        },
      },
      _count: { _all: true },
    });
    return new Map(groups.map((g) => [g.activityId, g._count._all]));
  }
}

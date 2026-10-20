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
import { toPublicDto } from "./public-activity.mapper";

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
      lifecycle: ActivityLifecycle.published,
      endAt: { gt: now },
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

    const confirmedByActivity = await this.countConfirmedByActivityIds(
      rows.map((row) => row.id),
    );

    return {
      items: rows.map((row) =>
        toPublicDto(row, {
          includeRules: false,
          now,
          confirmedCount: confirmedByActivity.get(row.id) ?? 0,
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
    const confirmedCount = await this.prisma.registration.count({
      where: { activityId: row.id, status: RegistrationStatus.confirmed },
    });
    return toPublicDto(row, { includeRules: true, confirmedCount });
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
}

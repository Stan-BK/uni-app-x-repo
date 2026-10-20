import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { RegistrationErrorCode } from "@activity/shared";
import {
  ActivityLifecycle,
  FeeType,
  Prisma,
  RegistrationStatus,
  type Activity,
} from "@prisma/client";
import { computeDisplayStatus } from "../public-activities/public-activity.mapper";
import { PrismaService } from "../prisma/prisma.service";
import { toRegistrationDto } from "./registration.mapper";

export type CreateRegistrationInput = {
  activityId: string;
  name: string;
  phone: string;
};

export type ListMineQuery = {
  page?: number;
  pageSize?: number;
  status?: string;
  activityId?: string;
};

type LockedActivity = Pick<
  Activity,
  | "id"
  | "lifecycle"
  | "feeType"
  | "capacity"
  | "startAt"
  | "endAt"
  | "registrationDeadlineAt"
  | "allowUserCancel"
>;

@Injectable()
export class RegistrationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, input: CreateRegistrationInput) {
    const name = input.name?.trim() ?? "";
    if (name.length < 1 || name.length > 32) {
      throw new BadRequestException("姓名长度须为 1～32");
    }
    const phone = input.phone?.trim() ?? "";
    if (!/^1\d{10}$/.test(phone)) {
      throw new BadRequestException("手机号格式不正确");
    }
    const { activityId } = input;

    return this.prisma.$transaction(async (tx) => {
      const activity = await this.lockActivity(tx, activityId);
      if (!activity) {
        throw new NotFoundException("活动不存在");
      }
      this.assertActivityOpenable(activity);

      const existing = await tx.registration.findUnique({
        where: { userId_activityId: { userId, activityId } },
      });
      if (existing?.status === RegistrationStatus.confirmed) {
        return toRegistrationDto(existing);
      }

      const confirmedCount = await tx.registration.count({
        where: { activityId, status: RegistrationStatus.confirmed },
      });
      if (confirmedCount >= activity.capacity) {
        throw new ConflictException({
          message: "名额已满",
          code: RegistrationErrorCode.ActivityFull,
        });
      }

      if (existing?.status === RegistrationStatus.cancelled) {
        const updated = await tx.registration.update({
          where: { id: existing.id },
          data: {
            status: RegistrationStatus.confirmed,
            name,
            phone,
            cancelledAt: null,
          },
        });
        return toRegistrationDto(updated);
      }

      const created = await tx.registration.create({
        data: {
          activityId,
          userId,
          name,
          phone,
          status: RegistrationStatus.confirmed,
        },
      });
      return toRegistrationDto(created);
    });
  }

  async cancel(userId: string, id: string) {
    const row = await this.prisma.registration.findUnique({
      where: { id },
      include: {
        activity: {
          select: {
            id: true,
            lifecycle: true,
            feeType: true,
            capacity: true,
            startAt: true,
            endAt: true,
            registrationDeadlineAt: true,
            allowUserCancel: true,
          },
        },
      },
    });
    if (!row) {
      throw new NotFoundException("报名不存在");
    }
    if (row.userId !== userId) {
      throw new ForbiddenException("无权取消该报名");
    }
    if (row.status === RegistrationStatus.cancelled) {
      return toRegistrationDto(row);
    }
    if (this.isEnded(row.activity.endAt)) {
      throw new ConflictException({
        message: "活动已结束，无法取消报名",
        code: RegistrationErrorCode.ActivityEnded,
      });
    }
    if (!row.activity.allowUserCancel) {
      throw new ConflictException({
        message: "该活动不允许取消报名",
        code: RegistrationErrorCode.CancelNotAllowed,
      });
    }
    if (row.status !== RegistrationStatus.confirmed) {
      throw new ConflictException({
        message: "当前状态不可取消",
        code: RegistrationErrorCode.NotCancellable,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await this.lockActivity(tx, row.activityId);
      const updated = await tx.registration.update({
        where: { id },
        data: {
          status: RegistrationStatus.cancelled,
          cancelledAt: new Date(),
        },
      });
      return toRegistrationDto(updated);
    });
  }

  async listMine(userId: string, query: ListMineQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 20));
    const where: Prisma.RegistrationWhereInput = {
      userId,
      ...(query.status
        ? { status: query.status as RegistrationStatus }
        : {}),
      ...(query.activityId ? { activityId: query.activityId } : {}),
    };
    const skip = (page - 1) * pageSize;
    const now = new Date();
    const [rows, total] = await Promise.all([
      this.prisma.registration.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: {
          activity: {
            select: {
              id: true,
              title: true,
              coverUrl: true,
              startAt: true,
              endAt: true,
              place: true,
              capacity: true,
              allowUserCancel: true,
              registrationDeadlineAt: true,
              refundable: true,
            },
          },
        },
      }),
      this.prisma.registration.count({ where }),
    ]);

    const activityIds = [...new Set(rows.map((row) => row.activity.id))];
    const confirmedByActivity =
      activityIds.length === 0
        ? new Map<string, number>()
        : new Map(
            (
              await this.prisma.registration.groupBy({
                by: ["activityId"],
                where: {
                  activityId: { in: activityIds },
                  status: RegistrationStatus.confirmed,
                },
                _count: { _all: true },
              })
            ).map((g) => [g.activityId, g._count._all]),
          );

    return {
      items: rows.map((row) => ({
        ...toRegistrationDto(row),
        activity: {
          id: row.activity.id,
          title: row.activity.title,
          coverUrl: row.activity.coverUrl,
          startAt: row.activity.startAt?.toISOString() ?? null,
          endAt: row.activity.endAt?.toISOString() ?? null,
          place: row.activity.place,
          allowUserCancel: row.activity.allowUserCancel,
          refundable: row.activity.refundable,
          registrationDeadlineAt:
            (
              row.activity.registrationDeadlineAt ?? row.activity.startAt
            )?.toISOString() ?? null,
          displayStatus: computeDisplayStatus(
            row.activity.startAt,
            row.activity.endAt,
            confirmedByActivity.get(row.activity.id) ?? 0,
            row.activity.capacity,
            now,
            row.activity.registrationDeadlineAt,
          ),
        },
      })),
      total,
      page,
      pageSize,
    };
  }

  async listForOrganizer(
    userId: string,
    activityId: string,
    query: ListMineQuery,
  ) {
    const organizer = await this.prisma.organizer.findUnique({
      where: { ownerUserId: userId },
    });
    const activity = await this.prisma.activity.findUnique({
      where: { id: activityId },
    });
    if (!activity) {
      throw new NotFoundException("活动不存在");
    }
    if (!organizer || activity.organizerId !== organizer.id) {
      throw new ForbiddenException("无权查看该活动报名名单");
    }

    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 20));
    const where: Prisma.RegistrationWhereInput = {
      activityId,
      ...(query.status
        ? { status: query.status as RegistrationStatus }
        : {}),
    };
    const skip = (page - 1) * pageSize;
    const [rows, total] = await Promise.all([
      this.prisma.registration.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      this.prisma.registration.count({ where }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        name: row.name,
        phone: row.phone,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        cancelledAt: row.cancelledAt?.toISOString() ?? null,
      })),
      total,
      page,
      pageSize,
    };
  }

  private async lockActivity(
    tx: Prisma.TransactionClient,
    activityId: string,
  ): Promise<LockedActivity | null> {
    const rows = await tx.$queryRaw<LockedActivity[]>`
      SELECT id, lifecycle, "feeType", capacity, "startAt", "endAt",
             "registrationDeadlineAt", "allowUserCancel"
      FROM "Activity"
      WHERE id = ${activityId}
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  private assertActivityOpenable(activity: LockedActivity) {
    if (activity.lifecycle !== ActivityLifecycle.published) {
      throw new ConflictException({
        message: "活动当前不可报名",
        code: RegistrationErrorCode.ActivityNotOpenable,
      });
    }
    if (this.isEnded(activity.endAt)) {
      throw new ConflictException({
        message: "活动已结束",
        code: RegistrationErrorCode.ActivityEnded,
      });
    }
    const deadline = activity.registrationDeadlineAt ?? activity.startAt;
    if (deadline && new Date() >= new Date(deadline)) {
      throw new ConflictException({
        message: "报名已截止",
        code: RegistrationErrorCode.RegistrationClosed,
      });
    }
    if (activity.feeType === FeeType.paid) {
      throw new ConflictException({
        message: "收费活动暂不支持在线报名",
        code: RegistrationErrorCode.PaidNotSupported,
      });
    }
  }

  private isEnded(endAt: Date | null | undefined): boolean {
    if (!endAt) return false;
    return new Date() >= new Date(endAt);
  }
}

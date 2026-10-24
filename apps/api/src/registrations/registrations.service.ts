import { randomBytes } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  BusinessEvent,
  PHONE_PATTERN,
  REAL_NAME_MAX_LENGTH,
  RegistrationErrorCode,
} from "@activity/shared";
import {
  ActivityLifecycle,
  FeeType,
  IdentityProvider,
  PaymentOrderStatus,
  Prisma,
  RegistrationStatus,
  type Activity,
  type Registration,
} from "@prisma/client";
import { logBusinessEvent } from "../common/log-business-event";
import { computeDisplayStatus } from "../public-activities/public-activity.mapper";
import { PAYMENT_HOLD_MS } from "../payments/payment.constants";
import { PaymentsService } from "../payments/payments.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  toRegistrationDto,
  type CreateRegistrationDto,
} from "./registration.mapper";

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
  | "feeCents"
  | "title"
  | "capacity"
  | "startAt"
  | "endAt"
  | "registrationDeadlineAt"
  | "allowUserCancel"
>;

type PaidPreparePayload = {
  registrationId: string;
  amountCents: number;
  description: string;
  payerOpenId: string;
  dto: CreateRegistrationDto;
};

type CreateTxResult =
  | { kind: "return"; dto: CreateRegistrationDto }
  | { kind: "paid_prepare"; payload: PaidPreparePayload };

function newPaymentOutTradeNo(): string {
  return `PO${randomBytes(12).toString("hex")}`;
}

@Injectable()
export class RegistrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsService: PaymentsService,
  ) {}

  async create(userId: string, input: CreateRegistrationInput) {
    const name = input.name?.trim() ?? "";
    if (name.length < 1 || name.length > REAL_NAME_MAX_LENGTH) {
      throw new BadRequestException("姓名长度须为 1～32");
    }
    const phone = input.phone?.trim() ?? "";
    if (!PHONE_PATTERN.test(phone)) {
      throw new BadRequestException("手机号格式不正确");
    }
    const { activityId } = input;
    const now = new Date();

    const confirmedAfterClose =
      await this.reconcileExpiredPendingPayment(userId, activityId, now);
    if (confirmedAfterClose) {
      return confirmedAfterClose;
    }

    const txResult = await this.prisma.$transaction(async (tx) => {
      const activity = await this.lockActivity(tx, activityId);
      if (!activity) {
        throw new NotFoundException("活动不存在");
      }
      this.assertActivityOpenable(activity, now);

      let existing = await tx.registration.findUnique({
        where: { userId_activityId: { userId, activityId } },
      });

      if (existing?.status === RegistrationStatus.confirmed) {
        return {
          kind: "return",
          dto: this.toCreateDto(existing, {
            alreadyRegistered: true,
            pay: null,
            paymentStatus: null,
          }),
        } satisfies CreateTxResult;
      }

      if (existing?.status === RegistrationStatus.pending_payment) {
        const pendingOrder = await tx.paymentOrder.findFirst({
          where: {
            registrationId: existing.id,
            status: PaymentOrderStatus.pending,
          },
        });
        if (pendingOrder && pendingOrder.expireAt > now) {
          if (activity.feeType !== FeeType.paid) {
            throw new ConflictException({
              message: "当前状态不可继续报名",
              code: RegistrationErrorCode.NotCancellable,
            });
          }
          const identity = await tx.userIdentity.findFirst({
            where: { userId, provider: IdentityProvider.weixin },
          });
          if (!identity) {
            throw new BadRequestException("请使用微信登录后再支付");
          }
          return {
            kind: "paid_prepare",
            payload: {
              registrationId: existing.id,
              amountCents: activity.feeCents,
              description: activity.title,
              payerOpenId: identity.openId,
              dto: this.toCreateDto(existing, {
                alreadyRegistered: false,
              }),
            },
          } satisfies CreateTxResult;
        }
        if (pendingOrder && pendingOrder.expireAt <= now) {
          throw new ConflictException({
            message: "支付关单未完成，请稍后重试",
          });
        }
      }

      const occupiedCount = await tx.registration.count({
        where: {
          activityId,
          status: {
            in: [
              RegistrationStatus.confirmed,
              RegistrationStatus.pending_payment,
            ],
          },
        },
      });
      if (occupiedCount >= activity.capacity) {
        throw new ConflictException({
          message: "名额已满",
          code: RegistrationErrorCode.ActivityFull,
        });
      }

      if (activity.feeType === FeeType.free) {
        return {
          kind: "return",
          dto: await this.confirmFreeRegistration(
            tx,
            userId,
            activityId,
            name,
            phone,
            existing,
          ),
        } satisfies CreateTxResult;
      }

      const identity = await tx.userIdentity.findFirst({
        where: { userId, provider: IdentityProvider.weixin },
      });
      if (!identity) {
        throw new BadRequestException("请使用微信登录后再支付");
      }

      let registration: Registration;
      if (existing?.status === RegistrationStatus.cancelled) {
        registration = await tx.registration.update({
          where: { id: existing.id },
          data: {
            status: RegistrationStatus.pending_payment,
            name,
            phone,
            cancelledAt: null,
          },
        });
      } else {
        registration = await tx.registration.create({
          data: {
            activityId,
            userId,
            name,
            phone,
            status: RegistrationStatus.pending_payment,
          },
        });
        logBusinessEvent({
          event: BusinessEvent.RegistrationCreate,
          actorId: userId,
          targetId: registration.id,
        });
      }

      const expireAt = new Date(now.getTime() + PAYMENT_HOLD_MS);
      await tx.paymentOrder.create({
        data: {
          registrationId: registration.id,
          outTradeNo: newPaymentOutTradeNo(),
          amountCents: activity.feeCents,
          status: PaymentOrderStatus.pending,
          expireAt,
        },
      });

      return {
        kind: "paid_prepare",
        payload: {
          registrationId: registration.id,
          amountCents: activity.feeCents,
          description: activity.title,
          payerOpenId: identity.openId,
          dto: this.toCreateDto(registration, { alreadyRegistered: false }),
        },
      } satisfies CreateTxResult;
    });

    if (txResult.kind === "return") {
      return txResult.dto;
    }

    return this.finishPaidPrepare(txResult.payload);
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

  async listForOwner(
    userId: string,
    activityId: string,
    query: ListMineQuery,
  ) {
    const activity = await this.prisma.activity.findUnique({
      where: { id: activityId },
    });
    if (!activity) {
      throw new NotFoundException("活动不存在");
    }
    if (activity.ownerUserId !== userId) {
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
        include: { user: { select: { nickname: true, avatarUrl: true } } },
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
        nickname: row.user.nickname?.trim() || row.name || "用户",
        avatarUrl: row.user.avatarUrl,
      })),
      total,
      page,
      pageSize,
    };
  }

  private async reconcileExpiredPendingPayment(
    userId: string,
    activityId: string,
    now: Date,
  ): Promise<CreateRegistrationDto | null> {
    const existing = await this.prisma.registration.findUnique({
      where: { userId_activityId: { userId, activityId } },
    });
    if (existing?.status !== RegistrationStatus.pending_payment) {
      return null;
    }

    const pendingOrder = await this.prisma.paymentOrder.findFirst({
      where: {
        registrationId: existing.id,
        status: PaymentOrderStatus.pending,
      },
    });
    if (!pendingOrder || pendingOrder.expireAt > now) {
      return null;
    }

    await this.paymentsService.closeIfExpired(pendingOrder.id, now);

    const refreshed = await this.prisma.registration.findUnique({
      where: { userId_activityId: { userId, activityId } },
    });
    if (refreshed?.status === RegistrationStatus.confirmed) {
      return this.toCreateDto(refreshed, {
        alreadyRegistered: true,
        pay: null,
        paymentStatus: "paid",
      });
    }
    if (refreshed?.status === RegistrationStatus.pending_payment) {
      const stillPendingOrder = await this.prisma.paymentOrder.findFirst({
        where: {
          registrationId: refreshed.id,
          status: PaymentOrderStatus.pending,
        },
      });
      if (stillPendingOrder && stillPendingOrder.expireAt <= now) {
        throw new ConflictException({
          message: "支付关单未完成，请稍后重试",
        });
      }
    }
    return null;
  }

  private async confirmFreeRegistration(
    tx: Prisma.TransactionClient,
    userId: string,
    activityId: string,
    name: string,
    phone: string,
    existing: Registration | null,
  ): Promise<CreateRegistrationDto> {
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
      return this.toCreateDto(updated, {
        alreadyRegistered: false,
        pay: null,
        paymentStatus: null,
      });
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
    logBusinessEvent({
      event: BusinessEvent.RegistrationCreate,
      actorId: userId,
      targetId: created.id,
    });
    return this.toCreateDto(created, {
      alreadyRegistered: false,
      pay: null,
      paymentStatus: null,
    });
  }

  private async finishPaidPrepare(
    payload: PaidPreparePayload,
  ): Promise<CreateRegistrationDto> {
    if (!this.paymentsService.isWechatPayConfigured()) {
      await this.releasePendingPaidRegistration(payload.registrationId);
      throw new ServiceUnavailableException({
        message: "支付未配置",
        code: RegistrationErrorCode.PaymentUnavailable,
      });
    }

    const prepared = await this.paymentsService.prepare(
      payload.registrationId,
      {
        amountCents: payload.amountCents,
        description: payload.description,
        payerOpenId: payload.payerOpenId,
      },
    );

    return {
      ...payload.dto,
      pay: prepared.pay,
      paymentStatus: prepared.status,
    };
  }

  private async releasePendingPaidRegistration(
    registrationId: string,
  ): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.paymentOrder.findFirst({
        where: {
          registrationId,
          status: PaymentOrderStatus.pending,
        },
      });
      if (order) {
        await tx.paymentOrder.update({
          where: { id: order.id },
          data: {
            status: PaymentOrderStatus.closed,
            closedAt: now,
          },
        });
      }
      await tx.registration.update({
        where: { id: registrationId },
        data: {
          status: RegistrationStatus.cancelled,
          cancelledAt: now,
        },
      });
    });
  }

  private toCreateDto(
    row: Registration,
    extra: Pick<CreateRegistrationDto, "alreadyRegistered"> &
      Partial<Pick<CreateRegistrationDto, "pay" | "paymentStatus">>,
  ): CreateRegistrationDto {
    return {
      ...toRegistrationDto(row),
      ...extra,
    };
  }

  private async lockActivity(
    tx: Prisma.TransactionClient,
    activityId: string,
  ): Promise<LockedActivity | null> {
    const rows = await tx.$queryRaw<LockedActivity[]>`
      SELECT id, lifecycle, "feeType", "feeCents", title, capacity, "startAt", "endAt",
             "registrationDeadlineAt", "allowUserCancel"
      FROM "Activity"
      WHERE id = ${activityId}
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  private assertActivityOpenable(activity: LockedActivity, now: Date) {
    if (activity.lifecycle !== ActivityLifecycle.published) {
      throw new ConflictException({
        message: "活动当前不可报名",
        code: RegistrationErrorCode.ActivityNotOpenable,
      });
    }
    if (this.isEnded(activity.endAt, now)) {
      throw new ConflictException({
        message: "活动已结束",
        code: RegistrationErrorCode.ActivityEnded,
      });
    }
    const deadline = activity.registrationDeadlineAt ?? activity.startAt;
    if (deadline && now >= new Date(deadline)) {
      throw new ConflictException({
        message: "报名已截止",
        code: RegistrationErrorCode.RegistrationClosed,
      });
    }
  }

  private isEnded(endAt: Date | null | undefined, now = new Date()): boolean {
    if (!endAt) return false;
    return now >= new Date(endAt);
  }
}

import { randomBytes } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RegistrationErrorCode } from "@activity/shared";
import {
  PaymentOrderStatus,
  Prisma,
  RefundReason,
  RefundStatus,
  RegistrationStatus,
  type PaymentOrder,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { ClientPayParams, WechatPayPort } from "./wechat-pay.port";
import { WechatOutTradeNoUsedError } from "./wechat-pay.port";

export type PaymentsServiceOptions = {
  wechatPayMchId?: string;
  wechatPayAppId?: string;
};

function newOutTradeNo(): string {
  return `PO${randomBytes(12).toString("hex")}`;
}

function newOutRefundNo(): string {
  return `RF${randomBytes(12).toString("hex")}`;
}

type PaymentOrderWithRegistration = PaymentOrder & {
  registration: { id: string; status: RegistrationStatus };
};

@Injectable()
export class PaymentsService {
  private readonly wechatPayMchId: string;
  private readonly wechatPayAppId: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly wechatPay: WechatPayPort,
    config: ConfigService,
    options?: PaymentsServiceOptions,
  ) {
    this.wechatPayMchId =
      options?.wechatPayMchId ??
      config.get<string>("WECHAT_PAY_MCH_ID") ??
      "";
    this.wechatPayAppId =
      options?.wechatPayAppId ??
      config.get<string>("WECHAT_PAY_APP_ID") ??
      "";
  }

  isWechatPayConfigured(): boolean {
    return Boolean(this.wechatPayAppId && this.wechatPayMchId);
  }

  async syncRegistrationPayment(
    registrationId: string,
  ): Promise<{ paymentStatus: "pending" | "paid" }> {
    const pending = await this.prisma.paymentOrder.findFirst({
      where: {
        registrationId,
        status: PaymentOrderStatus.pending,
      },
      orderBy: { createdAt: "desc" },
    });
    const order =
      pending ??
      (await this.prisma.paymentOrder.findFirst({
        where: { registrationId },
        orderBy: { createdAt: "desc" },
      }));
    if (!order) {
      throw new NotFoundException("支付单不存在");
    }

    if (order.status === PaymentOrderStatus.paid) {
      return { paymentStatus: "paid" };
    }

    const query = await this.wechatPay.query(order.outTradeNo);
    if (query.tradeState === "SUCCESS") {
      await this.confirmPaid({
        outTradeNo: order.outTradeNo,
        amountCents: query.amountCents ?? order.amountCents,
        transactionId: query.transactionId ?? `wx-${order.outTradeNo}`,
        appId: this.wechatPayAppId,
        mchId: this.wechatPayMchId,
      });
      return { paymentStatus: "paid" };
    }

    const refreshed = await this.prisma.paymentOrder.findUnique({
      where: { id: order.id },
    });
    if (refreshed?.status === PaymentOrderStatus.paid) {
      return { paymentStatus: "paid" };
    }

    return { paymentStatus: "pending" };
  }

  async prepare(
    registrationId: string,
    input: {
      amountCents: number;
      description: string;
      payerOpenId: string;
      now?: Date;
    },
  ): Promise<{ status: "pending" | "paid"; pay: ClientPayParams | null }> {
    const order = await this.prisma.paymentOrder.findFirst({
      where: {
        registrationId,
        status: PaymentOrderStatus.pending,
      },
      include: { registration: true },
    });
    if (!order) {
      throw new NotFoundException("支付单不存在");
    }
    if (order.registration.status !== RegistrationStatus.pending_payment) {
      throw new BadRequestException("报名状态不可支付");
    }

    const query = await this.wechatPay.query(order.outTradeNo);
    if (query.tradeState === "SUCCESS") {
      const confirmed = await this.confirmPaidInTransaction(
        order,
        query.transactionId ?? `wx-${order.outTradeNo}`,
        query.amountCents ?? order.amountCents,
      );
      if (confirmed) {
        return { status: "paid", pay: null };
      }
      throw new ConflictException({
        message: "支付确认失败",
        code: RegistrationErrorCode.PaymentMismatch,
      });
    }

    if (order.prepayId) {
      return {
        status: "pending",
        pay: this.wechatPay.clientParams(order.prepayId),
      };
    }

    const ensured = await this.ensurePrepayId(order, input);
    if (ensured.status === "paid") {
      return { status: "paid", pay: null };
    }
    if (ensured.status === "failed") {
      throw new ConflictException({
        message: "支付确认失败",
        code: RegistrationErrorCode.PaymentMismatch,
      });
    }
    return {
      status: "pending",
      pay: this.wechatPay.clientParams(ensured.order.prepayId!),
    };
  }

  async confirmPaid(input: {
    outTradeNo: string;
    amountCents: number;
    transactionId: string;
    appId: string;
    mchId: string;
  }): Promise<void> {
    const existing = await this.prisma.paymentOrder.findUnique({
      where: { outTradeNo: input.outTradeNo },
    });
    if (existing?.status === PaymentOrderStatus.paid) {
      return;
    }

    this.assertWechatConfigMatch(input.appId, input.mchId);

    await this.prisma.$transaction(async (tx) => {
      const order = await tx.paymentOrder.findUnique({
        where: { outTradeNo: input.outTradeNo },
        include: { registration: true },
      });
      if (!order) {
        throw new NotFoundException("支付单不存在");
      }

      if (order.status === PaymentOrderStatus.paid) {
        return;
      }

      this.assertAmountMatch(order.amountCents, input.amountCents);

      if (
        order.status !== PaymentOrderStatus.pending &&
        order.status !== PaymentOrderStatus.closed
      ) {
        throw new ConflictException({
          message: "支付单状态不可确认",
          code: RegistrationErrorCode.PaymentMismatch,
        });
      }

      const now = new Date();
      await tx.paymentOrder.update({
        where: { id: order.id },
        data: {
          status: PaymentOrderStatus.paid,
          transactionId: input.transactionId,
          paidAt: now,
          closedAt: null,
        },
      });
      await tx.registration.update({
        where: { id: order.registrationId },
        data: {
          status: RegistrationStatus.confirmed,
          cancelledAt: null,
        },
      });
    });
  }

  async closeIfExpired(
    paymentOrderId: string,
    now = new Date(),
  ): Promise<void> {
    const order = await this.prisma.paymentOrder.findUnique({
      where: { id: paymentOrderId },
      include: { registration: true },
    });
    if (!order || order.status !== PaymentOrderStatus.pending) {
      return;
    }
    if (now < order.expireAt) {
      return;
    }
    await this.closePendingOrder(order, now);
  }

  async closeUnpaidForActivity(activityId: string): Promise<void> {
    const orders = await this.prisma.paymentOrder.findMany({
      where: {
        status: PaymentOrderStatus.pending,
        registration: {
          activityId,
          status: RegistrationStatus.pending_payment,
        },
      },
      include: { registration: true },
    });
    const now = new Date();
    for (const order of orders) {
      await this.closePendingOrder(order, now);
    }
  }

  async refundPaid(
    paymentOrderId: string,
    reason: "user_cancel" | "activity_closed",
  ): Promise<void> {
    const order = await this.prisma.paymentOrder.findUnique({
      where: { id: paymentOrderId },
      include: {
        refund: true,
        registration: {
          include: {
            activity: {
              include: { settlement: true },
            },
          },
        },
      },
    });
    if (!order) {
      throw new NotFoundException("支付单不存在");
    }
    if (order.status !== PaymentOrderStatus.paid) {
      throw new BadRequestException("仅已支付订单可退款");
    }

    const activity = order.registration.activity;
    if (activity.settlement) {
      throw new ConflictException({
        message: "活动已结算，不可退款",
        code: RegistrationErrorCode.RefundNotAllowed,
      });
    }
    const now = new Date();
    if (
      reason === "user_cancel" &&
      activity.endAt !== null &&
      now >= activity.endAt
    ) {
      throw new ConflictException({
        message: "活动已结束，不可退款",
        code: RegistrationErrorCode.RefundNotAllowed,
      });
    }

    const refundReason =
      reason === "user_cancel"
        ? RefundReason.user_cancel
        : RefundReason.activity_closed;

    let refundId: string;
    let outRefundNo: string;

    if (
      order.refund &&
      (order.refund.status === RefundStatus.processing ||
        order.refund.status === RefundStatus.failed)
    ) {
      refundId = order.refund.id;
      outRefundNo = order.refund.outRefundNo;
    } else if (order.refund?.status === RefundStatus.succeeded) {
      return;
    } else {
      outRefundNo = newOutRefundNo();
      try {
        const created = await this.prisma.refund.create({
          data: {
            paymentOrderId: order.id,
            outRefundNo,
            amountCents: order.amountCents,
            status: RefundStatus.processing,
            reason: refundReason,
          },
        });
        refundId = created.id;
      } catch (error) {
        if (!this.isUniqueConstraint(error)) {
          throw error;
        }
        const existing = await this.prisma.refund.findUnique({
          where: { paymentOrderId: order.id },
        });
        if (!existing) {
          throw error;
        }
        if (existing.status === RefundStatus.succeeded) {
          return;
        }
        refundId = existing.id;
        outRefundNo = existing.outRefundNo;
      }
    }

    const result = await this.wechatPay.refund({
      outRefundNo,
      outTradeNo: order.outTradeNo,
      amountCents: order.amountCents,
    });

    if (result === "succeeded") {
      const now = new Date();
      await this.prisma.$transaction(async (tx) => {
        await tx.refund.update({
          where: { id: refundId },
          data: { status: RefundStatus.succeeded },
        });
        await tx.paymentOrder.update({
          where: { id: order.id },
          data: { status: PaymentOrderStatus.refunded },
        });
        await tx.registration.update({
          where: { id: order.registrationId },
          data: {
            status: RegistrationStatus.cancelled,
            cancelledAt: now,
          },
        });
      });
      return;
    }

    if (result === "failed") {
      await this.prisma.refund.update({
        where: { id: refundId },
        data: { status: RefundStatus.failed },
      });
    }
  }

  private async ensurePrepayId(
    order: PaymentOrderWithRegistration,
    input: {
      amountCents: number;
      description: string;
      payerOpenId: string;
    },
  ): Promise<
    | { status: "paid" }
    | { status: "pending"; order: PaymentOrder }
    | { status: "failed" }
  > {
    try {
      const { prepayId } = await this.wechatPay.createJsapi({
        outTradeNo: order.outTradeNo,
        amountCents: input.amountCents,
        description: input.description,
        payerOpenId: input.payerOpenId,
        expireAt: order.expireAt,
      });
      const updated = await this.prisma.paymentOrder.update({
        where: { id: order.id },
        data: { prepayId },
      });
      return { status: "pending", order: updated };
    } catch (error) {
      if (!(error instanceof WechatOutTradeNoUsedError)) {
        throw error;
      }
    }

    const staleOutTradeNo = order.outTradeNo;
    const query = await this.wechatPay.query(staleOutTradeNo);
    if (query.tradeState === "SUCCESS") {
      const confirmed = await this.confirmPaidInTransaction(
        order,
        query.transactionId ?? `wx-${staleOutTradeNo}`,
        query.amountCents ?? order.amountCents,
      );
      return confirmed ? { status: "paid" } : { status: "failed" };
    }

    const newOutTradeNoValue = newOutTradeNo();
    const rotated = await this.prisma.paymentOrder.updateMany({
      where: { id: order.id, outTradeNo: staleOutTradeNo },
      data: { outTradeNo: newOutTradeNoValue, prepayId: null },
    });
    if (rotated.count === 0) {
      throw new ConflictException({
        message: "支付单已被其他请求更新，请重试",
        code: RegistrationErrorCode.PaymentMismatch,
      });
    }

    const closeResult = await this.wechatPay.close(staleOutTradeNo);
    if (closeResult === "paid") {
      const afterClose = await this.wechatPay.query(staleOutTradeNo);
      const confirmed = await this.confirmPaidInTransaction(
        order,
        afterClose.transactionId ?? `wx-${staleOutTradeNo}`,
        order.amountCents,
      );
      return confirmed ? { status: "paid" } : { status: "failed" };
    }

    const { prepayId } = await this.wechatPay.createJsapi({
      outTradeNo: newOutTradeNoValue,
      amountCents: input.amountCents,
      description: input.description,
      payerOpenId: input.payerOpenId,
      expireAt: order.expireAt,
    });
    const updated = await this.prisma.paymentOrder.update({
      where: { id: order.id },
      data: { prepayId },
    });
    return { status: "pending", order: updated };
  }

  private async closePendingOrder(
    order: PaymentOrderWithRegistration,
    now: Date,
  ): Promise<void> {
    const query = await this.wechatPay.query(order.outTradeNo);
    if (query.tradeState === "SUCCESS") {
      await this.confirmPaidInTransaction(
        order,
        query.transactionId ?? `wx-${order.outTradeNo}`,
        query.amountCents ?? order.amountCents,
      );
      return;
    }

    try {
      const closeResult = await this.wechatPay.close(order.outTradeNo);
      if (closeResult === "paid") {
        const afterClose = await this.wechatPay.query(order.outTradeNo);
        await this.confirmPaidInTransaction(
          order,
          afterClose.transactionId ?? `wx-${order.outTradeNo}`,
          afterClose.amountCents ?? order.amountCents,
        );
        return;
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.paymentOrder.update({
          where: { id: order.id },
          data: {
            status: PaymentOrderStatus.closed,
            closedAt: now,
          },
        });
        await tx.registration.update({
          where: { id: order.registrationId },
          data: {
            status: RegistrationStatus.cancelled,
            cancelledAt: now,
          },
        });
      });
    } catch {
      // Keep pending_payment; scanner will retry.
    }
  }

  private async confirmPaidInTransaction(
    order: Pick<PaymentOrder, "id" | "registrationId" | "status" | "amountCents">,
    transactionId: string,
    amountCents: number,
  ): Promise<boolean> {
    this.assertAmountMatch(order.amountCents, amountCents);

    let confirmed = false;
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.paymentOrder.findUnique({
        where: { id: order.id },
      });
      if (!current) {
        return;
      }
      if (current.status === PaymentOrderStatus.paid) {
        confirmed = true;
        return;
      }
      if (
        current.status !== PaymentOrderStatus.pending &&
        current.status !== PaymentOrderStatus.closed
      ) {
        return;
      }

      const paidAt = new Date();
      await tx.paymentOrder.update({
        where: { id: order.id },
        data: {
          status: PaymentOrderStatus.paid,
          transactionId,
          paidAt,
          closedAt: null,
        },
      });
      await tx.registration.update({
        where: { id: order.registrationId },
        data: {
          status: RegistrationStatus.confirmed,
          cancelledAt: null,
        },
      });
      confirmed = true;
    });
    return confirmed;
  }

  private isUniqueConstraint(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    );
  }

  private assertWechatConfigMatch(appId: string, mchId: string): void {
    if (appId !== this.wechatPayAppId || mchId !== this.wechatPayMchId) {
      throw new BadRequestException({
        message: "支付回调商户信息不一致",
        code: RegistrationErrorCode.PaymentMismatch,
      });
    }
  }

  private assertAmountMatch(expected: number, actual: number): void {
    if (expected !== actual) {
      throw new ConflictException({
        message: "支付金额不一致",
        code: RegistrationErrorCode.PaymentMismatch,
      });
    }
  }
}

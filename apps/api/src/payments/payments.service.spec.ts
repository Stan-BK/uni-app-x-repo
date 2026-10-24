import { ConfigService } from "@nestjs/config";
import { RegistrationErrorCode } from "@activity/shared";
import {
  PaymentOrderStatus,
  RefundStatus,
  RegistrationStatus,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { FakeWechatPay } from "./fake-wechat-pay";
import { PaymentsService } from "./payments.service";

describe("PaymentsService", () => {
  let service: PaymentsService;
  let wechatPay: FakeWechatPay;

  const MCH_ID = "1900000109";
  const APP_ID = "wx8888888888888888";

  const tx = {
    paymentOrder: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    registration: {
      update: vi.fn(),
    },
    refund: {
      update: vi.fn(),
    },
  };

  const prisma = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
    paymentOrder: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    registration: {
      update: vi.fn(),
    },
    refund: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };

  const config = {
    get: vi.fn((key: string) => {
      if (key === "WECHAT_PAY_MCH_ID") return MCH_ID;
      if (key === "WECHAT_PAY_APP_ID") return APP_ID;
      return undefined;
    }),
  };

  const baseNow = new Date("2030-06-01T12:00:00.000Z");
  const futureExpire = new Date("2030-06-01T12:20:00.000Z");
  const pastExpire = new Date("2030-06-01T11:40:00.000Z");

  const pendingRegistration = {
    id: "reg1",
    activityId: "act1",
    status: RegistrationStatus.pending_payment,
  };

  const refundableActivity = {
    endAt: futureExpire,
    settlement: null,
  };

  function paidOrderForRefund(
    overrides: Record<string, unknown> = {},
  ) {
    return {
      ...basePaymentOrder,
      status: PaymentOrderStatus.paid,
      refund: null,
      registration: {
        ...pendingRegistration,
        activity: refundableActivity,
      },
      ...overrides,
    };
  }

  const basePaymentOrder = {
    id: "pay1",
    registrationId: "reg1",
    outTradeNo: "PO-ORIGINAL",
    amountCents: 100,
    status: PaymentOrderStatus.pending,
    prepayId: null as string | null,
    transactionId: null as string | null,
    expireAt: futureExpire,
    paidAt: null as Date | null,
    closedAt: null as Date | null,
    createdAt: baseNow,
    updatedAt: baseNow,
    registration: pendingRegistration,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    wechatPay = new FakeWechatPay();
    service = new PaymentsService(
      prisma as unknown as PrismaService,
      wechatPay,
      config as unknown as ConfigService,
      { wechatPayMchId: MCH_ID, wechatPayAppId: APP_ID },
    );
  });

  describe("prepare", () => {
    it("reuses prepayId without createJsapi and returns fresh nonceStr", async () => {
      prisma.paymentOrder.findFirst.mockResolvedValue({
        ...basePaymentOrder,
        prepayId: "fake-prepay-1",
      });
      const createSpy = vi.spyOn(wechatPay, "createJsapi");

      const first = await service.prepare("reg1", {
        amountCents: 100,
        description: "活动报名",
        payerOpenId: "openid-1",
        now: baseNow,
      });
      const second = await service.prepare("reg1", {
        amountCents: 100,
        description: "活动报名",
        payerOpenId: "openid-1",
        now: baseNow,
      });

      expect(createSpy).not.toHaveBeenCalled();
      expect(prisma.paymentOrder.update).not.toHaveBeenCalled();
      expect(first.status).toBe("pending");
      expect(second.status).toBe("pending");
      expect(first.pay!.package).toBe("prepay_id=fake-prepay-1");
      expect(second.pay!.package).toBe("prepay_id=fake-prepay-1");
      expect(first.pay!.nonceStr).not.toBe(second.pay!.nonceStr);
    });

    it("creates jsapi with current outTradeNo when prepayId missing", async () => {
      prisma.paymentOrder.findFirst.mockResolvedValue(basePaymentOrder);
      prisma.paymentOrder.update.mockImplementation(async ({ data }) => ({
        ...basePaymentOrder,
        ...data,
      }));

      const result = await service.prepare("reg1", {
        amountCents: 100,
        description: "活动报名",
        payerOpenId: "openid-1",
        now: baseNow,
      });

      expect(result.status).toBe("pending");
      expect(result.pay?.package).toBe("prepay_id=fake-prepay-1");
      expect(prisma.paymentOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "pay1" },
          data: { prepayId: "fake-prepay-1" },
        }),
      );
    });

    it("closes and rotates outTradeNo when merchant order exists locally without prepayId", async () => {
      wechatPay.seedOrder("PO-ORIGINAL", 100);
      prisma.paymentOrder.findFirst.mockResolvedValue(basePaymentOrder);
      prisma.paymentOrder.updateMany.mockResolvedValue({ count: 1 });
      prisma.paymentOrder.update.mockImplementation(async ({ data }) => ({
        ...basePaymentOrder,
        ...data,
      }));
      const closeSpy = vi.spyOn(wechatPay, "close");

      const result = await service.prepare("reg1", {
        amountCents: 100,
        description: "活动报名",
        payerOpenId: "openid-1",
        now: baseNow,
      });

      expect(prisma.paymentOrder.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "pay1", outTradeNo: "PO-ORIGINAL" },
        }),
      );
      expect(closeSpy).toHaveBeenCalledWith("PO-ORIGINAL");
      const rotateCall = prisma.paymentOrder.updateMany.mock.calls[0]?.[0];
      expect(rotateCall?.data.outTradeNo).not.toBe("PO-ORIGINAL");
      expect(result.status).toBe("pending");
      expect(result.pay?.package).toMatch(/^prepay_id=fake-prepay-/);
    });

    it("confirms when query returns SUCCESS without creating jsapi", async () => {
      wechatPay.seedOrder("PO-ORIGINAL", 100);
      wechatPay.markPaid("PO-ORIGINAL", "wx-txn-1");
      prisma.paymentOrder.findFirst.mockResolvedValue({
        ...basePaymentOrder,
        prepayId: null,
      });
      tx.paymentOrder.findUnique.mockResolvedValue({
        ...basePaymentOrder,
        status: PaymentOrderStatus.closed,
        closedAt: pastExpire,
      });
      const createSpy = vi.spyOn(wechatPay, "createJsapi");

      const result = await service.prepare("reg1", {
        amountCents: 100,
        description: "活动报名",
        payerOpenId: "openid-1",
        now: baseNow,
      });

      expect(createSpy).not.toHaveBeenCalled();
      expect(result).toEqual({ status: "paid", pay: null });
      expect(tx.paymentOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: PaymentOrderStatus.paid,
            transactionId: "wx-txn-1",
          }),
        }),
      );
      expect(tx.registration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            status: RegistrationStatus.confirmed,
            cancelledAt: null,
          },
        }),
      );
    });
  });

  describe("confirmPaid", () => {
    it("rejects mismatching callback and keeps registration pending_payment", async () => {
      tx.paymentOrder.findUnique.mockResolvedValue({
        ...basePaymentOrder,
        status: PaymentOrderStatus.pending,
        registration: pendingRegistration,
      });

      await expect(
        service.confirmPaid({
          outTradeNo: "PO-ORIGINAL",
          amountCents: 999,
          transactionId: "wx-txn-1",
          appId: APP_ID,
          mchId: MCH_ID,
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: RegistrationErrorCode.PaymentMismatch,
        }),
      });
      expect(tx.paymentOrder.update).not.toHaveBeenCalled();
      expect(tx.registration.update).not.toHaveBeenCalled();
    });

    it("rejects wrong mchId and keeps registration pending_payment", async () => {
      await expect(
        service.confirmPaid({
          outTradeNo: "PO-ORIGINAL",
          amountCents: 100,
          transactionId: "wx-txn-1",
          appId: APP_ID,
          mchId: "wrong-mch-id",
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: RegistrationErrorCode.PaymentMismatch,
        }),
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("does not change paidAt on duplicate confirmation", async () => {
      const paidAt = new Date("2030-06-01T12:05:00.000Z");
      prisma.paymentOrder.findUnique.mockResolvedValue({
        ...basePaymentOrder,
        status: PaymentOrderStatus.paid,
        paidAt,
        transactionId: "wx-txn-1",
      });
      tx.paymentOrder.findUnique.mockResolvedValue({
        ...basePaymentOrder,
        status: PaymentOrderStatus.paid,
        paidAt,
        transactionId: "wx-txn-1",
        registration: {
          ...pendingRegistration,
          status: RegistrationStatus.confirmed,
        },
      });

      await service.confirmPaid({
        outTradeNo: "PO-ORIGINAL",
        amountCents: 100,
        transactionId: "wx-txn-2",
        appId: APP_ID,
        mchId: MCH_ID,
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.paymentOrder.update).not.toHaveBeenCalled();
      expect(tx.registration.update).not.toHaveBeenCalled();
    });

    it("ignores amount and mch mismatch when payment is already paid", async () => {
      prisma.paymentOrder.findUnique.mockResolvedValue({
        ...basePaymentOrder,
        status: PaymentOrderStatus.paid,
        paidAt: new Date("2030-06-01T12:05:00.000Z"),
      });

      await expect(
        service.confirmPaid({
          outTradeNo: "PO-ORIGINAL",
          amountCents: 999,
          transactionId: "wx-txn-2",
          appId: "wrong-app",
          mchId: "wrong-mch",
        }),
      ).resolves.toBeUndefined();

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("recovers closed payment and cancelled registration on confirmPaid", async () => {
      const closedAt = new Date("2030-06-01T11:50:00.000Z");
      prisma.paymentOrder.findUnique.mockResolvedValue({
        ...basePaymentOrder,
        status: PaymentOrderStatus.closed,
        closedAt,
      });
      tx.paymentOrder.findUnique.mockResolvedValue({
        ...basePaymentOrder,
        status: PaymentOrderStatus.closed,
        closedAt,
        registration: {
          ...pendingRegistration,
          status: RegistrationStatus.cancelled,
        },
      });

      await service.confirmPaid({
        outTradeNo: "PO-ORIGINAL",
        amountCents: 100,
        transactionId: "wx-txn-late",
        appId: APP_ID,
        mchId: MCH_ID,
      });

      expect(tx.paymentOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: PaymentOrderStatus.paid,
            transactionId: "wx-txn-late",
            closedAt: null,
          }),
        }),
      );
      expect(tx.registration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            status: RegistrationStatus.confirmed,
            cancelledAt: null,
          },
        }),
      );
    });
  });

  describe("closeIfExpired", () => {
    it("closes unpaid expired order and cancels registration", async () => {
      prisma.paymentOrder.findUnique.mockResolvedValue({
        ...basePaymentOrder,
        expireAt: pastExpire,
      });

      await service.closeIfExpired("pay1", baseNow);

      expect(tx.paymentOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: PaymentOrderStatus.closed,
            closedAt: baseNow,
          }),
        }),
      );
      expect(tx.registration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: RegistrationStatus.cancelled,
            cancelledAt: baseNow,
          }),
        }),
      );
    });

    it("confirms registration when close returns paid", async () => {
      prisma.paymentOrder.findUnique.mockResolvedValue({
        ...basePaymentOrder,
        expireAt: pastExpire,
      });
      tx.paymentOrder.findUnique.mockResolvedValue({
        ...basePaymentOrder,
        status: PaymentOrderStatus.pending,
      });
      vi.spyOn(wechatPay, "query")
        .mockResolvedValueOnce({
          tradeState: "NOTPAY",
          transactionId: null,
          amountCents: null,
        })
        .mockResolvedValueOnce({
          tradeState: "SUCCESS",
          transactionId: "wx-txn-close",
          amountCents: 100,
        });
      vi.spyOn(wechatPay, "close").mockResolvedValue("paid");

      await service.closeIfExpired("pay1", baseNow);

      expect(tx.registration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            status: RegistrationStatus.confirmed,
            cancelledAt: null,
          },
        }),
      );
      expect(tx.paymentOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: PaymentOrderStatus.paid,
            closedAt: null,
          }),
        }),
      );
    });

    it("keeps pending_payment when close throws", async () => {
      prisma.paymentOrder.findUnique.mockResolvedValue({
        ...basePaymentOrder,
        expireAt: pastExpire,
      });
      vi.spyOn(wechatPay, "close").mockRejectedValue(new Error("wechat down"));

      await service.closeIfExpired("pay1", baseNow);

      expect(tx.paymentOrder.update).not.toHaveBeenCalled();
      expect(tx.registration.update).not.toHaveBeenCalled();
    });
  });

  describe("refundPaid", () => {
    it("marks refund succeeded and cancels registration", async () => {
      prisma.paymentOrder.findUnique.mockResolvedValue(paidOrderForRefund());
      prisma.refund.create.mockResolvedValue({
        id: "ref1",
        outRefundNo: "RF-1",
        status: RefundStatus.processing,
      });

      await service.refundPaid("pay1", "user_cancel");

      expect(prisma.refund.create).toHaveBeenCalled();
      expect(tx.refund.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: RefundStatus.succeeded },
        }),
      );
      expect(tx.paymentOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: PaymentOrderStatus.refunded },
        }),
      );
      expect(tx.registration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: RegistrationStatus.cancelled,
          }),
        }),
      );
    });

    it("reuses existing refund when create hits unique constraint", async () => {
      const { Prisma } = await import("@prisma/client");
      prisma.paymentOrder.findUnique.mockResolvedValue(paidOrderForRefund());
      prisma.refund.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("unique", {
          code: "P2002",
          clientVersion: "test",
        }),
      );
      prisma.refund.findUnique.mockResolvedValue({
        id: "ref-existing",
        outRefundNo: "RF-EXISTING",
        status: RefundStatus.processing,
      });

      await service.refundPaid("pay1", "user_cancel");

      expect(prisma.refund.findUnique).toHaveBeenCalledWith({
        where: { paymentOrderId: "pay1" },
      });
      expect(tx.refund.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "ref-existing" },
        }),
      );
    });

    it("keeps registration confirmed when refund fails", async () => {
      prisma.paymentOrder.findUnique.mockResolvedValue(paidOrderForRefund());
      prisma.refund.create.mockResolvedValue({
        id: "ref1",
        outRefundNo: "RF-1",
        status: RefundStatus.processing,
      });
      vi.spyOn(wechatPay, "refund").mockResolvedValue("failed");

      await service.refundPaid("pay1", "activity_closed");

      expect(prisma.refund.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: RefundStatus.failed },
        }),
      );
      expect(tx.paymentOrder.update).not.toHaveBeenCalled();
      expect(tx.registration.update).not.toHaveBeenCalled();
    });
  });
});

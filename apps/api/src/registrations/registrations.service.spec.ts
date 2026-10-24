import { ForbiddenException, Logger } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { BusinessEvent, RegistrationErrorCode } from "@activity/shared";
import {
  ActivityLifecycle,
  FeeType,
  PaymentOrderStatus,
  RegistrationStatus,
} from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PAYMENT_HOLD_MS } from "../payments/payment.constants";
import { PaymentsService } from "../payments/payments.service";
import { PrismaService } from "../prisma/prisma.service";
import { RegistrationsService } from "./registrations.service";

describe("RegistrationsService", () => {
  let service: RegistrationsService;
  const paymentsService = {
    prepare: vi.fn(),
    closeIfExpired: vi.fn(),
    refundPaid: vi.fn(),
    isWechatPayConfigured: vi.fn().mockReturnValue(true),
  };
  const tx = {
    $queryRaw: vi.fn(),
    activity: { findUnique: vi.fn() },
    user: { update: vi.fn() },
    userIdentity: { findFirst: vi.fn() },
    paymentOrder: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    registration: {
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
    activity: {
      findUnique: vi.fn(),
    },
    registration: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    paymentOrder: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  };

  const paidActivityFields = {
    lifecycle: ActivityLifecycle.published,
    feeType: FeeType.paid,
    refundable: true,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    prisma.paymentOrder.findMany.mockResolvedValue([]);
    const mod = await Test.createTestingModule({
      providers: [
        RegistrationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: PaymentsService, useValue: paymentsService },
      ],
    }).compile();
    service = mod.get(RegistrationsService);
  });

  const publishedFree = {
    id: "act1",
    lifecycle: ActivityLifecycle.published,
    feeType: FeeType.free,
    feeCents: 0,
    title: "徒步",
    capacity: 2,
    startAt: new Date("2030-01-01"),
    endAt: new Date("2030-01-02"),
    registrationDeadlineAt: new Date("2030-01-01"),
    allowUserCancel: true,
  };

  const publishedPaid = {
    ...publishedFree,
    feeType: FeeType.paid,
    feeCents: 9900,
    startAt: new Date("2030-07-01"),
    endAt: new Date("2030-07-02"),
    registrationDeadlineAt: new Date("2030-07-01"),
  };

  const fixedNow = new Date("2030-06-01T12:00:00.000Z");

  it("create confirms when capacity available", async () => {
    tx.$queryRaw.mockResolvedValue([publishedFree]);
    tx.registration.findUnique.mockResolvedValue(null);
    tx.registration.count.mockResolvedValue(0);
    tx.registration.create.mockResolvedValue({
      id: "r1",
      activityId: "act1",
      userId: "u1",
      name: "张三",
      phone: "13800138000",
      status: RegistrationStatus.confirmed,
      cancelledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const spy = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    try {
      const dto = await service.create("u1", {
        activityId: "act1",
        name: "张三",
        phone: "13800138000",
      });
      expect(dto.status).toBe("confirmed");
      expect(dto.alreadyRegistered).toBe(false);
      expect(dto.pay).toBeNull();
      expect(dto.paymentStatus).toBeNull();
      expect(tx.registration.create).toHaveBeenCalled();
      expect(tx.paymentOrder.create).not.toHaveBeenCalled();
      const payload = JSON.parse(String(spy.mock.calls.at(-1)?.[0]));
      expect(payload.event).toBe(BusinessEvent.RegistrationCreate);
      expect(payload.targetId).toBe("r1");
    } finally {
      spy.mockRestore();
    }
  });

  it("create rejects when full", async () => {
    tx.$queryRaw.mockResolvedValue([publishedFree]);
    tx.registration.findUnique.mockResolvedValue(null);
    tx.registration.count.mockResolvedValue(2);
    await expect(
      service.create("u1", {
        activityId: "act1",
        name: "张三",
        phone: "13800138000",
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: RegistrationErrorCode.ActivityFull,
      }),
    });
  });

  it("create rejects when activity ended", async () => {
    tx.$queryRaw.mockResolvedValue([
      {
        ...publishedFree,
        startAt: new Date("2020-01-01"),
        endAt: new Date("2020-01-02"),
      },
    ]);
    await expect(
      service.create("u1", {
        activityId: "act1",
        name: "张三",
        phone: "13800138000",
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: RegistrationErrorCode.ActivityEnded,
      }),
    });
  });

  it("create rejects when registration deadline passed", async () => {
    tx.$queryRaw.mockResolvedValue([
      {
        ...publishedFree,
        registrationDeadlineAt: new Date("2020-06-01"),
        startAt: new Date("2030-01-01"),
        endAt: new Date("2030-01-02"),
      },
    ]);
    await expect(
      service.create("u1", {
        activityId: "act1",
        name: "张三",
        phone: "13800138000",
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: RegistrationErrorCode.RegistrationClosed,
      }),
    });
  });

  it("create is idempotent when already confirmed", async () => {
    const existing = {
      id: "r1",
      activityId: "act1",
      userId: "u1",
      name: "张三",
      phone: "13800138000",
      status: RegistrationStatus.confirmed,
      cancelledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    tx.$queryRaw.mockResolvedValue([publishedFree]);
    tx.registration.findUnique.mockResolvedValue(existing);
    const spy = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    try {
      const dto = await service.create("u1", {
        activityId: "act1",
        name: "李四",
        phone: "13900139000",
      });
      expect(dto.id).toBe("r1");
      expect(tx.registration.create).not.toHaveBeenCalled();
      expect(tx.registration.update).not.toHaveBeenCalled();
      const events = spy.mock.calls
        .map((c) => {
          try {
            return JSON.parse(String(c[0])).event;
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      expect(events).not.toContain(BusinessEvent.RegistrationCreate);
    } finally {
      spy.mockRestore();
    }
  });

  it("create reactivates cancelled registration", async () => {
    const existing = {
      id: "r1",
      activityId: "act1",
      userId: "u1",
      name: "旧名",
      phone: "13700137000",
      status: RegistrationStatus.cancelled,
      cancelledAt: new Date("2026-01-01"),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    tx.$queryRaw.mockResolvedValue([publishedFree]);
    tx.registration.findUnique.mockResolvedValue(existing);
    tx.registration.count.mockResolvedValue(0);
    tx.registration.update.mockResolvedValue({
      ...existing,
      name: "张三",
      phone: "13800138000",
      status: RegistrationStatus.confirmed,
      cancelledAt: null,
    });
    const spy = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    try {
      const dto = await service.create("u1", {
        activityId: "act1",
        name: "张三",
        phone: "13800138000",
      });
      expect(dto.status).toBe("confirmed");
      expect(tx.registration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "r1" },
          data: expect.objectContaining({
            status: RegistrationStatus.confirmed,
            name: "张三",
            phone: "13800138000",
            cancelledAt: null,
          }),
        }),
      );
      expect(tx.registration.create).not.toHaveBeenCalled();
      const events = spy.mock.calls
        .map((c) => {
          try {
            return JSON.parse(String(c[0])).event;
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      expect(events).not.toContain(BusinessEvent.RegistrationCreate);
    } finally {
      spy.mockRestore();
    }
  });

  it("create does not write contact back on new registration", async () => {
    tx.$queryRaw.mockResolvedValue([publishedFree]);
    tx.registration.findUnique.mockResolvedValue(null);
    tx.registration.count.mockResolvedValue(0);
    tx.registration.create.mockResolvedValue({
      id: "r1",
      activityId: "act1",
      userId: "u1",
      name: "张三",
      phone: "13800138000",
      status: RegistrationStatus.confirmed,
      cancelledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const dto = await service.create("u1", {
      activityId: "act1",
      name: " 张三 ",
      phone: "13800138000",
    });

    expect(tx.user.update).not.toHaveBeenCalled();
    expect(dto.alreadyRegistered).toBe(false);
  });

  it("create does not write contact back when reactivating cancelled registration", async () => {
    const existing = {
      id: "r1",
      activityId: "act1",
      userId: "u1",
      name: "旧名",
      phone: "13700137000",
      status: RegistrationStatus.cancelled,
      cancelledAt: new Date("2026-01-01"),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    tx.$queryRaw.mockResolvedValue([publishedFree]);
    tx.registration.findUnique.mockResolvedValue(existing);
    tx.registration.count.mockResolvedValue(0);
    tx.registration.update.mockResolvedValue({
      ...existing,
      name: "张三",
      phone: "13800138000",
      status: RegistrationStatus.confirmed,
      cancelledAt: null,
    });

    const dto = await service.create("u1", {
      activityId: "act1",
      name: "张三",
      phone: "13800138000",
    });

    expect(tx.user.update).not.toHaveBeenCalled();
    expect(dto.alreadyRegistered).toBe(false);
  });

  it("create does not write contact back when already confirmed", async () => {
    const existing = {
      id: "r1",
      activityId: "act1",
      userId: "u1",
      name: "张三",
      phone: "13800138000",
      status: RegistrationStatus.confirmed,
      cancelledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    tx.$queryRaw.mockResolvedValue([publishedFree]);
    tx.registration.findUnique.mockResolvedValue(existing);

    const dto = await service.create("u1", {
      activityId: "act1",
      name: "李四",
      phone: "13900139000",
    });

    expect(tx.user.update).not.toHaveBeenCalled();
    expect(dto.alreadyRegistered).toBe(true);
  });

  describe("paid registration create", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(fixedNow);
      prisma.registration.findUnique.mockReset();
      prisma.paymentOrder.findFirst.mockReset();
      prisma.registration.findUnique.mockResolvedValue(null);
      prisma.paymentOrder.findFirst.mockResolvedValue(null);
      paymentsService.isWechatPayConfigured.mockReturnValue(true);
      paymentsService.closeIfExpired.mockReset();
      paymentsService.prepare.mockResolvedValue({
        status: "pending",
        pay: {
          timeStamp: "123",
          nonceStr: "abc",
          package: "prepay_id=wx1",
          signType: "RSA",
          paySign: "sig",
        },
      });
      tx.userIdentity.findFirst.mockResolvedValue({
        openId: "wx-open-1",
      });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("creates pending_payment and payment order within capacity", async () => {
      tx.$queryRaw.mockResolvedValue([publishedPaid]);
      tx.registration.findUnique.mockResolvedValue(null);
      tx.registration.count.mockResolvedValue(0);
      tx.registration.create.mockResolvedValue({
        id: "r-paid",
        activityId: "act1",
        userId: "u1",
        name: "张三",
        phone: "13800138000",
        status: RegistrationStatus.pending_payment,
        cancelledAt: null,
        createdAt: fixedNow,
        updatedAt: fixedNow,
      });
      tx.paymentOrder.create.mockResolvedValue({ id: "po1" });

      const dto = await service.create("u1", {
        activityId: "act1",
        name: "张三",
        phone: "13800138000",
      });

      expect(dto.status).toBe("pending_payment");
      expect(dto.paymentStatus).toBe("pending");
      expect(dto.pay?.package).toBe("prepay_id=wx1");
      expect(tx.registration.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: RegistrationStatus.pending_payment,
          }),
        }),
      );
      expect(tx.paymentOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            amountCents: 9900,
            expireAt: new Date(fixedNow.getTime() + PAYMENT_HOLD_MS),
          }),
        }),
      );
      expect(paymentsService.prepare).toHaveBeenCalledWith(
        "r-paid",
        expect.objectContaining({
          amountCents: 9900,
          payerOpenId: "wx-open-1",
        }),
      );
    });

    it("reuses unexpired pending_payment and calls prepare without new registration row", async () => {
      const existing = {
        id: "r-pending",
        activityId: "act1",
        userId: "u1",
        name: "张三",
        phone: "13800138000",
        status: RegistrationStatus.pending_payment,
        cancelledAt: null,
        createdAt: fixedNow,
        updatedAt: fixedNow,
      };
      prisma.registration.findUnique.mockResolvedValue(existing);
      prisma.paymentOrder.findFirst.mockResolvedValue({
        id: "po-old",
        expireAt: new Date(fixedNow.getTime() + 60_000),
        status: "pending",
      });
      tx.$queryRaw.mockResolvedValue([publishedPaid]);
      tx.registration.findUnique.mockResolvedValue(existing);
      tx.paymentOrder.findFirst.mockResolvedValue({
        id: "po-old",
        expireAt: new Date(fixedNow.getTime() + 60_000),
        status: "pending",
      });

      const dto = await service.create("u1", {
        activityId: "act1",
        name: "张三",
        phone: "13800138000",
      });

      expect(dto.id).toBe("r-pending");
      expect(tx.registration.create).not.toHaveBeenCalled();
      expect(tx.registration.update).not.toHaveBeenCalled();
      expect(tx.paymentOrder.create).not.toHaveBeenCalled();
      expect(paymentsService.prepare).toHaveBeenCalledWith(
        "r-pending",
        expect.objectContaining({ payerOpenId: "wx-open-1" }),
      );
    });

    it("returns alreadyRegistered for confirmed paid without pay params", async () => {
      const existing = {
        id: "r1",
        activityId: "act1",
        userId: "u1",
        name: "张三",
        phone: "13800138000",
        status: RegistrationStatus.confirmed,
        cancelledAt: null,
        createdAt: fixedNow,
        updatedAt: fixedNow,
      };
      tx.$queryRaw.mockResolvedValue([publishedPaid]);
      tx.registration.findUnique.mockResolvedValue(existing);

      const dto = await service.create("u1", {
        activityId: "act1",
        name: "李四",
        phone: "13900139000",
      });

      expect(dto.alreadyRegistered).toBe(true);
      expect(dto.pay).toBeNull();
      expect(dto.paymentStatus).toBeNull();
      expect(paymentsService.prepare).not.toHaveBeenCalled();
    });

    it("rejects when pending_payment and confirmed reach capacity", async () => {
      tx.$queryRaw.mockResolvedValue([publishedPaid]);
      tx.registration.findUnique.mockResolvedValue(null);
      tx.registration.count.mockResolvedValue(2);

      await expect(
        service.create("u1", {
          activityId: "act1",
          name: "张三",
          phone: "13800138000",
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: RegistrationErrorCode.ActivityFull,
        }),
      });
      expect(tx.registration.create).not.toHaveBeenCalled();
    });

    it("after expiry updates same registration row and creates new payment order", async () => {
      const existing = {
        id: "r-expired",
        activityId: "act1",
        userId: "u1",
        name: "旧名",
        phone: "13700137000",
        status: RegistrationStatus.pending_payment,
        cancelledAt: null,
        createdAt: fixedNow,
        updatedAt: fixedNow,
      };
      const cancelled = {
        ...existing,
        status: RegistrationStatus.cancelled,
        cancelledAt: fixedNow,
      };
      const renewed = {
        ...existing,
        name: "张三",
        phone: "13800138000",
        status: RegistrationStatus.pending_payment,
        cancelledAt: null,
      };
      prisma.registration.findUnique
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(cancelled);
      prisma.paymentOrder.findFirst.mockResolvedValue({
        id: "po-expired",
        expireAt: new Date(fixedNow.getTime() - 60_000),
        status: "pending",
      });
      paymentsService.closeIfExpired.mockResolvedValue(undefined);
      tx.$queryRaw.mockResolvedValue([publishedPaid]);
      tx.registration.findUnique.mockResolvedValue(cancelled);
      tx.registration.count.mockResolvedValue(0);
      tx.registration.update.mockResolvedValue(renewed);
      tx.paymentOrder.create.mockResolvedValue({ id: "po-new" });

      const dto = await service.create("u1", {
        activityId: "act1",
        name: "张三",
        phone: "13800138000",
      });

      expect(paymentsService.closeIfExpired).toHaveBeenCalledWith(
        "po-expired",
        fixedNow,
      );
      expect(dto.id).toBe("r-expired");
      expect(tx.registration.create).not.toHaveBeenCalled();
      expect(tx.paymentOrder.update).not.toHaveBeenCalled();
      expect(tx.registration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "r-expired" },
          data: expect.objectContaining({
            status: RegistrationStatus.pending_payment,
            name: "张三",
          }),
        }),
      );
      expect(tx.paymentOrder.create).toHaveBeenCalled();
      expect(paymentsService.prepare).toHaveBeenCalledWith(
        "r-expired",
        expect.any(Object),
      );
    });

    it("rejects paid create without weixin identity", async () => {
      tx.$queryRaw.mockResolvedValue([publishedPaid]);
      tx.registration.findUnique.mockResolvedValue(null);
      tx.registration.count.mockResolvedValue(0);
      tx.userIdentity.findFirst.mockResolvedValue(null);

      await expect(
        service.create("u1", {
          activityId: "act1",
          name: "张三",
          phone: "13800138000",
        }),
      ).rejects.toMatchObject({
        response: { message: "请使用微信登录后再支付" },
      });
      expect(tx.registration.create).not.toHaveBeenCalled();
      expect(tx.paymentOrder.create).not.toHaveBeenCalled();
      expect(paymentsService.prepare).not.toHaveBeenCalled();
    });

    it("releases pending hold and throws when wechat pay is not configured", async () => {
      paymentsService.isWechatPayConfigured.mockReturnValue(false);
      tx.$queryRaw.mockResolvedValue([publishedPaid]);
      tx.registration.findUnique.mockResolvedValue(null);
      tx.registration.count.mockResolvedValue(0);
      tx.registration.create.mockResolvedValue({
        id: "r-paid",
        activityId: "act1",
        userId: "u1",
        name: "张三",
        phone: "13800138000",
        status: RegistrationStatus.pending_payment,
        cancelledAt: null,
        createdAt: fixedNow,
        updatedAt: fixedNow,
      });
      tx.paymentOrder.create.mockResolvedValue({ id: "po1" });
      tx.paymentOrder.findFirst.mockResolvedValue({ id: "po1" });
      tx.paymentOrder.update.mockResolvedValue({});
      tx.registration.update.mockResolvedValue({
        id: "r-paid",
        status: RegistrationStatus.cancelled,
        cancelledAt: fixedNow,
      });

      await expect(
        service.create("u1", {
          activityId: "act1",
          name: "张三",
          phone: "13800138000",
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: RegistrationErrorCode.PaymentUnavailable,
          message: "支付未配置",
        }),
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
      expect(tx.paymentOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "po1" },
          data: expect.objectContaining({
            status: PaymentOrderStatus.closed,
            closedAt: fixedNow,
          }),
        }),
      );
      expect(tx.registration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "r-paid" },
          data: expect.objectContaining({
            status: RegistrationStatus.cancelled,
            cancelledAt: fixedNow,
          }),
        }),
      );
      expect(paymentsService.prepare).not.toHaveBeenCalled();
    });

    it("rejects retry when closeIfExpired leaves expired pending_payment", async () => {
      const existing = {
        id: "r-stuck",
        activityId: "act1",
        userId: "u1",
        name: "张三",
        phone: "13800138000",
        status: RegistrationStatus.pending_payment,
        cancelledAt: null,
        createdAt: fixedNow,
        updatedAt: fixedNow,
      };
      const expiredOrder = {
        id: "po-stuck",
        expireAt: new Date(fixedNow.getTime() - 60_000),
        status: PaymentOrderStatus.pending,
      };
      prisma.registration.findUnique
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(existing);
      prisma.paymentOrder.findFirst
        .mockResolvedValueOnce(expiredOrder)
        .mockResolvedValueOnce(expiredOrder);
      paymentsService.closeIfExpired.mockResolvedValue(undefined);

      await expect(
        service.create("u1", {
          activityId: "act1",
          name: "张三",
          phone: "13800138000",
        }),
      ).rejects.toMatchObject({
        response: { message: "支付关单未完成，请稍后重试" },
      });

      expect(paymentsService.closeIfExpired).toHaveBeenCalledWith(
        "po-stuck",
        fixedNow,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.registration.create).not.toHaveBeenCalled();
      expect(tx.paymentOrder.create).not.toHaveBeenCalled();
      expect(tx.registration.count).not.toHaveBeenCalled();
    });

    it("after expiry confirms via WeChat SUCCESS without new payment order", async () => {
      const existing = {
        id: "r-expired-paid",
        activityId: "act1",
        userId: "u1",
        name: "张三",
        phone: "13800138000",
        status: RegistrationStatus.pending_payment,
        cancelledAt: null,
        createdAt: fixedNow,
        updatedAt: fixedNow,
      };
      const confirmed = {
        ...existing,
        status: RegistrationStatus.confirmed,
        cancelledAt: null,
      };
      prisma.registration.findUnique
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(confirmed);
      prisma.paymentOrder.findFirst.mockResolvedValue({
        id: "po-expired-paid",
        expireAt: new Date(fixedNow.getTime() - 60_000),
        status: "pending",
      });
      paymentsService.closeIfExpired.mockResolvedValue(undefined);

      const dto = await service.create("u1", {
        activityId: "act1",
        name: "张三",
        phone: "13800138000",
      });

      expect(paymentsService.closeIfExpired).toHaveBeenCalledWith(
        "po-expired-paid",
        fixedNow,
      );
      expect(dto.id).toBe("r-expired-paid");
      expect(dto.status).toBe("confirmed");
      expect(dto.alreadyRegistered).toBe(true);
      expect(dto.paymentStatus).toBe("paid");
      expect(dto.pay).toBeNull();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.paymentOrder.create).not.toHaveBeenCalled();
      expect(paymentsService.prepare).not.toHaveBeenCalled();
    });
  });

  it("create does not write contact back when activity is full", async () => {
    tx.$queryRaw.mockResolvedValue([publishedFree]);
    tx.registration.findUnique.mockResolvedValue(null);
    tx.registration.count.mockResolvedValue(2);

    await expect(
      service.create("u1", {
        activityId: "act1",
        name: "张三",
        phone: "13800138000",
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: RegistrationErrorCode.ActivityFull,
      }),
    });
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("cancel rejects when allowUserCancel is false", async () => {
    prisma.registration.findUnique.mockResolvedValue({
      id: "r1",
      userId: "u1",
      status: RegistrationStatus.confirmed,
      activity: { ...publishedFree, allowUserCancel: false },
    });
    await expect(service.cancel("u1", "r1")).rejects.toMatchObject({
      response: expect.objectContaining({
        code: RegistrationErrorCode.CancelNotAllowed,
      }),
    });
  });

  it("cancel releases confirmed registration", async () => {
    prisma.registration.findUnique.mockResolvedValue({
      id: "r1",
      userId: "u1",
      status: RegistrationStatus.confirmed,
      activity: publishedFree,
    });
    tx.$queryRaw.mockResolvedValue([publishedFree]);
    tx.registration.update.mockResolvedValue({
      id: "r1",
      activityId: "act1",
      userId: "u1",
      name: "张三",
      phone: "13800138000",
      status: RegistrationStatus.cancelled,
      cancelledAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const dto = await service.cancel("u1", "r1");
    expect(dto.status).toBe("cancelled");
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("cancel forbidden for other user", async () => {
    prisma.registration.findUnique.mockResolvedValue({
      id: "r1",
      userId: "u2",
      status: RegistrationStatus.confirmed,
      activity: publishedFree,
    });
    await expect(service.cancel("u1", "r1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("cancel is idempotent when already cancelled", async () => {
    const row = {
      id: "r1",
      activityId: "act1",
      userId: "u1",
      name: "张三",
      phone: "13800138000",
      status: RegistrationStatus.cancelled,
      cancelledAt: new Date("2026-01-01"),
      createdAt: new Date(),
      updatedAt: new Date(),
      activity: publishedFree,
    };
    prisma.registration.findUnique.mockResolvedValue(row);
    const dto = await service.cancel("u1", "r1");
    expect(dto.status).toBe("cancelled");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("cancel rejects when activity ended", async () => {
    prisma.registration.findUnique.mockResolvedValue({
      id: "r1",
      userId: "u1",
      status: RegistrationStatus.confirmed,
      activity: {
        ...publishedFree,
        startAt: new Date("2020-01-01"),
        endAt: new Date("2020-01-02"),
      },
    });
    await expect(service.cancel("u1", "r1")).rejects.toMatchObject({
      response: expect.objectContaining({
        code: RegistrationErrorCode.ActivityEnded,
      }),
    });
  });

  it("cancel rejects paid registration when refundable is false", async () => {
    prisma.registration.findUnique.mockResolvedValue({
      id: "r1",
      userId: "u1",
      activityId: "act1",
      status: RegistrationStatus.confirmed,
      activity: {
        ...publishedPaid,
        ...paidActivityFields,
        refundable: false,
      },
    });
    await expect(service.cancel("u1", "r1")).rejects.toMatchObject({
      response: expect.objectContaining({
        code: RegistrationErrorCode.RefundNotAllowed,
      }),
    });
    expect(paymentsService.refundPaid).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("cancel rejects paid registration when allowUserCancel is false", async () => {
    prisma.registration.findUnique.mockResolvedValue({
      id: "r1",
      userId: "u1",
      status: RegistrationStatus.confirmed,
      activity: {
        ...publishedPaid,
        ...paidActivityFields,
        allowUserCancel: false,
      },
    });
    await expect(service.cancel("u1", "r1")).rejects.toMatchObject({
      response: expect.objectContaining({
        code: RegistrationErrorCode.CancelNotAllowed,
      }),
    });
    expect(paymentsService.refundPaid).not.toHaveBeenCalled();
  });

  it("cancel rejects paid registration when activity ended", async () => {
    prisma.registration.findUnique.mockResolvedValue({
      id: "r1",
      userId: "u1",
      status: RegistrationStatus.confirmed,
      activity: {
        ...publishedPaid,
        ...paidActivityFields,
        startAt: new Date("2020-01-01"),
        endAt: new Date("2020-01-02"),
      },
    });
    await expect(service.cancel("u1", "r1")).rejects.toMatchObject({
      response: expect.objectContaining({
        code: RegistrationErrorCode.ActivityEnded,
      }),
    });
    expect(paymentsService.refundPaid).not.toHaveBeenCalled();
  });

  it("cancel throws when refund leaves registration confirmed", async () => {
    prisma.registration.findUnique.mockResolvedValue({
      id: "r1",
      userId: "u1",
      activityId: "act1",
      status: RegistrationStatus.confirmed,
      activity: { ...publishedPaid, ...paidActivityFields },
    });
    prisma.registration.findUniqueOrThrow.mockResolvedValue({
      id: "r1",
      activityId: "act1",
      userId: "u1",
      name: "张三",
      phone: "13800138000",
      status: RegistrationStatus.confirmed,
      cancelledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.paymentOrder.findFirst.mockResolvedValue({ id: "pay-1" });
    paymentsService.refundPaid.mockResolvedValue(undefined);

    await expect(service.cancel("u1", "r1")).rejects.toMatchObject({
      response: { message: "退款未完成，请稍后重试" },
    });
  });

  it("cancel refunds paid confirmed registration", async () => {
    prisma.registration.findUnique.mockResolvedValue({
      id: "r1",
      userId: "u1",
      activityId: "act1",
      name: "张三",
      phone: "13800138000",
      status: RegistrationStatus.confirmed,
      activity: { ...publishedPaid, ...paidActivityFields },
    });
    prisma.registration.findUniqueOrThrow.mockResolvedValue({
      id: "r1",
      activityId: "act1",
      userId: "u1",
      name: "张三",
      phone: "13800138000",
      status: RegistrationStatus.cancelled,
      cancelledAt: new Date("2030-06-02"),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.paymentOrder.findFirst.mockResolvedValue({ id: "pay-1" });
    paymentsService.refundPaid.mockResolvedValue(undefined);

    const dto = await service.cancel("u1", "r1");

    expect(paymentsService.refundPaid).toHaveBeenCalledWith(
      "pay-1",
      "user_cancel",
    );
    expect(dto.status).toBe("cancelled");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("cancel does not refund free registration", async () => {
    prisma.registration.findUnique.mockResolvedValue({
      id: "r1",
      userId: "u1",
      activityId: "act1",
      status: RegistrationStatus.confirmed,
      activity: publishedFree,
    });
    tx.$queryRaw.mockResolvedValue([publishedFree]);
    tx.registration.update.mockResolvedValue({
      id: "r1",
      activityId: "act1",
      userId: "u1",
      name: "张三",
      phone: "13800138000",
      status: RegistrationStatus.cancelled,
      cancelledAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await service.cancel("u1", "r1");

    expect(paymentsService.refundPaid).not.toHaveBeenCalled();
  });

  it("listMine returns paginated items with activity summary", async () => {
    const start = new Date("2030-01-01T10:00:00.000Z");
    prisma.registration.findMany.mockResolvedValue([
      {
        id: "r1",
        activityId: "act1",
        userId: "u1",
        name: "张三",
        phone: "13800138000",
        status: RegistrationStatus.confirmed,
        cancelledAt: null,
        createdAt: new Date("2026-10-01T00:00:00.000Z"),
        updatedAt: new Date("2026-10-01T00:00:00.000Z"),
        activity: {
          id: "act1",
          title: "徒步",
          coverUrl: "https://x/c.jpg",
          startAt: start,
          place: "滨江",
          endAt: new Date("2030-01-02"),
          capacity: 10,
        },
      },
    ]);
    prisma.registration.count.mockResolvedValue(1);
    prisma.registration.groupBy.mockResolvedValue([
      { activityId: "act1", _count: { _all: 1 } },
    ]);

    const res = await service.listMine("u1", {});
    expect(res).toEqual({
      items: [
        expect.objectContaining({
          id: "r1",
          status: "confirmed",
          activity: expect.objectContaining({
            id: "act1",
            title: "徒步",
            coverUrl: "https://x/c.jpg",
            place: "滨江",
            startAt: start.toISOString(),
            displayStatus: "open",
          }),
        }),
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });
  });

  it("listForOwner forbidden when not owner", async () => {
    prisma.activity.findUnique.mockResolvedValue({
      id: "act1",
      ownerUserId: "u-other",
    });
    await expect(
      service.listForOwner("u1", "act1", {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("listForOwner success when owner", async () => {
    prisma.activity.findUnique.mockResolvedValue({
      id: "act1",
      ownerUserId: "u1",
    });
    prisma.registration.findMany.mockResolvedValue([
      {
        id: "r1",
        activityId: "act1",
        userId: "u2",
        name: "张三",
        phone: "13800138000",
        status: RegistrationStatus.confirmed,
        cancelledAt: null,
        createdAt: new Date("2026-10-01T00:00:00.000Z"),
        updatedAt: new Date("2026-10-01T00:00:00.000Z"),
        user: { nickname: "阿三", avatarUrl: "https://cdn.example/a.png" },
      },
    ]);
    prisma.registration.count.mockResolvedValue(1);

    const res = await service.listForOwner("u1", "act1", {});
    expect(prisma.registration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: { user: { select: { nickname: true, avatarUrl: true } } },
      }),
    );
    expect(res).toEqual({
      items: [
        {
          id: "r1",
          userId: "u2",
          name: "张三",
          phone: "13800138000",
          status: RegistrationStatus.confirmed,
          createdAt: "2026-10-01T00:00:00.000Z",
          cancelledAt: null,
          nickname: "阿三",
          avatarUrl: "https://cdn.example/a.png",
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });
  });
});

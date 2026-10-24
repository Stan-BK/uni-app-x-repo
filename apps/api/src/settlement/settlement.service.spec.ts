import { ConfigService } from "@nestjs/config";
import { RegistrationErrorCode } from "@activity/shared";
import {
  ActivityLifecycle,
  FeeType,
  LedgerEntryType,
  PaymentOrderStatus,
  RefundReason,
  RefundStatus,
  RegistrationStatus,
} from "@prisma/client";
import { randomBytes } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { FakeWechatPay } from "../payments/fake-wechat-pay";
import { PaymentsService } from "../payments/payments.service";
import { PrismaService } from "../prisma/prisma.service";
import { SettlementService } from "./settlement.service";

const DATABASE_URL = process.env.DATABASE_URL;
const describeDb = DATABASE_URL ? describe : describe.skip;

function newOutTradeNo(): string {
  return `PO${randomBytes(12).toString("hex")}`;
}

function newOutRefundNo(): string {
  return `RF${randomBytes(12).toString("hex")}`;
}

describeDb("SettlementService", () => {
  let prisma: PrismaService;
  let settlementService: SettlementService;
  let paymentsService: PaymentsService;

  const now = new Date("2030-07-01T12:00:00.000Z");
  const pastEndAt = new Date("2030-06-01T12:00:00.000Z");
  const futureEndAt = new Date("2030-08-01T12:00:00.000Z");

  const createdUserIds: string[] = [];
  const createdActivityIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const wechatPay = new FakeWechatPay();
    const config = {
      get: (key: string) => {
        if (key === "WECHAT_PAY_MCH_ID") return "1900000109";
        if (key === "WECHAT_PAY_APP_ID") return "wx8888888888888888";
        return undefined;
      },
    };
    paymentsService = new PaymentsService(
      prisma,
      wechatPay,
      config as unknown as ConfigService,
    );
    settlementService = new SettlementService(prisma, paymentsService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.ledgerEntry.deleteMany({
      where: {
        idempotencyKey: { startsWith: "settlement:" },
      },
    });
    await prisma.activitySettlement.deleteMany({
      where: { activityId: { in: createdActivityIds } },
    });
    if (createdActivityIds.length > 0) {
      await prisma.refund.deleteMany({
        where: {
          paymentOrder: {
            registration: { activityId: { in: createdActivityIds } },
          },
        },
      });
      await prisma.paymentOrder.deleteMany({
        where: {
          registration: { activityId: { in: createdActivityIds } },
        },
      });
      await prisma.registration.deleteMany({
        where: { activityId: { in: createdActivityIds } },
      });
      await prisma.activity.deleteMany({
        where: { id: { in: createdActivityIds } },
      });
      createdActivityIds.length = 0;
    }
    if (createdUserIds.length > 0) {
      await prisma.walletAccount.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
      createdUserIds.length = 0;
    }
  });

  async function createOwner() {
    const user = await prisma.user.create({
      data: { nickname: "owner" },
    });
    createdUserIds.push(user.id);
    return user;
  }

  async function createParticipant() {
    const user = await prisma.user.create({
      data: { nickname: "guest" },
    });
    createdUserIds.push(user.id);
    return user;
  }

  async function createPaidActivity(
    ownerUserId: string,
    opts: {
      endAt?: Date;
      lifecycle?: ActivityLifecycle;
      platformFeeBps?: number | null;
    } = {},
  ) {
    const activity = await prisma.activity.create({
      data: {
        ownerUserId,
        title: "收费活动",
        feeType: FeeType.paid,
        feeCents: 500,
        lifecycle: opts.lifecycle ?? ActivityLifecycle.published,
        endAt: opts.endAt ?? pastEndAt,
        platformFeeBps:
          opts.platformFeeBps !== undefined ? opts.platformFeeBps : 1000,
        coverUrl: "https://example.com/c.jpg",
        rules: "规则",
        place: "公园",
        capacity: 10,
      },
    });
    createdActivityIds.push(activity.id);
    return activity;
  }

  async function createPaidOrder(
    activityId: string,
    userId: string,
    amountCents: number,
    status: PaymentOrderStatus = PaymentOrderStatus.paid,
  ) {
    const registration = await prisma.registration.create({
      data: {
        activityId,
        userId,
        name: "报名人",
        phone: "13800138000",
        status:
          status === PaymentOrderStatus.paid ||
          status === PaymentOrderStatus.refunded
            ? RegistrationStatus.confirmed
            : RegistrationStatus.pending_payment,
      },
    });
    const order = await prisma.paymentOrder.create({
      data: {
        registrationId: registration.id,
        outTradeNo: newOutTradeNo(),
        amountCents,
        status,
        expireAt: new Date("2030-07-01T11:00:00.000Z"),
        paidAt: status === PaymentOrderStatus.paid ? now : null,
      },
    });
    return { registration, order };
  }

  it("settles ended paid activity with fee and wallet credit", async () => {
    const owner = await createOwner();
    const guest1 = await createParticipant();
    const guest2 = await createParticipant();
    const activity = await createPaidActivity(owner.id, {
      platformFeeBps: 1000,
    });
    await createPaidOrder(activity.id, guest1.id, 400);
    await createPaidOrder(activity.id, guest2.id, 600);

    const first = await settlementService.settleActivity(activity.id, now);
    expect(first.settled).toBe(true);

    const settlement = await prisma.activitySettlement.findUnique({
      where: { activityId: activity.id },
    });
    expect(settlement).toMatchObject({
      grossCents: 1000,
      refundedCents: 0,
      feeCents: 100,
      netCents: 900,
      platformFeeBps: 1000,
      ownerUserId: owner.id,
    });
    expect(settlement!.ledgerEntryId).toBeTruthy();

    const wallet = await prisma.walletAccount.findUnique({
      where: { userId: owner.id },
    });
    expect(wallet?.availableCents).toBe(900);

    const ledger = await prisma.ledgerEntry.findFirst({
      where: { accountId: wallet!.id },
    });
    expect(ledger).toMatchObject({
      type: LedgerEntryType.settlement_credit,
      availableDeltaCents: 900,
      availableAfterCents: 900,
      idempotencyKey: `settlement:${activity.id}`,
      refType: "activity",
      refId: activity.id,
    });

    const second = await settlementService.settleActivity(activity.id, now);
    expect(second.settled).toBe(false);
    expect(
      await prisma.activitySettlement.count({
        where: { activityId: activity.id },
      }),
    ).toBe(1);
    expect(
      (await prisma.walletAccount.findUnique({ where: { userId: owner.id } }))
        ?.availableCents,
    ).toBe(900);
  });

  it("writes zero-net settlement without wallet when all paid amounts refunded", async () => {
    const owner = await createOwner();
    const guest = await createParticipant();
    const activity = await createPaidActivity(owner.id);
    const { order } = await createPaidOrder(
      activity.id,
      guest.id,
      500,
      PaymentOrderStatus.refunded,
    );
    await prisma.refund.create({
      data: {
        paymentOrderId: order.id,
        outRefundNo: newOutRefundNo(),
        amountCents: 500,
        status: RefundStatus.succeeded,
        reason: RefundReason.activity_closed,
      },
    });

    const result = await settlementService.settleActivity(activity.id, now);
    expect(result.settled).toBe(true);

    const settlement = await prisma.activitySettlement.findUnique({
      where: { activityId: activity.id },
    });
    expect(settlement?.netCents).toBe(0);
    expect(settlement?.ledgerEntryId).toBeNull();
    expect(
      await prisma.walletAccount.findUnique({ where: { userId: owner.id } }),
    ).toBeNull();
  });

  it("treats null platformFeeBps as zero fee", async () => {
    const owner = await createOwner();
    const guest = await createParticipant();
    const activity = await createPaidActivity(owner.id, {
      platformFeeBps: null,
    });
    await createPaidOrder(activity.id, guest.id, 800);

    await settlementService.settleActivity(activity.id, now);

    const settlement = await prisma.activitySettlement.findUnique({
      where: { activityId: activity.id },
    });
    expect(settlement).toMatchObject({
      grossCents: 800,
      feeCents: 0,
      netCents: 800,
      platformFeeBps: 0,
    });
  });

  it("skips settlement when a payment order stays pending after closeIfExpired", async () => {
    const owner = await createOwner();
    const guest = await createParticipant();
    const activity = await createPaidActivity(owner.id);
    const registration = await prisma.registration.create({
      data: {
        activityId: activity.id,
        userId: guest.id,
        name: "报名人",
        phone: "13800138000",
        status: RegistrationStatus.pending_payment,
      },
    });
    await prisma.paymentOrder.create({
      data: {
        registrationId: registration.id,
        outTradeNo: newOutTradeNo(),
        amountCents: 500,
        status: PaymentOrderStatus.pending,
        expireAt: new Date("2030-07-01T14:00:00.000Z"),
      },
    });

    const result = await settlementService.settleActivity(activity.id, now);
    expect(result.settled).toBe(false);
    expect(
      await prisma.activitySettlement.findUnique({
        where: { activityId: activity.id },
      }),
    ).toBeNull();
  });

  it("skips settlement when a refund is still failed", async () => {
    const owner = await createOwner();
    const guest = await createParticipant();
    const activity = await createPaidActivity(owner.id);
    const { order } = await createPaidOrder(activity.id, guest.id, 500);
    await prisma.refund.create({
      data: {
        paymentOrderId: order.id,
        outRefundNo: newOutRefundNo(),
        amountCents: 500,
        status: RefundStatus.failed,
        reason: RefundReason.user_cancel,
      },
    });

    const result = await settlementService.settleActivity(activity.id, now);
    expect(result.settled).toBe(false);
    expect(
      await prisma.activitySettlement.findUnique({
        where: { activityId: activity.id },
      }),
    ).toBeNull();
  });

  it("does not settle draft activities even when endAt has passed", async () => {
    const owner = await createOwner();
    const guest = await createParticipant();
    const activity = await createPaidActivity(owner.id, {
      lifecycle: ActivityLifecycle.draft,
    });
    await createPaidOrder(activity.id, guest.id, 500);

    const result = await settlementService.settleActivity(activity.id, now);
    expect(result.settled).toBe(false);
  });

  it("settles removed activity with zero net without ledger", async () => {
    const owner = await createOwner();
    const guest = await createParticipant();
    const activity = await createPaidActivity(owner.id, {
      lifecycle: ActivityLifecycle.removed,
      endAt: futureEndAt,
    });
    const { order } = await createPaidOrder(
      activity.id,
      guest.id,
      500,
      PaymentOrderStatus.refunded,
    );
    await prisma.refund.create({
      data: {
        paymentOrderId: order.id,
        outRefundNo: newOutRefundNo(),
        amountCents: 500,
        status: RefundStatus.succeeded,
        reason: RefundReason.activity_closed,
      },
    });

    const result = await settlementService.settleActivity(activity.id, now);
    expect(result.settled).toBe(true);
    const settlement = await prisma.activitySettlement.findUnique({
      where: { activityId: activity.id },
    });
    expect(settlement?.netCents).toBe(0);
    expect(settlement?.ledgerEntryId).toBeNull();
  });

  describe("getWallet", () => {
    it("returns availableCents 0 when the user has no wallet account", async () => {
      const owner = await createOwner();
      const guest = await createParticipant();
      const activity = await createPaidActivity(owner.id);
      await createPaidOrder(activity.id, guest.id, 500);

      const wallet = await settlementService.getWallet(owner.id);
      expect(wallet).toEqual({ availableCents: 0, pendingCents: 450 });
    });

    it("returns stored availableCents when a wallet exists", async () => {
      const owner = await createOwner();
      await prisma.walletAccount.create({
        data: { userId: owner.id, availableCents: 1234 },
      });

      const wallet = await settlementService.getWallet(owner.id);
      expect(wallet.availableCents).toBe(1234);
    });

    it("sums pendingCents from unsettled paid activities using current platformFeeBps", async () => {
      const owner = await createOwner();
      const guest1 = await createParticipant();
      const guest2 = await createParticipant();
      const activity = await createPaidActivity(owner.id, {
        platformFeeBps: 1000,
      });
      await createPaidOrder(activity.id, guest1.id, 400);
      await createPaidOrder(activity.id, guest2.id, 600);

      const wallet = await settlementService.getWallet(owner.id);
      expect(wallet.pendingCents).toBe(900);
    });

    it("excludes activities that already have a settlement from pendingCents", async () => {
      const owner = await createOwner();
      const guest1 = await createParticipant();
      const guest2 = await createParticipant();
      const settled = await createPaidActivity(owner.id, {
        platformFeeBps: 1000,
      });
      await createPaidOrder(settled.id, guest1.id, 400);
      await createPaidOrder(settled.id, guest2.id, 600);
      await settlementService.settleActivity(settled.id, now);

      const unsettled = await createPaidActivity(owner.id, {
        platformFeeBps: 1000,
      });
      await createPaidOrder(unsettled.id, guest2.id, 200);

      const wallet = await settlementService.getWallet(owner.id);
      expect(wallet.availableCents).toBe(900);
      expect(wallet.pendingCents).toBe(180);
    });

    it("returns only availableCents and pendingCents", async () => {
      const owner = await createOwner();

      const wallet = await settlementService.getWallet(owner.id);
      expect(Object.keys(wallet).sort()).toEqual([
        "availableCents",
        "pendingCents",
      ]);
    });
  });

  describe("refundPaid guards", () => {
    it("rejects user_cancel after endAt before settlement", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(now);
      try {
        const owner = await createOwner();
        const guest = await createParticipant();
        const activity = await createPaidActivity(owner.id, {
          endAt: pastEndAt,
        });
        const { order, registration } = await createPaidOrder(
          activity.id,
          guest.id,
          500,
        );

        await expect(
          paymentsService.refundPaid(order.id, "user_cancel"),
        ).rejects.toMatchObject({
          response: expect.objectContaining({
            code: RegistrationErrorCode.RefundNotAllowed,
          }),
        });

        const reg = await prisma.registration.findUnique({
          where: { id: registration.id },
        });
        expect(reg?.status).toBe(RegistrationStatus.confirmed);
      } finally {
        vi.useRealTimers();
      }
    });

    it("allows activity_closed after endAt before settlement exists", async () => {
      const owner = await createOwner();
      const guest = await createParticipant();
      const activity = await createPaidActivity(owner.id, { endAt: pastEndAt });
      const { order } = await createPaidOrder(activity.id, guest.id, 500);

      await paymentsService.refundPaid(order.id, "activity_closed");

      const updated = await prisma.paymentOrder.findUnique({
        where: { id: order.id },
        include: { refund: true },
      });
      expect(updated?.status).toBe(PaymentOrderStatus.refunded);
      expect(updated?.refund?.status).toBe(RefundStatus.succeeded);
    });

    it("rejects refund when settlement already exists", async () => {
      const owner = await createOwner();
      const guest1 = await createParticipant();
      const guest2 = await createParticipant();
      const activity = await createPaidActivity(owner.id);
      const paid1 = await createPaidOrder(activity.id, guest1.id, 300);
      const paid2 = await createPaidOrder(activity.id, guest2.id, 200);
      await settlementService.settleActivity(activity.id, now);

      for (const reason of ["user_cancel", "activity_closed"] as const) {
        await expect(
          paymentsService.refundPaid(paid1.order.id, reason),
        ).rejects.toMatchObject({
          response: expect.objectContaining({
            code: RegistrationErrorCode.RefundNotAllowed,
          }),
        });
      }

      expect(paid2.order.id).toBeTruthy();
    });
  });
});

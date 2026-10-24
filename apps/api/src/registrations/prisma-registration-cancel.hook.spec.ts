import { Test } from "@nestjs/testing";
import {
  FeeType,
  PaymentOrderStatus,
  RefundStatus,
  RegistrationStatus,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentsService } from "../payments/payments.service";
import { PrismaService } from "../prisma/prisma.service";
import { PrismaRegistrationCancelHook } from "./prisma-registration-cancel.hook";

describe("PrismaRegistrationCancelHook", () => {
  let hook: PrismaRegistrationCancelHook;
  const paymentsService = {
    closeUnpaidForActivity: vi.fn(),
    refundPaid: vi.fn(),
  };
  const prisma = {
    registration: { updateMany: vi.fn() },
    paymentOrder: { findMany: vi.fn() },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PrismaRegistrationCancelHook,
        { provide: PrismaService, useValue: prisma },
        { provide: PaymentsService, useValue: paymentsService },
      ],
    }).compile();
    hook = moduleRef.get(PrismaRegistrationCancelHook);
  });

  it("cancels only free confirmed registrations for activity", async () => {
    prisma.registration.updateMany.mockResolvedValue({ count: 2 });

    await hook.cancelAllForActivity("act-1");

    expect(prisma.registration.updateMany).toHaveBeenCalledOnce();
    const [args] = prisma.registration.updateMany.mock.calls[0] as [
      {
        where: { activityId: string; status: RegistrationStatus };
        data: { status: RegistrationStatus; cancelledAt: Date };
      },
    ];
    expect(args.where).toEqual({
      activityId: "act-1",
      status: RegistrationStatus.confirmed,
      activity: { feeType: FeeType.free },
    });
    expect(args.data.status).toBe(RegistrationStatus.cancelled);
    expect(args.data.cancelledAt).toBeInstanceOf(Date);
  });

  it("closeActivity closes unpaid, refunds paid without succeeded refund, cancels free confirmed", async () => {
    paymentsService.closeUnpaidForActivity.mockResolvedValue(undefined);
    prisma.paymentOrder.findMany
      .mockResolvedValueOnce([{ id: "pay-1" }, { id: "pay-2" }])
      .mockResolvedValueOnce([]);
    paymentsService.refundPaid.mockResolvedValue(undefined);
    prisma.registration.updateMany.mockResolvedValue({ count: 1 });

    await hook.closeActivity("act-1");

    expect(paymentsService.closeUnpaidForActivity).toHaveBeenCalledWith(
      "act-1",
    );
    expect(prisma.paymentOrder.findMany).toHaveBeenCalledWith({
      where: {
        status: PaymentOrderStatus.paid,
        registration: { activityId: "act-1" },
        OR: [
          { refund: null },
          { refund: { status: { not: RefundStatus.succeeded } } },
        ],
      },
    });
    expect(paymentsService.refundPaid).toHaveBeenCalledTimes(2);
    expect(paymentsService.refundPaid).toHaveBeenCalledWith(
      "pay-1",
      "activity_closed",
    );
    expect(paymentsService.refundPaid).toHaveBeenCalledWith(
      "pay-2",
      "activity_closed",
    );
    expect(prisma.registration.updateMany).toHaveBeenCalledWith({
      where: {
        activityId: "act-1",
        status: RegistrationStatus.confirmed,
        activity: { feeType: FeeType.free },
      },
      data: {
        status: RegistrationStatus.cancelled,
        cancelledAt: expect.any(Date),
      },
    });
  });

  it("closeActivity throws when paid orders remain without succeeded refund", async () => {
    paymentsService.closeUnpaidForActivity.mockResolvedValue(undefined);
    prisma.paymentOrder.findMany
      .mockResolvedValueOnce([{ id: "pay-1" }])
      .mockResolvedValueOnce([{ id: "pay-1" }]);

    await expect(hook.closeActivity("act-1")).rejects.toMatchObject({
      response: { message: "退款未完成，请稍后重试" },
    });

    expect(paymentsService.refundPaid).toHaveBeenCalledWith(
      "pay-1",
      "activity_closed",
    );
    expect(prisma.registration.updateMany).not.toHaveBeenCalled();
  });
});

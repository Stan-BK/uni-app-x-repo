import { Injectable } from "@nestjs/common";
import {
  ActivityLifecycle,
  FeeType,
  LedgerEntryType,
  PaymentOrderStatus,
  Prisma,
  RefundStatus,
} from "@prisma/client";
import { randomBytes } from "node:crypto";
import { PaymentsService } from "../payments/payments.service";
import { PrismaService } from "../prisma/prisma.service";
import { settlementAmounts } from "./fee";

export type SettleActivityResult = {
  settled: boolean;
  settlementId?: string;
};

function newCuid(): string {
  return `c${randomBytes(12).toString("hex")}${Date.now().toString(36)}`.slice(
    0,
    25,
  );
}

@Injectable()
export class SettlementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsService: PaymentsService,
  ) {}

  async settleActivity(
    activityId: string,
    now = new Date(),
  ): Promise<SettleActivityResult> {
    const pendingOrders = await this.prisma.paymentOrder.findMany({
      where: {
        status: PaymentOrderStatus.pending,
        registration: { activityId },
      },
      select: { id: true },
    });
    for (const order of pendingOrders) {
      await this.paymentsService.closeIfExpired(order.id, now);
    }

    const stillPending = await this.prisma.paymentOrder.count({
      where: {
        status: PaymentOrderStatus.pending,
        registration: { activityId },
      },
    });
    if (stillPending > 0) {
      return { settled: false };
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT id FROM "Activity" WHERE id = ${activityId} FOR UPDATE
        `;

        const activity = await tx.activity.findUnique({
          where: { id: activityId },
          include: { settlement: true },
        });
        if (!activity || activity.feeType !== FeeType.paid) {
          return { settled: false };
        }
        if (activity.settlement) {
          return { settled: false };
        }
        if (activity.lifecycle === ActivityLifecycle.draft) {
          return { settled: false };
        }

        const canSettleByTime =
          (activity.endAt !== null && activity.endAt <= now) ||
          activity.lifecycle === ActivityLifecycle.cancelled ||
          activity.lifecycle === ActivityLifecycle.removed;
        if (!canSettleByTime) {
          return { settled: false };
        }

        const incompleteRefund = await tx.refund.count({
          where: {
            paymentOrder: { registration: { activityId } },
            status: { in: [RefundStatus.processing, RefundStatus.failed] },
          },
        });
        if (incompleteRefund > 0) {
          return { settled: false };
        }

        const paidOrders = await tx.paymentOrder.findMany({
          where: {
            registration: { activityId },
            status: {
              in: [PaymentOrderStatus.paid, PaymentOrderStatus.refunded],
            },
          },
          select: { amountCents: true },
        });
        const grossCents = paidOrders.reduce(
          (sum, order) => sum + order.amountCents,
          0,
        );

        const succeededRefunds = await tx.refund.findMany({
          where: {
            paymentOrder: { registration: { activityId } },
            status: RefundStatus.succeeded,
          },
          select: { amountCents: true },
        });
        const refundedCents = succeededRefunds.reduce(
          (sum, refund) => sum + refund.amountCents,
          0,
        );

        const { feeCents, netCents } = settlementAmounts(
          grossCents,
          refundedCents,
          activity.platformFeeBps,
        );
        const platformFeeBps = Math.min(
          10000,
          Math.max(0, activity.platformFeeBps ?? 0),
        );

        let ledgerEntryId: string | null = null;

        if (netCents > 0) {
          const ownerUserId = activity.ownerUserId;
          const walletId = newCuid();
          const ts = now;

          await tx.$executeRaw`
            INSERT INTO "WalletAccount" (id, "userId", "availableCents", "createdAt", "updatedAt")
            VALUES (${walletId}, ${ownerUserId}, 0, ${ts}, ${ts})
            ON CONFLICT ("userId") DO NOTHING
          `;

          const locked = await tx.$queryRaw<
            Array<{ id: string; availableCents: number }>
          >`
            SELECT id, "availableCents" FROM "WalletAccount"
            WHERE "userId" = ${ownerUserId}
            FOR UPDATE
          `;
          const account = locked[0];
          if (!account) {
            throw new Error("wallet account missing after upsert");
          }

          const availableAfterCents = account.availableCents + netCents;
          const entryId = newCuid();
          const idempotencyKey = `settlement:${activityId}`;

          await tx.ledgerEntry.create({
            data: {
              id: entryId,
              accountId: account.id,
              type: LedgerEntryType.settlement_credit,
              availableDeltaCents: netCents,
              availableAfterCents,
              idempotencyKey,
              refType: "activity",
              refId: activityId,
            },
          });

          await tx.walletAccount.update({
            where: { id: account.id },
            data: { availableCents: availableAfterCents },
          });

          ledgerEntryId = entryId;
        }

        const settlement = await tx.activitySettlement.create({
          data: {
            activityId,
            ownerUserId: activity.ownerUserId,
            grossCents,
            refundedCents,
            platformFeeBps,
            feeCents,
            netCents,
            ledgerEntryId,
          },
        });

        return { settled: true, settlementId: settlement.id };
      });
    } catch (error) {
      if (!this.isUniqueConstraint(error)) {
        throw error;
      }
      const existing = await this.prisma.activitySettlement.findUnique({
        where: { activityId },
      });
      if (existing) {
        return { settled: true, settlementId: existing.id };
      }
      throw error;
    }
  }

  private isUniqueConstraint(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    );
  }
}

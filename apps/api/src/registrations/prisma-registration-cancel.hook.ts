import { Injectable } from "@nestjs/common";
import {
  FeeType,
  PaymentOrderStatus,
  RefundStatus,
  RegistrationStatus,
} from "@prisma/client";
import { type RegistrationCancelHook } from "../activities/registration-cancel.hook";
import { PaymentsService } from "../payments/payments.service";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class PrismaRegistrationCancelHook implements RegistrationCancelHook {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsService: PaymentsService,
  ) {}

  async cancelAllForActivity(activityId: string): Promise<void> {
    await this.prisma.registration.updateMany({
      where: { activityId, status: RegistrationStatus.confirmed },
      data: { status: RegistrationStatus.cancelled, cancelledAt: new Date() },
    });
  }

  async closeActivity(activityId: string): Promise<void> {
    await this.paymentsService.closeUnpaidForActivity(activityId);

    const paidOrders = await this.prisma.paymentOrder.findMany({
      where: {
        status: PaymentOrderStatus.paid,
        registration: { activityId },
        OR: [
          { refund: null },
          { refund: { status: { not: RefundStatus.succeeded } } },
        ],
      },
    });
    for (const order of paidOrders) {
      await this.paymentsService.refundPaid(order.id, "activity_closed");
    }

    await this.prisma.registration.updateMany({
      where: {
        activityId,
        status: RegistrationStatus.confirmed,
        activity: { feeType: FeeType.free },
      },
      data: { status: RegistrationStatus.cancelled, cancelledAt: new Date() },
    });
  }
}

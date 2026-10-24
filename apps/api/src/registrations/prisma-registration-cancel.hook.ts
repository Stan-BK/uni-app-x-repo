import { ConflictException, Injectable } from "@nestjs/common";
import {
  FeeType,
  PaymentOrderStatus,
  RefundStatus,
  RegistrationStatus,
} from "@prisma/client";
import { type RegistrationCancelHook } from "../activities/registration-cancel.hook";
import { PaymentsService } from "../payments/payments.service";
import { PrismaService } from "../prisma/prisma.service";

const REFUND_INCOMPLETE_MESSAGE = "退款未完成，请稍后重试";

@Injectable()
export class PrismaRegistrationCancelHook implements RegistrationCancelHook {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsService: PaymentsService,
  ) {}

  async cancelAllForActivity(activityId: string): Promise<void> {
    await this.prisma.registration.updateMany({
      where: {
        activityId,
        status: RegistrationStatus.confirmed,
        activity: { feeType: FeeType.free },
      },
      data: { status: RegistrationStatus.cancelled, cancelledAt: new Date() },
    });
  }

  private paidWithoutSucceededRefund(activityId: string) {
    return {
      status: PaymentOrderStatus.paid,
      registration: { activityId },
      OR: [
        { refund: null },
        { refund: { status: { not: RefundStatus.succeeded } } },
      ],
    };
  }

  async closeActivity(activityId: string): Promise<void> {
    await this.paymentsService.closeUnpaidForActivity(activityId);

    const paidOrders = await this.prisma.paymentOrder.findMany({
      where: this.paidWithoutSucceededRefund(activityId),
    });
    for (const order of paidOrders) {
      await this.paymentsService.refundPaid(order.id, "activity_closed");
    }

    const stillPaid = await this.prisma.paymentOrder.findMany({
      where: this.paidWithoutSucceededRefund(activityId),
    });
    if (stillPaid.length > 0) {
      throw new ConflictException({ message: REFUND_INCOMPLETE_MESSAGE });
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

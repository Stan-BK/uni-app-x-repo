import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { PaymentOrderStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PaymentsService } from "./payments.service";

const SCAN_INTERVAL_MS = 60_000;

@Injectable()
export class PaymentExpiryScanner implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentExpiryScanner.name);
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsService: PaymentsService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === "test" || process.env.VITEST) {
      return;
    }
    this.timer = setInterval(() => {
      void this.scan().catch((error: unknown) => {
        this.logger.error("payment expiry scan tick failed", error);
      });
    }, SCAN_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async scan(now = new Date()): Promise<void> {
    const orders = await this.prisma.paymentOrder.findMany({
      where: {
        status: PaymentOrderStatus.pending,
        expireAt: { lte: now },
      },
      select: { id: true, outTradeNo: true },
    });

    for (const order of orders) {
      try {
        await this.paymentsService.closeIfExpired(order.id, now);
      } catch {
        this.logger.warn(order.outTradeNo);
      }
    }
  }
}

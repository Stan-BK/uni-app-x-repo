import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ActivityLifecycle, FeeType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SettlementService } from "./settlement.service";

const SCAN_INTERVAL_MS = 60_000;

@Injectable()
export class SettlementScanner implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SettlementScanner.name);
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settlementService: SettlementService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === "test" || process.env.VITEST) {
      return;
    }
    this.timer = setInterval(() => {
      void this.scan().catch((error: unknown) => {
        this.logger.error("settlement scan tick failed", error);
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
    const activities = await this.prisma.activity.findMany({
      where: {
        feeType: FeeType.paid,
        lifecycle: { not: ActivityLifecycle.draft },
        settlement: { is: null },
        OR: [
          { endAt: { lte: now } },
          {
            lifecycle: {
              in: [ActivityLifecycle.cancelled, ActivityLifecycle.removed],
            },
          },
        ],
      },
      select: { id: true },
    });

    for (const activity of activities) {
      try {
        await this.settlementService.settleActivity(activity.id, now);
      } catch (error) {
        this.logger.warn(`settlement failed for activity ${activity.id}`, error);
      }
    }
  }
}

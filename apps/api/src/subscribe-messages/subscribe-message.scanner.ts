import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { SUBSCRIBE_SCAN_INTERVAL_MS } from "./subscribe-message.constants";
import { SubscribeMessageService } from "./subscribe-message.service";

@Injectable()
export class SubscribeMessageScanner implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SubscribeMessageScanner.name);
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly service: SubscribeMessageService) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === "test" || process.env.VITEST) {
      return;
    }
    this.timer = setInterval(() => {
      void this.service.scan().catch((error: unknown) => {
        this.logger.error("subscribe message scan tick failed", error);
      });
    }, SUBSCRIBE_SCAN_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}

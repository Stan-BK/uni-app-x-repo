import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { SubscribeMessageJobs } from "../subscribe-messages/subscribe-message.jobs";
import { SubscribeMessagesModule } from "../subscribe-messages/subscribe-messages.module";
import { FakeWechatPay } from "./fake-wechat-pay";
import { PaymentExpiryScanner } from "./payment-expiry.scanner";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import {
  isWechatPayV3EnvConfigured,
  WechatPayV3Client,
} from "./wechat-pay-v3.client";
import { WECHAT_PAY_PORT, type WechatPayPort } from "./wechat-pay.port";

@Module({
  imports: [PrismaModule, ConfigModule, SubscribeMessagesModule],
  controllers: [PaymentsController],
  providers: [
    {
      provide: WECHAT_PAY_PORT,
      useFactory: (config: ConfigService): WechatPayPort => {
        if (isWechatPayV3EnvConfigured(config)) {
          return new WechatPayV3Client(config);
        }
        return new FakeWechatPay();
      },
      inject: [ConfigService],
    },
    {
      provide: PaymentsService,
      useFactory: (
        prisma: PrismaService,
        wechatPay: WechatPayPort,
        config: ConfigService,
        subscribeMessageJobs: SubscribeMessageJobs,
      ): PaymentsService =>
        new PaymentsService(prisma, wechatPay, config, subscribeMessageJobs),
      inject: [
        PrismaService,
        WECHAT_PAY_PORT,
        ConfigService,
        SubscribeMessageJobs,
      ],
    },
    PaymentExpiryScanner,
  ],
  exports: [PaymentsService, WECHAT_PAY_PORT],
})
export class PaymentsModule {}

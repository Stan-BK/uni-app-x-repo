import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { FakeWeixinSubscribe } from "./fake-weixin-subscribe";
import { SubscribeMessageJobs } from "./subscribe-message.jobs";
import { SubscribeMessageScanner } from "./subscribe-message.scanner";
import { SubscribeMessageService } from "./subscribe-message.service";
import {
  WEIXIN_SUBSCRIBE_PORT,
  type WeixinSubscribePort,
} from "./subscribe-message.port";
import { WeixinSubscribeClient } from "./weixin-subscribe.client";

@Module({
  imports: [PrismaModule, ConfigModule],
  providers: [
    SubscribeMessageJobs,
    {
      provide: WEIXIN_SUBSCRIBE_PORT,
      useFactory: (config: ConfigService): WeixinSubscribePort => {
        if (config.get<string>("WEIXIN_APPID") && config.get<string>("WEIXIN_SECRET")) {
          return new WeixinSubscribeClient(config);
        }
        return new FakeWeixinSubscribe();
      },
      inject: [ConfigService],
    },
    {
      provide: SubscribeMessageService,
      useFactory: (
        prisma: PrismaService,
        weixin: WeixinSubscribePort,
        config: ConfigService,
      ): SubscribeMessageService =>
        new SubscribeMessageService(prisma, weixin, config),
      inject: [PrismaService, WEIXIN_SUBSCRIBE_PORT, ConfigService],
    },
    SubscribeMessageScanner,
  ],
  exports: [SubscribeMessageJobs],
})
export class SubscribeMessagesModule {}

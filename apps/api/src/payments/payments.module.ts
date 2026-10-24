import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { FakeWechatPay } from "./fake-wechat-pay";
import { PaymentsService } from "./payments.service";
import type { WechatPayPort } from "./wechat-pay.port";

@Module({
  imports: [PrismaModule, ConfigModule],
  providers: [
    {
      provide: PaymentsService,
      useFactory: (
        prisma: PrismaService,
        config: ConfigService,
      ): PaymentsService => {
        const wechatPay: WechatPayPort = new FakeWechatPay();
        return new PaymentsService(prisma, wechatPay, config);
      },
      inject: [PrismaService, ConfigService],
    },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}

import {
  Controller,
  HttpCode,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import type { RawBodyRequest } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import { PaymentsService } from "./payments.service";
import { WechatPayV3Client } from "./wechat-pay-v3.client";

@Controller("payments")
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly config: ConfigService,
  ) {}

  @Post("wechat/notify")
  @HttpCode(200)
  async wechatNotify(@Req() req: RawBodyRequest<Request>) {
    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new UnauthorizedException("微信支付回调验签失败");
    }

    let parsed;
    try {
      parsed = WechatPayV3Client.parseNotification(
        req.headers,
        rawBody,
        this.config,
      );
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException("微信支付回调验签失败");
    }

    if (parsed.tradeState === "SUCCESS") {
      this.logger.log(
        `wechat notify paid outTradeNo=${parsed.outTradeNo} transactionId=${parsed.transactionId}`,
      );
      await this.paymentsService.confirmPaid({
        outTradeNo: parsed.outTradeNo,
        amountCents: parsed.amountCents,
        transactionId: parsed.transactionId,
        appId: parsed.appId,
        mchId: parsed.mchId,
      });
    }

    return { code: "SUCCESS" };
  }
}

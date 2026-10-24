import { buildClientPayParams } from "./wechat-pay-client-params";
import type { WechatPayPort, WechatTradeState } from "./wechat-pay.port";
import {
  WechatOutTradeNoUsedError,
} from "./wechat-pay.port";

type StoredOrder = {
  prepayId: string;
  amountCents: number;
  tradeState: WechatTradeState;
  transactionId: string | null;
};

export class FakeWechatPay implements WechatPayPort {
  private readonly orders = new Map<string, StoredOrder>();
  private prepaySeq = 0;

  async createJsapi(input: {
    outTradeNo: string;
    amountCents: number;
    description: string;
    payerOpenId: string;
    expireAt: Date;
  }): Promise<{ prepayId: string }> {
    if (this.orders.has(input.outTradeNo)) {
      throw new WechatOutTradeNoUsedError();
    }

    this.prepaySeq += 1;
    const prepayId = `fake-prepay-${this.prepaySeq}`;
    this.orders.set(input.outTradeNo, {
      prepayId,
      amountCents: input.amountCents,
      tradeState: "NOTPAY",
      transactionId: null,
    });

    return { prepayId };
  }

  async query(outTradeNo: string): Promise<{
    tradeState: WechatTradeState;
    transactionId: string | null;
    amountCents: number | null;
  }> {
    const order = this.orders.get(outTradeNo);
    // Unknown orders return NOTPAY so callers can treat them like unpaid/wechat-missing.
    if (!order) {
      return {
        tradeState: "NOTPAY",
        transactionId: null,
        amountCents: null,
      };
    }

    return {
      tradeState: order.tradeState,
      transactionId: order.transactionId,
      amountCents: order.amountCents,
    };
  }

  async close(outTradeNo: string): Promise<"closed" | "paid"> {
    const order = this.orders.get(outTradeNo);
    if (!order) {
      return "closed";
    }
    if (order.tradeState === "SUCCESS") {
      return "paid";
    }
    order.tradeState = "CLOSED";
    return "closed";
  }

  async refund(_input: {
    outRefundNo: string;
    outTradeNo: string;
    amountCents: number;
  }): Promise<"succeeded" | "processing" | "failed"> {
    return "succeeded";
  }

  /** Test helper: simulate WeChat payment success for query/close flows. */
  markPaid(outTradeNo: string, transactionId: string) {
    const order = this.orders.get(outTradeNo);
    if (!order) {
      return;
    }
    order.tradeState = "SUCCESS";
    order.transactionId = transactionId;
  }

  /** Test helper: pre-seed WeChat-side order without prepayId saved locally. */
  seedOrder(outTradeNo: string, amountCents: number) {
    this.orders.set(outTradeNo, {
      prepayId: "",
      amountCents,
      tradeState: "NOTPAY",
      transactionId: null,
    });
  }

  clientParams(prepayId: string) {
    return buildClientPayParams("fake-app-id", prepayId, () => "fake");
  }
}

export { WechatOutTradeNoUsedError };

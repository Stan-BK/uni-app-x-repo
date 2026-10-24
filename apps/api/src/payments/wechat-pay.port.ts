export const WECHAT_PAY_PORT = Symbol("WECHAT_PAY_PORT");

export type WechatTradeState = "NOTPAY" | "SUCCESS" | "CLOSED";

export class WechatOutTradeNoUsedError extends Error {
  constructor() {
    super("WECHAT_OUT_TRADE_NO_USED");
  }
}

export type ClientPayParams = {
  timeStamp: string;
  nonceStr: string;
  package: string;
  signType: "RSA";
  paySign: string;
};

export interface WechatPayPort {
  createJsapi(input: {
    outTradeNo: string;
    amountCents: number;
    description: string;
    payerOpenId: string;
    expireAt: Date;
  }): Promise<{ prepayId: string }>;
  query(outTradeNo: string): Promise<{
    tradeState: WechatTradeState;
    transactionId: string | null;
    amountCents: number | null;
  }>;
  close(outTradeNo: string): Promise<"closed" | "paid">;
  refund(input: {
    outRefundNo: string;
    outTradeNo: string;
    amountCents: number;
  }): Promise<"succeeded" | "processing" | "failed">;
  clientParams(prepayId: string): ClientPayParams;
}

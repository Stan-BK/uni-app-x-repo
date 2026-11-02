import type { SubscribeDataFields } from "./subscribe-message.payload";

export const WEIXIN_SUBSCRIBE_PORT = Symbol("WEIXIN_SUBSCRIBE_PORT");

export class WeixinSubscribeSendError extends Error {
  constructor(
    readonly errcode: number,
    message = `weixin subscribe send failed (${errcode})`,
  ) {
    super(message);
    this.name = "WeixinSubscribeSendError";
  }
}

export type WeixinSubscribeSendInput = {
  openId: string;
  templateId: string;
  page: string;
  data: SubscribeDataFields;
  miniprogramState: "developer" | "trial" | "formal";
};

export interface WeixinSubscribePort {
  send(input: WeixinSubscribeSendInput): Promise<void>;
}

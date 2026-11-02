import type {
  WeixinSubscribePort,
  WeixinSubscribeSendInput,
} from "./subscribe-message.port";

export class FakeWeixinSubscribe implements WeixinSubscribePort {
  readonly sent: WeixinSubscribeSendInput[] = [];
  nextError: Error | null = null;

  async send(input: WeixinSubscribeSendInput): Promise<void> {
    if (this.nextError) {
      const error = this.nextError;
      this.nextError = null;
      throw error;
    }
    this.sent.push(input);
  }
}

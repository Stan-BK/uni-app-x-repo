import { describe, expect, it } from "vitest";
import { buildClientPayParams } from "./wechat-pay-client-params";
import { FakeWechatPay } from "./fake-wechat-pay";
import { WechatOutTradeNoUsedError } from "./wechat-pay.port";

describe("buildClientPayParams", () => {
  it("builds wx.requestPayment params with injected sign", () => {
    const sign = (message: string) => `signed:${message}`;

    const first = buildClientPayParams("wx123", sign);
    const second = buildClientPayParams("wx123", sign);

    expect(first.package).toBe("prepay_id=wx123");
    expect(first.signType).toBe("RSA");
    expect(second.package).toBe("prepay_id=wx123");
    expect(second.signType).toBe("RSA");
    expect(first.nonceStr).not.toBe(second.nonceStr);
    expect(first.nonceStr).toHaveLength(32);
    expect(second.nonceStr).toHaveLength(32);
    expect(first.paySign).toBe(
      `signed:${first.timeStamp}\n${first.nonceStr}\n${first.package}\n`,
    );
    expect(Number(first.timeStamp)).toBeGreaterThan(0);
  });
});

describe("FakeWechatPay", () => {
  it("throws when outTradeNo is reused", async () => {
    const pay = new FakeWechatPay();
    const input = {
      outTradeNo: "order-1",
      amountCents: 100,
      description: "test",
      payerOpenId: "openid",
      expireAt: new Date(),
    };

    await pay.createJsapi(input);
    await expect(pay.createJsapi(input)).rejects.toBeInstanceOf(
      WechatOutTradeNoUsedError,
    );
  });

  it("returns NOTPAY for unknown outTradeNo on query", async () => {
    const pay = new FakeWechatPay();
    const result = await pay.query("missing-order");

    expect(result).toEqual({
      tradeState: "NOTPAY",
      transactionId: null,
      amountCents: null,
    });
  });

  it("clientParams uses fixed fake paySign", () => {
    const pay = new FakeWechatPay();
    const params = pay.clientParams("prepay-any");

    expect(params.paySign).toBe("fake");
    expect(params.package).toBe("prepay_id=prepay-any");
  });
});

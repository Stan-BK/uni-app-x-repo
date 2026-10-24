import type { ClientPayParams } from "./wechat-pay.port";

export type WechatPaySignFn = (message: string) => string;

const NONCE_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function randomNonceStr(length: number): string {
  let result = "";
  for (let i = 0; i < length; i += 1) {
    result += NONCE_CHARS[Math.floor(Math.random() * NONCE_CHARS.length)]!;
  }
  return result;
}

export function buildClientPayParams(
  prepayId: string,
  sign: WechatPaySignFn,
): ClientPayParams {
  const timeStamp = String(Math.floor(Date.now() / 1000));
  const nonceStr = randomNonceStr(32);
  const packageValue = `prepay_id=${prepayId}`;
  const message = `${timeStamp}\n${nonceStr}\n${packageValue}\n`;

  return {
    timeStamp,
    nonceStr,
    package: packageValue,
    signType: "RSA",
    paySign: sign(message),
  };
}

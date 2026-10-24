import {
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
  randomBytes,
  type KeyObject,
} from "node:crypto";
import { UnauthorizedException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { buildClientPayParams } from "./wechat-pay-client-params";
import type { ClientPayParams, WechatPayPort, WechatTradeState } from "./wechat-pay.port";
import { WechatOutTradeNoUsedError } from "./wechat-pay.port";

const WECHAT_PAY_API_BASE = "https://api.mch.weixin.qq.com";

export type WechatPayNotificationHeaders = Record<
  string,
  string | string[] | undefined
>;

export type ParsedWechatNotification = {
  outTradeNo: string;
  amountCents: number;
  transactionId: string;
  appId: string;
  mchId: string;
  tradeState: WechatTradeState;
};

export type WechatPayV3CryptoConfig = {
  apiV3Key: string;
  platformCertPem: string;
};

export type WechatPayRequestSignInput = {
  method: string;
  urlPath: string;
  timestamp: string;
  nonce: string;
  body: string;
  privateKeyPem: string;
  mchId: string;
  mchSerial: string;
};

export function buildWechatPayRequestSignMessage(input: {
  method: string;
  urlPath: string;
  timestamp: string;
  nonce: string;
  body: string;
}): string {
  return `${input.method}\n${input.urlPath}\n${input.timestamp}\n${input.nonce}\n${input.body}\n`;
}

export function buildWechatPayAuthorizationHeader(
  input: WechatPayRequestSignInput,
): string {
  const message = buildWechatPayRequestSignMessage(input);
  const privateKey = createPrivateKey(input.privateKeyPem);
  const signature = createSign("RSA-SHA256")
    .update(message)
    .sign(privateKey, "base64");

  return (
    `WECHATPAY2-SHA256-RSA2048 mchid="${input.mchId}",` +
    `nonce_str="${input.nonce}",signature="${signature}",` +
    `timestamp="${input.timestamp}",serial_no="${input.mchSerial}"`
  );
}

export function buildWechatPayNotificationVerifyMessage(input: {
  timestamp: string;
  nonce: string;
  body: string;
}): string {
  return `${input.timestamp}\n${input.nonce}\n${input.body}\n`;
}

export function verifyWechatPayNotificationSignature(input: {
  timestamp: string;
  nonce: string;
  body: string;
  signature: string;
  platformCertPem: string;
}): boolean {
  const message = buildWechatPayNotificationVerifyMessage(input);
  const publicKey = createPublicKey(input.platformCertPem);
  return createVerify("RSA-SHA256")
    .update(message)
    .verify(publicKey, input.signature, "base64");
}

export function decryptWechatPayResource(input: {
  ciphertext: string;
  nonce: string;
  associatedData: string;
  apiV3Key: string;
}): string {
  const key = Buffer.from(input.apiV3Key, "utf8");
  if (key.length !== 32) {
    throw new Error("WECHAT_PAY_API_V3_KEY must be 32 bytes");
  }
  const ciphertext = Buffer.from(input.ciphertext, "base64");
  const authTag = ciphertext.subarray(ciphertext.length - 16);
  const data = ciphertext.subarray(0, ciphertext.length - 16);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(input.nonce, "utf8"),
  );
  decipher.setAuthTag(authTag);
  if (input.associatedData) {
    decipher.setAAD(Buffer.from(input.associatedData, "utf8"));
  }
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8",
  );
}

export function parseWechatPayNotification(
  headers: WechatPayNotificationHeaders,
  rawBody: Buffer | string,
  config: WechatPayV3CryptoConfig,
): ParsedWechatNotification {
  const signature = headerValue(headers, "wechatpay-signature");
  const timestamp = headerValue(headers, "wechatpay-timestamp");
  const nonce = headerValue(headers, "wechatpay-nonce");
  if (!signature || !timestamp || !nonce) {
    throw new UnauthorizedException("微信支付回调验签失败");
  }

  const body =
    typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  const verified = verifyWechatPayNotificationSignature({
    timestamp,
    nonce,
    body,
    signature,
    platformCertPem: config.platformCertPem,
  });
  if (!verified) {
    throw new UnauthorizedException("微信支付回调验签失败");
  }

  const envelope = JSON.parse(body) as {
    resource?: {
      ciphertext?: string;
      nonce?: string;
      associated_data?: string;
    };
  };
  const resource = envelope.resource;
  if (!resource?.ciphertext || !resource.nonce) {
    throw new UnauthorizedException("微信支付回调资源无效");
  }

  const plaintext = decryptWechatPayResource({
    ciphertext: resource.ciphertext,
    nonce: resource.nonce,
    associatedData: resource.associated_data ?? "",
    apiV3Key: config.apiV3Key,
  });
  const transaction = JSON.parse(plaintext) as {
    out_trade_no?: string;
    transaction_id?: string;
    trade_state?: string;
    appid?: string;
    mchid?: string;
    amount?: { total?: number };
  };

  const tradeState = mapTradeState(transaction.trade_state);
  return {
    outTradeNo: transaction.out_trade_no ?? "",
    amountCents: transaction.amount?.total ?? 0,
    transactionId: transaction.transaction_id ?? "",
    appId: transaction.appid ?? "",
    mchId: transaction.mchid ?? "",
    tradeState,
  };
}

function headerValue(
  headers: WechatPayNotificationHeaders,
  name: string,
): string | undefined {
  const direct = headers[name];
  if (typeof direct === "string") {
    return direct;
  }
  if (Array.isArray(direct) && direct.length > 0) {
    return direct[0];
  }
  const lower = headers[name.toLowerCase()];
  if (typeof lower === "string") {
    return lower;
  }
  if (Array.isArray(lower) && lower.length > 0) {
    return lower[0];
  }
  return undefined;
}

function mapTradeState(value: string | undefined): WechatTradeState {
  if (value === "SUCCESS") {
    return "SUCCESS";
  }
  if (value === "CLOSED" || value === "REVOKED" || value === "PAYERROR") {
    return "CLOSED";
  }
  return "NOTPAY";
}

function readPem(config: ConfigService, key: string): string {
  return (config.get<string>(key) ?? "").replace(/\\n/g, "\n");
}

function randomNonceStr(length: number): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i += 1) {
    result += chars[Math.floor(Math.random() * chars.length)]!;
  }
  return result;
}

function toRfc3339(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "+00:00");
}

export function isWechatPayV3EnvConfigured(config: ConfigService): boolean {
  const keys = [
    "WECHAT_PAY_MCH_ID",
    "WECHAT_PAY_APP_ID",
    "WECHAT_PAY_MCH_SERIAL",
    "WECHAT_PAY_PRIVATE_KEY",
    "WECHAT_PAY_API_V3_KEY",
    "WECHAT_PAY_NOTIFY_URL",
    "WECHAT_PAY_PLATFORM_CERT",
  ] as const;
  return keys.every((key) => Boolean(config.get<string>(key)?.trim()));
}

export class WechatPayV3Client implements WechatPayPort {
  private readonly mchId: string;
  private readonly appId: string;
  private readonly mchSerial: string;
  private readonly privateKeyPem: string;
  private readonly apiV3Key: string;
  private readonly notifyUrl: string;
  private readonly platformCertPem: string;
  private readonly privateKey: KeyObject;

  constructor(private readonly config: ConfigService) {
    this.mchId = config.get<string>("WECHAT_PAY_MCH_ID") ?? "";
    this.appId = config.get<string>("WECHAT_PAY_APP_ID") ?? "";
    this.mchSerial = config.get<string>("WECHAT_PAY_MCH_SERIAL") ?? "";
    this.privateKeyPem = readPem(config, "WECHAT_PAY_PRIVATE_KEY");
    this.apiV3Key = config.get<string>("WECHAT_PAY_API_V3_KEY") ?? "";
    this.notifyUrl = config.get<string>("WECHAT_PAY_NOTIFY_URL") ?? "";
    this.platformCertPem = readPem(config, "WECHAT_PAY_PLATFORM_CERT");
    this.privateKey = createPrivateKey(this.privateKeyPem);
  }

  static parseNotification(
    headers: WechatPayNotificationHeaders,
    rawBody: Buffer | string,
    config: ConfigService,
  ): ParsedWechatNotification {
    return parseWechatPayNotification(headers, rawBody, {
      apiV3Key: config.get<string>("WECHAT_PAY_API_V3_KEY") ?? "",
      platformCertPem: readPem(config, "WECHAT_PAY_PLATFORM_CERT"),
    });
  }

  clientParams(prepayId: string): ClientPayParams {
    return buildClientPayParams(this.appId, prepayId, (message) =>
      createSign("RSA-SHA256")
        .update(message)
        .sign(this.privateKey, "base64"),
    );
  }

  async createJsapi(input: {
    outTradeNo: string;
    amountCents: number;
    description: string;
    payerOpenId: string;
    expireAt: Date;
  }): Promise<{ prepayId: string }> {
    const body = JSON.stringify({
      mchid: this.mchId,
      appid: this.appId,
      description: input.description,
      out_trade_no: input.outTradeNo,
      time_expire: toRfc3339(input.expireAt),
      notify_url: this.notifyUrl,
      amount: {
        total: input.amountCents,
        currency: "CNY",
      },
      payer: {
        openid: input.payerOpenId,
      },
    });
    const response = await this.request("POST", "/v3/pay/transactions/jsapi", body);
    if (response.code === "OUT_TRADE_NO_USED") {
      throw new WechatOutTradeNoUsedError();
    }
    if (response.code && response.code !== "SUCCESS") {
      throw new Error(`WECHAT_JSAPI_FAILED:${response.code}`);
    }
    const prepayId = response.prepay_id as string | undefined;
    if (!prepayId) {
      throw new Error("WECHAT_JSAPI_MISSING_PREPAY_ID");
    }
    return { prepayId };
  }

  async query(outTradeNo: string): Promise<{
    tradeState: WechatTradeState;
    transactionId: string | null;
    amountCents: number | null;
  }> {
    const urlPath = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}?mchid=${encodeURIComponent(this.mchId)}`;
    const response = await this.request("GET", urlPath, "");
    if (response.code === "ORDER_NOT_EXIST") {
      return {
        tradeState: "NOTPAY",
        transactionId: null,
        amountCents: null,
      };
    }
    return {
      tradeState: mapTradeState(response.trade_state as string | undefined),
      transactionId: (response.transaction_id as string | undefined) ?? null,
      amountCents:
        (response.amount as { total?: number } | undefined)?.total ?? null,
    };
  }

  async close(outTradeNo: string): Promise<"closed" | "paid"> {
    const urlPath = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}/close`;
    const body = JSON.stringify({ mchid: this.mchId });
    try {
      await this.request("POST", urlPath, body);
      return "closed";
    } catch (error) {
      if (isWechatErrorCode(error, "ORDERPAID")) {
        return "paid";
      }
      throw error;
    }
  }

  async refund(input: {
    outRefundNo: string;
    outTradeNo: string;
    amountCents: number;
  }): Promise<"succeeded" | "processing" | "failed"> {
    const body = JSON.stringify({
      out_trade_no: input.outTradeNo,
      out_refund_no: input.outRefundNo,
      amount: {
        refund: input.amountCents,
        total: input.amountCents,
        currency: "CNY",
      },
    });
    const response = await this.request(
      "POST",
      "/v3/refund/domestic/refunds",
      body,
    );
    const status = response.status as string | undefined;
    if (status === "SUCCESS") {
      return "succeeded";
    }
    if (status === "PROCESSING") {
      return "processing";
    }
    return "failed";
  }

  private async request(
    method: string,
    urlPath: string,
    body: string,
  ): Promise<Record<string, unknown>> {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = randomNonceStr(32);
    const authorization = buildWechatPayAuthorizationHeader({
      method,
      urlPath,
      timestamp,
      nonce,
      body,
      privateKeyPem: this.privateKeyPem,
      mchId: this.mchId,
      mchSerial: this.mchSerial,
    });

    const response = await fetch(`${WECHAT_PAY_API_BASE}${urlPath}`, {
      method,
      headers: {
        Authorization: authorization,
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "activity-api/wechat-pay-v3",
      },
      body: method === "GET" ? undefined : body,
    });

    const text = await response.text();
    const payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    if (!response.ok) {
      const code = payload.code as string | undefined;
      const err = new Error(code ?? `WECHAT_HTTP_${response.status}`);
      (err as Error & { wechatCode?: string }).wechatCode = code;
      throw err;
    }
    return payload;
  }
}

function isWechatErrorCode(error: unknown, code: string): boolean {
  return (
    error instanceof Error &&
    (error as Error & { wechatCode?: string }).wechatCode === code
  );
}

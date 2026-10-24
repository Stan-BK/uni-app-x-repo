import {
  createCipheriv,
  createSign,
  createVerify,
  generateKeyPairSync,
  randomBytes,
} from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildWechatPayAuthorizationHeader,
  buildWechatPayRequestSignMessage,
  decryptWechatPayResource,
  parseWechatPayNotification,
} from "./wechat-pay-v3.client";

describe("wechat pay v3 crypto", () => {
  it("builds stable request authorization with a fixed RSA key", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" });
    const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });

    const input = {
      method: "POST",
      urlPath: "/v3/pay/transactions/jsapi",
      timestamp: "1609459200",
      nonce: "nonce-fixed-123456789012345678",
      body: '{"out_trade_no":"PO123"}',
      privateKeyPem: String(privateKeyPem),
      mchId: "1900000109",
      mchSerial: "3775B6A258AC4C22A7AA6EAE874D42BEC9870785",
    };

    const message = buildWechatPayRequestSignMessage(input);
    expect(message).toBe(
      "POST\n/v3/pay/transactions/jsapi\n1609459200\nnonce-fixed-123456789012345678\n{\"out_trade_no\":\"PO123\"}\n",
    );

    const authorization = buildWechatPayAuthorizationHeader(input);
    const signature = authorization.match(/signature="([^"]+)"/)?.[1];
    expect(signature).toBeTruthy();

    const verified = createVerify("RSA-SHA256")
      .update(message)
      .verify(String(publicKeyPem), signature!, "base64");
    expect(verified).toBe(true);
  });

  it("decrypts notification resource and verifies callback signature", () => {
    const apiV3Key = "0123456789abcdef0123456789abcdef";
    const associatedData = "transaction";
    const nonce = "test-nonce-12";
    const plaintext = JSON.stringify({
      mchid: "1900000109",
      appid: "wx1234567890",
      out_trade_no: "POabcdef",
      transaction_id: "4200001234",
      trade_state: "SUCCESS",
      amount: { total: 100 },
    });

    const key = Buffer.from(apiV3Key, "utf8");
    const iv = Buffer.from(nonce, "utf8");
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from(associatedData, "utf8"));
    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    const ciphertext = Buffer.concat([encrypted, authTag]).toString("base64");

    const decrypted = decryptWechatPayResource({
      ciphertext,
      nonce,
      associatedData,
      apiV3Key,
    });
    expect(JSON.parse(decrypted)).toMatchObject({
      out_trade_no: "POabcdef",
      transaction_id: "4200001234",
      trade_state: "SUCCESS",
    });

    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const privateKeyPem = String(
      privateKey.export({ type: "pkcs8", format: "pem" }),
    );
    const platformCertPem = String(
      publicKey.export({ type: "spki", format: "pem" }),
    );

    const body = JSON.stringify({
      resource: {
        ciphertext,
        nonce,
        associated_data: associatedData,
      },
    });

    const timestamp = "1609459200";
    const headerNonce = randomBytes(16).toString("hex");
    const message = `${timestamp}\n${headerNonce}\n${body}\n`;
    const signature = createSign("RSA-SHA256")
      .update(message)
      .sign(privateKeyPem, "base64");

    const parsed = parseWechatPayNotification(
      {
        "wechatpay-signature": signature,
        "wechatpay-timestamp": timestamp,
        "wechatpay-nonce": headerNonce,
      },
      body,
      { apiV3Key, platformCertPem },
    );

    expect(parsed).toEqual({
      outTradeNo: "POabcdef",
      amountCents: 100,
      transactionId: "4200001234",
      appId: "wx1234567890",
      mchId: "1900000109",
      tradeState: "SUCCESS",
    });
  });
});

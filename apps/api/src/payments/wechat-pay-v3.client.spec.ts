import {
  createCipheriv,
  createSign,
  createVerify,
  generateKeyPairSync,
  randomBytes,
} from "node:crypto";
import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import {
  buildWechatPayAuthorizationHeader,
  buildWechatPayRequestSignMessage,
  decryptWechatPayResource,
  parseWechatPayNotification,
  readPlatformCertificateSerial,
} from "./wechat-pay-v3.client";

const TEST_PLATFORM_CERT_PEM = `-----BEGIN CERTIFICATE-----
MIICpDCCAYwCBQDerb7vMA0GCSqGSIb3DQEBCwUAMBYxFDASBgNVBAMMC3dlY2hh
dC10ZXN0MB4XDTI2MTAyNDA0NTQyOVoXDTM2MTAyMTA0NTQyOVowFjEUMBIGA1UE
AwwLd2VjaGF0LXRlc3QwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQCy
jCTeIJcNa2Qv5weOZeJZ6pn81hZBKpnvFAVOrhHgOh4dWyU+4F/+jNleuAgjkGmq
yqpPSqXC0gY6fDrMYsdJ/TzRTCZqTACmxMOcmzhw0xGt1eACP+P8o2e/gLomfAoG
puqKOzrX0UQp2LiGIWKPMNjzlVP7K1E3zSXoKWz39hzb8C8BuDXoapuwh9GzgPMF
2RRiAc56bHQmRjkqvJQ8WE6l7PGopD/0lqI65jKpahVXQEm1UfghJRDGmansEqqJ
1Lv7adKaNfmGodRx28krv9Ckejk/pC3kHDojZY2q5PtoYjXAdnQqVPlN7xgOLqI1
BP8riB56Qo3mwDfCMhkLAgMBAAEwDQYJKoZIhvcNAQELBQADggEBAK7PlxPkAYBs
/FL9Tco38pBDTWEfUwfm5+N4FmNlCEYs7JIT3Dq/953P5D6nwqYTe1ydr5lBx8HB
4cNDkYsR39Eob1nwvtD098TXjvppVmg4iz+uAUFLvng6SUF9feGzCtMO1frKRxqV
oupvbstSvs+k1th4SCinrXLwBTd+gWHvsj4lDSXP7EFNo0oeydO1b3UvhV9LDiVt
ZRaJ79IKCzF0adjuWP5ZLkEQtREaFQRcc/OBcsaCzoJ1EvxDggDdTYuEx+STN7vP
8TjZis2F+kDE1qzLZyx3DoISfbMMBjJNy+n+UgiJ8PPuIbDq3J8T5MDNJPSGbFJy
YFAbIfH2ctM=
-----END CERTIFICATE-----`;

const TEST_PLATFORM_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MIIEwAIBADANBgkqhkiG9w0BAQEFAASCBKowggSmAgEAAoIBAQCyjCTeIJcNa2Qv
5weOZeJZ6pn81hZBKpnvFAVOrhHgOh4dWyU+4F/+jNleuAgjkGmqyqpPSqXC0gY6
fDrMYsdJ/TzRTCZqTACmxMOcmzhw0xGt1eACP+P8o2e/gLomfAoGpuqKOzrX0UQp
2LiGIWKPMNjzlVP7K1E3zSXoKWz39hzb8C8BuDXoapuwh9GzgPMF2RRiAc56bHQm
RjkqvJQ8WE6l7PGopD/0lqI65jKpahVXQEm1UfghJRDGmansEqqJ1Lv7adKaNfmG
odRx28krv9Ckejk/pC3kHDojZY2q5PtoYjXAdnQqVPlN7xgOLqI1BP8riB56Qo3m
wDfCMhkLAgMBAAECggEBAJ+41OZM2zPrBPYBQ3Y0WHe9ccGHtuLW/FuuWk0XVPB0
rSnvtnL3/4fUckPUd5tw/cYGhLJoAb81aNL6/RKHruXWf4hwCdF/afnF/YNkK+pq
Nt9+e2UnyIjhmNbsjhoNTl7DBP9hmvMjxkl1ESUUSnnz5bCJvlXrWz2C7M0x+cQa
zGVkIHFJF6j9zH/rrHDLClnzO3sU5Z8oD/+6OsriTx2exdj/6LNL7Cr8TkAFuqHy
xGkr7ZSp+QL0Dowo5H0sgEVfJL1Ha44m8QsT7DxS1gFjDBVXjoW+rvK+EzDESuP/
/FEdklq7/g8OFondAP6oD5N+rq4G5gTfWcNdKe3DtiECgYEA4wAdJY+Iiu4oHCLW
F6kFvhcUPe8WPlZVI8V/cIr+Eq5QeyFDTE+uRQ0d0t2fzMc/wsAafBeGyrr6MZPt
HrJIGLR8UxCr8f3m8whhMcvjYfd5cYGwJ6tke9OC2Pd5HI/Qx6/Gof+g4QxQdGmP
yTdphrgZaMZ42UrR/NP26o3CXjsCgYEAyVto0OR+D72Y28buRJUAHuhcTdWd1JCw
g9tObNVcbre4CJT9i/1lJ+FlWxgA5p7iF+LiedCJDjV4kZpLrDBXj300NdfvIhte
sRvbHXq5K0xJWhl6GpqAONQ6AT0CCT2mVTm7jBoGUv1EgSeMxgSKUIojBUODU0Oi
Mc8LG/IWc3ECgYEA1m5BGj4gKb0XPpzZyLftqMd8Y5T6WiCLhKMH43Qo1dS8SdP+
EpQidzAQwCSC05pUbM+zNQ20UsWVmke2cozO9idoWb8h7hJ+m42K4tNLFDwGCGcN
1CtfXGlM7U+4pHZmLnupE1a6zlwnlBAzt0wU7yHxPrxdZEX9XuuMD72hogkCgYEA
jkJUtXEZV0mem3fakv2qTivgOuV3Uty+uQnSSLYdTePi071fvO3T7+8gytEUodsS
5clYNLQOgMlqW4RlfkvRMQFGR9w9iR1JM1v43MT92gdVs6BYUj9h48SdDo7px1mV
EJVvWbZxTWS+Z3lnzecbSXeu8mMWf1dDWmlq8d2B2yECgYEAyeEIwlxOBf60oz/7
oaY29Iaf/uLnANu6TEZWziKq7hfvJok+k+OJiISBqpAJiwd5lTt3jiT0m5+zmy6V
+BCPm9G3xBD03RpoqnkCzqbRc9bVbMQYTIwynmpnqT/NnmTUZuCu4uvI3kKfSToO
s7V+02aM826PGKeKVVruLfdjvBE=
-----END PRIVATE KEY-----`;

const TEST_PLATFORM_SERIAL = readPlatformCertificateSerial(TEST_PLATFORM_CERT_PEM);

function buildSignedNotification(input: {
  timestamp: string;
  privateKeyPem?: string;
  platformCertPem?: string;
  serial?: string;
}) {
  const apiV3Key = "0123456789abcdef0123456789abcdef";
  const associatedData = "transaction";
  const resourceNonce = "test-nonce-12";
  const plaintext = JSON.stringify({
    mchid: "1900000109",
    appid: "wx1234567890",
    out_trade_no: "POabcdef",
    transaction_id: "4200001234",
    trade_state: "SUCCESS",
    amount: { total: 100 },
  });

  const key = Buffer.from(apiV3Key, "utf8");
  const iv = Buffer.from(resourceNonce, "utf8");
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(associatedData, "utf8"));
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  const ciphertext = Buffer.concat([encrypted, authTag]).toString("base64");

  const body = JSON.stringify({
    resource: {
      ciphertext,
      nonce: resourceNonce,
      associated_data: associatedData,
    },
  });

  const privateKeyPem = input.privateKeyPem ?? TEST_PLATFORM_KEY_PEM;
  const headerNonce = randomBytes(16).toString("hex");
  const message = `${input.timestamp}\n${headerNonce}\n${body}\n`;
  const signature = createSign("RSA-SHA256")
    .update(message)
    .sign(privateKeyPem, "base64");

  return {
    apiV3Key,
    platformCertPem: input.platformCertPem ?? TEST_PLATFORM_CERT_PEM,
    body,
    headers: {
      "wechatpay-signature": signature,
      "wechatpay-timestamp": input.timestamp,
      "wechatpay-nonce": headerNonce,
      "wechatpay-serial": input.serial ?? TEST_PLATFORM_SERIAL,
    },
  };
}

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

    const timestamp = "1609459200";
    const signed = buildSignedNotification({ timestamp });

    const parsed = parseWechatPayNotification(
      signed.headers,
      signed.body,
      {
        apiV3Key: signed.apiV3Key,
        platformCertPem: signed.platformCertPem,
        now: new Date(Number(timestamp) * 1000),
      },
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

  it("rejects notification when timestamp is outside the 5 minute window", () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signed = buildSignedNotification({ timestamp });
    const staleNow = new Date((Number(timestamp) + 6 * 60) * 1000);

    expect(() =>
      parseWechatPayNotification(signed.headers, signed.body, {
        apiV3Key: signed.apiV3Key,
        platformCertPem: signed.platformCertPem,
        now: staleNow,
      }),
    ).toThrow(UnauthorizedException);
  });

  it("rejects notification when wechatpay-serial does not match platform cert", () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signed = buildSignedNotification({
      timestamp,
      serial: "0000FFFF",
    });

    expect(() =>
      parseWechatPayNotification(signed.headers, signed.body, {
        apiV3Key: signed.apiV3Key,
        platformCertPem: signed.platformCertPem,
        now: new Date(Number(timestamp) * 1000),
      }),
    ).toThrow(UnauthorizedException);
  });
});

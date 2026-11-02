import { ConfigService } from "@nestjs/config";
import {
  WeixinSubscribeSendError,
  type WeixinSubscribePort,
  type WeixinSubscribeSendInput,
} from "./subscribe-message.port";

/** 网络失败 / 无法解析响应。 */
export const WEIXIN_NETWORK_ERRCODE = -1;
/** 微信 token 失效类错误码：清缓存，下次重新获取。 */
const TOKEN_INVALID_ERRCODES = new Set([40001, 40014, 42001]);
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

type TokenBody = {
  access_token?: string;
  expires_in?: number;
  errcode?: number;
  errmsg?: string;
};
type SendBody = { errcode?: number; errmsg?: string };

export class WeixinSubscribeClient implements WeixinSubscribePort {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(private readonly config: ConfigService) {}

  async send(input: WeixinSubscribeSendInput): Promise<void> {
    const accessToken = await this.getAccessToken();
    const url = new URL("https://api.weixin.qq.com/cgi-bin/message/subscribe/send");
    url.searchParams.set("access_token", accessToken);

    let body: SendBody;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          touser: input.openId,
          template_id: input.templateId,
          page: input.page,
          data: input.data,
          miniprogram_state: input.miniprogramState,
        }),
      });
      if (!res.ok) {
        throw new WeixinSubscribeSendError(
          res.status,
          `weixin subscribe send http ${res.status}`,
        );
      }
      body = (await res.json()) as SendBody;
    } catch (error) {
      if (error instanceof WeixinSubscribeSendError) {
        throw error;
      }
      throw new WeixinSubscribeSendError(
        WEIXIN_NETWORK_ERRCODE,
        "weixin subscribe send network error",
      );
    }

    if (body.errcode) {
      if (TOKEN_INVALID_ERRCODES.has(body.errcode)) {
        this.token = null;
      }
      throw new WeixinSubscribeSendError(
        body.errcode,
        `weixin subscribe send failed: ${body.errmsg ?? "unknown"} (${body.errcode})`,
      );
    }
  }

  private async getAccessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt) {
      return this.token.value;
    }
    const appid = this.config.get<string>("WEIXIN_APPID");
    const secret = this.config.get<string>("WEIXIN_SECRET");
    if (!appid || !secret) {
      throw new WeixinSubscribeSendError(
        WEIXIN_NETWORK_ERRCODE,
        "weixin credentials are not configured",
      );
    }
    const url = new URL("https://api.weixin.qq.com/cgi-bin/token");
    url.searchParams.set("grant_type", "client_credential");
    url.searchParams.set("appid", appid);
    url.searchParams.set("secret", secret);

    let body: TokenBody;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new WeixinSubscribeSendError(
          res.status,
          `weixin token http ${res.status}`,
        );
      }
      body = (await res.json()) as TokenBody;
    } catch (error) {
      if (error instanceof WeixinSubscribeSendError) {
        throw error;
      }
      throw new WeixinSubscribeSendError(
        WEIXIN_NETWORK_ERRCODE,
        "weixin token network error",
      );
    }
    if (body.errcode || !body.access_token) {
      throw new WeixinSubscribeSendError(
        body.errcode ?? WEIXIN_NETWORK_ERRCODE,
        `weixin token failed: ${body.errmsg ?? "no access_token"}`,
      );
    }
    const ttlMs = Math.max((body.expires_in ?? 7200) * 1000 - TOKEN_REFRESH_MARGIN_MS, 0);
    this.token = { value: body.access_token, expiresAt: Date.now() + ttlMs };
    return body.access_token;
  }
}

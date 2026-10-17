import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export type WeixinSession = {
  openid: string;
  session_key?: string;
  unionid?: string;
};

type WeixinErrorBody = {
  errcode?: number;
  errmsg?: string;
};

@Injectable()
export class WeixinClient {
  constructor(private readonly config: ConfigService) {}

  async code2Session(code: string): Promise<WeixinSession> {
    const appid = this.config.get<string>("WEIXIN_APPID");
    const secret = this.config.get<string>("WEIXIN_SECRET");
    if (!appid || !secret) {
      throw new HttpException(
        "Weixin credentials are not configured",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const url = new URL("https://api.weixin.qq.com/sns/jscode2session");
    url.searchParams.set("appid", appid);
    url.searchParams.set("secret", secret);
    url.searchParams.set("js_code", code);
    url.searchParams.set("grant_type", "authorization_code");

    let body: WeixinSession & WeixinErrorBody;
    try {
      const res = await fetch(url);
      body = (await res.json()) as WeixinSession & WeixinErrorBody;
    } catch {
      throw new HttpException(
        "Failed to reach Weixin jscode2session",
        HttpStatus.BAD_GATEWAY,
      );
    }

    if (body.errcode || !body.openid) {
      throw new HttpException(
        `Weixin login failed: ${body.errmsg ?? "unknown error"} (${body.errcode ?? "no openid"})`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    return {
      openid: body.openid,
      session_key: body.session_key,
      unionid: body.unionid,
    };
  }
}

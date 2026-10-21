import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService, type JwtSignOptions } from "@nestjs/jwt";
import { IdentityProvider, type User } from "@prisma/client";
import { BusinessEvent } from "@activity/shared";
import { logBusinessEvent } from "../common/log-business-event";
import { PrismaService } from "../prisma/prisma.service";
import { WeixinClient } from "./weixin.client";

const DEV_OPEN_ID = "dev-openid";

export type AuthUserView = {
  id: string;
  nickname: string | null;
  avatarUrl: string | null;
};

export type LoginResult = {
  accessToken: string;
  user: AuthUserView;
};

export type MeResult = AuthUserView & {
  canPublish: boolean;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly weixin: WeixinClient,
  ) {}

  async login(input: { code: string }): Promise<LoginResult> {
    const bypass = this.config.get<string>("AUTH_DEV_BYPASS") === "true";
    const appid = this.config.get<string>("WEIXIN_APPID");
    const secret = this.config.get<string>("WEIXIN_SECRET");
    const weixinConfigured = Boolean(appid && secret);

    // 开发旁路：显式 code=dev，或未配置微信密钥时（真机/预览拿到真实 code 也能联调）
    if (bypass && (input.code === "dev" || !weixinConfigured)) {
      return this.loginWithDev();
    }

    const session = await this.weixin.code2Session(input.code);
    const user = await this.upsertWeixinUser(session.openid, session.unionid);
    return this.issueToken(user);
  }

  async loginWithDev(): Promise<LoginResult> {
    if (this.config.get<string>("AUTH_DEV_BYPASS") !== "true") {
      throw new HttpException("Dev bypass is disabled", HttpStatus.FORBIDDEN);
    }
    const user = await this.upsertWeixinUser(DEV_OPEN_ID);
    return this.issueToken(user);
  }

  async getMe(userId: string): Promise<MeResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new HttpException("User not found", HttpStatus.NOT_FOUND);
    }
    return {
      id: user.id,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      canPublish: user.canPublish,
    };
  }

  private async upsertWeixinUser(
    openId: string,
    unionId?: string,
  ): Promise<User> {
    const existing = await this.prisma.userIdentity.findUnique({
      where: {
        provider_openId: { provider: IdentityProvider.weixin, openId },
      },
      include: { user: true },
    });
    if (existing) {
      if (unionId && !existing.unionId) {
        await this.prisma.userIdentity.update({
          where: { id: existing.id },
          data: { unionId },
        });
      }
      return existing.user;
    }

    return this.prisma.user.create({
      data: {
        nickname: openId === DEV_OPEN_ID ? "Dev User" : null,
        identities: {
          create: {
            provider: IdentityProvider.weixin,
            openId,
            unionId: unionId ?? null,
          },
        },
      },
    });
  }

  private issueToken(user: User): LoginResult {
    const secret = this.config.getOrThrow<string>("JWT_USER_SECRET");
    const expiresIn = (this.config.get<string>("JWT_EXPIRES_IN") ??
      "7d") as JwtSignOptions["expiresIn"];
    const accessToken = this.jwt.sign(
      { sub: user.id, typ: "user" },
      { secret, expiresIn },
    );
    logBusinessEvent({ event: BusinessEvent.UserLogin, actorId: user.id });
    return {
      accessToken,
      user: {
        id: user.id,
        nickname: user.nickname,
        avatarUrl: user.avatarUrl,
      },
    };
  }
}

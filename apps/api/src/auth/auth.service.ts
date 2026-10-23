import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService, type JwtSignOptions } from "@nestjs/jwt";
import { IdentityProvider, type User } from "@prisma/client";
import {
  BusinessEvent,
  NICKNAME_MAX_LENGTH,
  PHONE_PATTERN,
  REAL_NAME_MAX_LENGTH,
} from "@activity/shared";
import { logBusinessEvent } from "../common/log-business-event";
import { PrismaService } from "../prisma/prisma.service";
import { isAllowedAvatarUrl } from "./avatar-url";
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
  realName: string | null;
  phone: string | null;
  canPublish: boolean;
};

function toMeResult(user: User): MeResult {
  return {
    id: user.id,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
    realName: user.realName,
    phone: user.phone,
    canPublish: user.canPublish,
  };
}

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
    return toMeResult(user);
  }

  async updateMe(
    userId: string,
    input: {
      nickname?: string | null;
      avatarUrl?: string | null;
      realName?: string | null;
      phone?: string | null;
    },
  ): Promise<MeResult> {
    const hasNickname = Object.prototype.hasOwnProperty.call(input, "nickname");
    const hasAvatar = Object.prototype.hasOwnProperty.call(input, "avatarUrl");
    const hasRealName = Object.prototype.hasOwnProperty.call(input, "realName");
    const hasPhone = Object.prototype.hasOwnProperty.call(input, "phone");
    if (!hasNickname && !hasAvatar && !hasRealName && !hasPhone) {
      throw new HttpException("请提供要更新的字段", HttpStatus.BAD_REQUEST);
    }

    const data: {
      nickname?: string | null;
      avatarUrl?: string | null;
      realName?: string | null;
      phone?: string | null;
    } = {};

    if (hasNickname) {
      if (input.nickname == null) {
        data.nickname = null;
      } else {
        const nickname = input.nickname.trim();
        if (nickname.length > NICKNAME_MAX_LENGTH) {
          throw new HttpException("昵称过长", HttpStatus.BAD_REQUEST);
        }
        data.nickname = nickname.length ? nickname : null;
      }
    }

    if (hasAvatar) {
      if (input.avatarUrl == null) {
        data.avatarUrl = null;
      } else if (!isAllowedAvatarUrl(input.avatarUrl)) {
        throw new HttpException("头像地址无效", HttpStatus.BAD_REQUEST);
      } else {
        data.avatarUrl = input.avatarUrl;
      }
    }

    if (hasRealName) {
      if (input.realName == null) {
        data.realName = null;
      } else {
        const realName = input.realName.trim();
        if (realName.length > REAL_NAME_MAX_LENGTH) {
          throw new HttpException("报名姓名过长", HttpStatus.BAD_REQUEST);
        }
        data.realName = realName.length ? realName : null;
      }
    }

    if (hasPhone) {
      if (input.phone == null) {
        data.phone = null;
      } else {
        const phone = input.phone.trim();
        if (!phone.length) {
          data.phone = null;
        } else if (!PHONE_PATTERN.test(phone)) {
          throw new HttpException("手机号格式不正确", HttpStatus.BAD_REQUEST);
        } else {
          data.phone = phone;
        }
      }
    }

    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data,
      });
      return toMeResult(user);
    } catch {
      throw new HttpException("User not found", HttpStatus.NOT_FOUND);
    }
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

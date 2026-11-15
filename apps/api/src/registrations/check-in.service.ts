import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService, TokenExpiredError } from "@nestjs/jwt";
import { CheckInErrorCode } from "@activity/shared";
import { ActivityLifecycle, RegistrationStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const DEFAULT_TTL_SEC = 180;
const CHECK_IN_PURPOSE = "checkin";

type CheckInTokenPayload = {
  sub: string;
  purpose: string;
  registrationId: string;
  activityId: string;
};

export type CheckInResult = {
  registrationId: string;
  name: string;
  phone: string;
  checkedInAt: string;
  alreadyCheckedIn: boolean;
};

/** 活动签到：参与者发码（短时 JWT）+ 组织者验码/手动核销（ADR-0017）。 */
@Injectable()
export class CheckInService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private ttlSec(): number {
    const raw = Number(this.config.get<string>("CHECK_IN_TOKEN_TTL_SEC"));
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_TTL_SEC;
  }

  private secret(): string {
    return this.config.getOrThrow<string>("JWT_USER_SECRET");
  }

  private isOngoing(endAt: Date | null): endAt is Date {
    return endAt != null && Date.now() < endAt.getTime();
  }

  private notAllowed(message: string): ConflictException {
    return new ConflictException({
      message,
      code: CheckInErrorCode.NotAllowed,
    });
  }

  async issueToken(userId: string, registrationId: string) {
    const reg = await this.prisma.registration.findUnique({
      where: { id: registrationId },
      include: { activity: true },
    });
    if (!reg) {
      throw new NotFoundException({
        message: "报名不存在",
        code: CheckInErrorCode.RegistrationNotFound,
      });
    }
    if (reg.userId !== userId) {
      throw new ForbiddenException({
        message: "无权获取该报名的签到码",
        code: CheckInErrorCode.Forbidden,
      });
    }
    if (reg.checkedInAt) {
      throw new ConflictException({
        message: "已签到",
        code: CheckInErrorCode.AlreadyDone,
      });
    }
    if (
      reg.status !== RegistrationStatus.confirmed ||
      reg.activity.lifecycle !== ActivityLifecycle.published ||
      !this.isOngoing(reg.activity.endAt)
    ) {
      throw this.notAllowed("当前报名不可签到");
    }

    const expiresInSec = this.ttlSec();
    const payload: CheckInTokenPayload = {
      sub: userId,
      purpose: CHECK_IN_PURPOSE,
      registrationId: reg.id,
      activityId: reg.activityId,
    };
    const token = this.jwt.sign(payload, {
      secret: this.secret(),
      expiresIn: `${expiresInSec}s`,
    });
    return { token, expiresInSec };
  }

  async checkInWithToken(
    ownerUserId: string,
    activityId: string,
    token: string,
  ): Promise<CheckInResult> {
    const payload = this.verifyToken(token);
    if (payload.activityId !== activityId) {
      throw this.tokenInvalid();
    }
    return this.applyCheckIn(ownerUserId, activityId, payload.registrationId);
  }

  async checkInManual(
    ownerUserId: string,
    activityId: string,
    registrationId: string,
  ): Promise<CheckInResult> {
    return this.applyCheckIn(ownerUserId, activityId, registrationId);
  }

  private tokenInvalid(): BadRequestException {
    return new BadRequestException({
      message: "签到码无效",
      code: CheckInErrorCode.TokenInvalid,
    });
  }

  private verifyToken(token: string): CheckInTokenPayload {
    let payload: Partial<CheckInTokenPayload>;
    try {
      payload = this.jwt.verify<Partial<CheckInTokenPayload>>(token, {
        secret: this.secret(),
      });
    } catch (err) {
      if (err instanceof TokenExpiredError) {
        throw new BadRequestException({
          message: "签到码已过期，请刷新后重试",
          code: CheckInErrorCode.TokenExpired,
        });
      }
      throw this.tokenInvalid();
    }
    if (
      payload.purpose !== CHECK_IN_PURPOSE ||
      typeof payload.registrationId !== "string" ||
      typeof payload.activityId !== "string"
    ) {
      throw this.tokenInvalid();
    }
    return payload as CheckInTokenPayload;
  }

  private async applyCheckIn(
    ownerUserId: string,
    activityId: string,
    registrationId: string,
  ): Promise<CheckInResult> {
    const activity = await this.prisma.activity.findUnique({
      where: { id: activityId },
    });
    if (!activity) {
      throw new NotFoundException("活动不存在");
    }
    if (activity.ownerUserId !== ownerUserId) {
      throw new ForbiddenException({
        message: "仅活动所有者可核销签到",
        code: CheckInErrorCode.Forbidden,
      });
    }

    const reg = await this.prisma.registration.findUnique({
      where: { id: registrationId },
    });
    if (!reg || reg.activityId !== activityId) {
      throw new NotFoundException({
        message: "报名不存在",
        code: CheckInErrorCode.RegistrationNotFound,
      });
    }
    if (
      reg.status !== RegistrationStatus.confirmed ||
      activity.lifecycle !== ActivityLifecycle.published ||
      !this.isOngoing(activity.endAt)
    ) {
      throw this.notAllowed("当前报名不可签到");
    }

    const toResult = (
      row: { id: string; name: string; phone: string },
      checkedInAt: Date,
      alreadyCheckedIn: boolean,
    ): CheckInResult => ({
      registrationId: row.id,
      name: row.name,
      phone: row.phone,
      checkedInAt: checkedInAt.toISOString(),
      alreadyCheckedIn,
    });

    if (reg.checkedInAt) {
      return toResult(reg, reg.checkedInAt, true);
    }

    // 条件更新：并发重复核销时只有一次写入，其余按幂等返回
    const now = new Date();
    const { count } = await this.prisma.registration.updateMany({
      where: { id: reg.id, checkedInAt: null },
      data: { checkedInAt: now, checkedInByUserId: ownerUserId },
    });
    if (count === 1) {
      return toResult(reg, now, false);
    }
    const latest = await this.prisma.registration.findUnique({
      where: { id: reg.id },
    });
    if (!latest?.checkedInAt) {
      throw this.notAllowed("当前报名不可签到");
    }
    return toResult(latest, latest.checkedInAt, true);
  }
}

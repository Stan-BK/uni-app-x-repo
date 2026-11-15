import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { CheckInErrorCode } from "@activity/shared";
import { ActivityLifecycle, RegistrationStatus } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { CheckInService } from "./check-in.service";

const SECRET = "test-user-secret";
const OWNER = "owner-1";
const USER = "user-1";
const ACTIVITY_ID = "act-1";
const REG_ID = "reg-1";

describe("CheckInService", () => {
  let service: CheckInService;
  let jwt: JwtService;
  const prisma = {
    activity: { findUnique: vi.fn() },
    registration: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  const config = {
    getOrThrow: vi.fn((key: string) => {
      if (key === "JWT_USER_SECRET") return SECRET;
      throw new Error(`unexpected key ${key}`);
    }),
    get: vi.fn((key: string) =>
      key === "CHECK_IN_TOKEN_TTL_SEC" ? "180" : undefined,
    ),
  };

  const future = () => new Date(Date.now() + 3600_000);
  const past = () => new Date(Date.now() - 3600_000);

  const regRow = (over: Record<string, unknown> = {}) => ({
    id: REG_ID,
    activityId: ACTIVITY_ID,
    userId: USER,
    name: "张三",
    phone: "13800000000",
    status: RegistrationStatus.confirmed,
    checkedInAt: null,
    checkedInByUserId: null,
    activity: {
      id: ACTIVITY_ID,
      lifecycle: ActivityLifecycle.published,
      endAt: future(),
      ownerUserId: OWNER,
    },
    ...over,
  });

  const activityRow = (over: Record<string, unknown> = {}) => ({
    id: ACTIVITY_ID,
    lifecycle: ActivityLifecycle.published,
    endAt: future(),
    ownerUserId: OWNER,
    ...over,
  });

  const signCheckIn = (
    payload: Record<string, unknown> = {},
    expiresIn: number | string = 180,
  ) =>
    jwt.sign(
      {
        sub: USER,
        purpose: "checkin",
        registrationId: REG_ID,
        activityId: ACTIVITY_ID,
        ...payload,
      },
      { secret: SECRET, expiresIn: expiresIn as never },
    );

  const expectCode = async (p: Promise<unknown>, Cls: unknown, code: string) => {
    const err = await p.then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(Cls as never);
    expect(
      ((err as { getResponse: () => unknown }).getResponse() as { code: string })
        .code,
    ).toBe(code);
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        CheckInService,
        JwtService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    service = mod.get(CheckInService);
    jwt = mod.get(JwtService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("issueToken", () => {
    it("本人 + confirmed + 未结束 → 返回 token 与 expiresInSec", async () => {
      prisma.registration.findUnique.mockResolvedValue(regRow());
      const before = Date.now();
      const res = await service.issueToken(USER, REG_ID);
      const after = Date.now();
      expect(res.expiresInSec).toBe(180);
      expect(res.activityId).toBe(ACTIVITY_ID);
      expect(res.registrationId).toBe(REG_ID);
      const expiresAtMs = new Date(res.expiresAt).getTime();
      expect(res.expiresAt).toBe(new Date(expiresAtMs).toISOString());
      expect(expiresAtMs).toBeGreaterThanOrEqual(before + 180_000);
      expect(expiresAtMs).toBeLessThanOrEqual(after + 180_000);
      const payload = jwt.verify<Record<string, unknown>>(res.token, {
        secret: SECRET,
      });
      expect(payload).toMatchObject({
        sub: USER,
        purpose: "checkin",
        registrationId: REG_ID,
        activityId: ACTIVITY_ID,
      });
      expect(payload.typ).toBeUndefined();
      expect((payload.exp as number) - (payload.iat as number)).toBe(180);
    });

    it("报名不存在 → 404 REGISTRATION_NOT_FOUND", async () => {
      prisma.registration.findUnique.mockResolvedValue(null);
      await expectCode(
        service.issueToken(USER, REG_ID),
        NotFoundException,
        CheckInErrorCode.RegistrationNotFound,
      );
    });

    it("已签到 → 409 CHECK_IN_ALREADY_DONE", async () => {
      prisma.registration.findUnique.mockResolvedValue(
        regRow({ checkedInAt: new Date() }),
      );
      await expectCode(
        service.issueToken(USER, REG_ID),
        ConflictException,
        CheckInErrorCode.AlreadyDone,
      );
    });

    it("非本人 → 403 CHECK_IN_FORBIDDEN", async () => {
      prisma.registration.findUnique.mockResolvedValue(regRow());
      await expectCode(
        service.issueToken("someone-else", REG_ID),
        ForbiddenException,
        CheckInErrorCode.Forbidden,
      );
    });

    it.each([
      ["无 endAt", { activity: { ...regRow().activity, endAt: null } }],
      ["已结束", { activity: { ...regRow().activity, endAt: past() } }],
      ["非 confirmed", { status: RegistrationStatus.pending_review }],
      [
        "活动未发布",
        {
          activity: {
            ...regRow().activity,
            lifecycle: ActivityLifecycle.draft,
          },
        },
      ],
    ])("%s → 409 CHECK_IN_NOT_ALLOWED", async (_label, over) => {
      prisma.registration.findUnique.mockResolvedValue(regRow(over));
      await expectCode(
        service.issueToken(USER, REG_ID),
        ConflictException,
        CheckInErrorCode.NotAllowed,
      );
    });
  });

  describe("checkInWithToken", () => {
    it("有效 token 首次签到写入；再扫 alreadyCheckedIn=true 且不更新", async () => {
      const token = signCheckIn();
      prisma.activity.findUnique.mockResolvedValue(activityRow());
      prisma.registration.findUnique.mockResolvedValueOnce(regRow());
      prisma.registration.updateMany.mockResolvedValue({ count: 1 });

      const first = await service.checkInWithToken(OWNER, ACTIVITY_ID, token);
      expect(first).toMatchObject({
        registrationId: REG_ID,
        name: "张三",
        phone: "13800000000",
        alreadyCheckedIn: false,
      });
      expect(typeof first.checkedInAt).toBe("string");
      expect(prisma.registration.updateMany).toHaveBeenCalledWith({
        where: { id: REG_ID, checkedInAt: null },
        data: {
          checkedInAt: expect.any(Date),
          checkedInByUserId: OWNER,
        },
      });

      const at = new Date("2026-11-15T10:00:00.000Z");
      prisma.registration.findUnique.mockResolvedValueOnce(
        regRow({ checkedInAt: at, checkedInByUserId: OWNER }),
      );
      prisma.registration.updateMany.mockClear();
      const second = await service.checkInWithToken(OWNER, ACTIVITY_ID, token);
      expect(second.alreadyCheckedIn).toBe(true);
      expect(second.checkedInAt).toBe(at.toISOString());
      expect(prisma.registration.updateMany).not.toHaveBeenCalled();
    });

    it("并发下 updateMany count=0 → 重新读取并返回幂等结果", async () => {
      const at = new Date("2026-11-15T10:00:00.000Z");
      prisma.activity.findUnique.mockResolvedValue(activityRow());
      prisma.registration.findUnique
        .mockResolvedValueOnce(regRow())
        .mockResolvedValueOnce(regRow({ checkedInAt: at }));
      prisma.registration.updateMany.mockResolvedValue({ count: 0 });
      const res = await service.checkInWithToken(
        OWNER,
        ACTIVITY_ID,
        signCheckIn(),
      );
      expect(res.alreadyCheckedIn).toBe(true);
      expect(res.checkedInAt).toBe(at.toISOString());
    });

    it("过期 token → 401 CHECK_IN_TOKEN_EXPIRED", async () => {
      const token = signCheckIn({}, -10);
      await expectCode(
        service.checkInWithToken(OWNER, ACTIVITY_ID, token),
        BadRequestException,
        CheckInErrorCode.TokenExpired,
      );
    });

    it("乱码 token → CHECK_IN_TOKEN_INVALID", async () => {
      await expectCode(
        service.checkInWithToken(OWNER, ACTIVITY_ID, "not-a-jwt"),
        BadRequestException,
        CheckInErrorCode.TokenInvalid,
      );
    });

    it("其他密钥签发的 token → CHECK_IN_TOKEN_INVALID", async () => {
      const token = jwt.sign(
        {
          sub: USER,
          purpose: "checkin",
          registrationId: REG_ID,
          activityId: ACTIVITY_ID,
        },
        { secret: "other-secret", expiresIn: 180 },
      );
      await expectCode(
        service.checkInWithToken(OWNER, ACTIVITY_ID, token),
        BadRequestException,
        CheckInErrorCode.TokenInvalid,
      );
    });

    it("purpose 缺失 → CHECK_IN_TOKEN_INVALID", async () => {
      const token = signCheckIn({ purpose: undefined });
      await expectCode(
        service.checkInWithToken(OWNER, ACTIVITY_ID, token),
        BadRequestException,
        CheckInErrorCode.TokenInvalid,
      );
    });

    it("登录态 token（typ=user）→ CHECK_IN_TOKEN_INVALID", async () => {
      const token = jwt.sign(
        { sub: USER, typ: "user" },
        { secret: SECRET, expiresIn: 180 },
      );
      await expectCode(
        service.checkInWithToken(OWNER, ACTIVITY_ID, token),
        BadRequestException,
        CheckInErrorCode.TokenInvalid,
      );
    });

    it("path activityId 与 payload 不一致 → CHECK_IN_TOKEN_INVALID", async () => {
      const token = signCheckIn({ activityId: "other-activity" });
      await expectCode(
        service.checkInWithToken(OWNER, ACTIVITY_ID, token),
        BadRequestException,
        CheckInErrorCode.TokenInvalid,
      );
      expect(prisma.registration.updateMany).not.toHaveBeenCalled();
    });

    it("非活动所有者 → 403 CHECK_IN_FORBIDDEN", async () => {
      prisma.activity.findUnique.mockResolvedValue(activityRow());
      await expectCode(
        service.checkInWithToken("not-owner", ACTIVITY_ID, signCheckIn()),
        ForbiddenException,
        CheckInErrorCode.Forbidden,
      );
      expect(prisma.registration.updateMany).not.toHaveBeenCalled();
    });

    it("活动已结束 → 409 CHECK_IN_NOT_ALLOWED", async () => {
      prisma.activity.findUnique.mockResolvedValue(
        activityRow({ endAt: past() }),
      );
      prisma.registration.findUnique.mockResolvedValue(regRow());
      await expectCode(
        service.checkInWithToken(OWNER, ACTIVITY_ID, signCheckIn()),
        ConflictException,
        CheckInErrorCode.NotAllowed,
      );
    });

    it("报名已取消 → 409 CHECK_IN_NOT_ALLOWED", async () => {
      prisma.activity.findUnique.mockResolvedValue(activityRow());
      prisma.registration.findUnique.mockResolvedValue(
        regRow({ status: RegistrationStatus.cancelled }),
      );
      await expectCode(
        service.checkInWithToken(OWNER, ACTIVITY_ID, signCheckIn()),
        ConflictException,
        CheckInErrorCode.NotAllowed,
      );
    });
  });

  describe("checkInManual", () => {
    it("所有者手动签到成功", async () => {
      prisma.activity.findUnique.mockResolvedValue(activityRow());
      prisma.registration.findUnique.mockResolvedValue(regRow());
      prisma.registration.updateMany.mockResolvedValue({ count: 1 });
      const res = await service.checkInManual(OWNER, ACTIVITY_ID, REG_ID);
      expect(res).toMatchObject({
        registrationId: REG_ID,
        name: "张三",
        phone: "13800000000",
        alreadyCheckedIn: false,
      });
      expect(prisma.registration.updateMany).toHaveBeenCalledTimes(1);
    });

    it("报名属于其他活动 → 404 REGISTRATION_NOT_FOUND", async () => {
      prisma.activity.findUnique.mockResolvedValue(activityRow());
      prisma.registration.findUnique.mockResolvedValue(
        regRow({ activityId: "other-activity" }),
      );
      await expectCode(
        service.checkInManual(OWNER, ACTIVITY_ID, REG_ID),
        NotFoundException,
        CheckInErrorCode.RegistrationNotFound,
      );
    });
  });
});

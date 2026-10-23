import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { BusinessEvent } from "@activity/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "./auth.service";
import { WeixinClient } from "./weixin.client";

describe("AuthService", () => {
  let service: AuthService;

  const prisma = {
    userIdentity: {
      findUnique: vi.fn(),
    },
    user: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };

  const jwt = {
    sign: vi.fn().mockReturnValue("test-access-token"),
  };

  const configValues: Record<string, string> = {
    AUTH_DEV_BYPASS: "true",
    JWT_USER_SECRET: "dev-user-secret",
    JWT_EXPIRES_IN: "7d",
  };

  const config = {
    get: vi.fn((key: string) => configValues[key]),
    getOrThrow: vi.fn((key: string) => {
      const value = configValues[key];
      if (value === undefined) throw new Error(`Missing config ${key}`);
      return value;
    }),
  };

  const weixin = {
    code2Session: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    jwt.sign.mockReturnValue("test-access-token");
    config.get.mockImplementation((key: string) => configValues[key]);
    config.getOrThrow.mockImplementation((key: string) => {
      const value = configValues[key];
      if (value === undefined) throw new Error(`Missing config ${key}`);
      return value;
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
        { provide: WeixinClient, useValue: weixin },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  it("dev bypass issues token for mock code", async () => {
    prisma.userIdentity.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: "user-dev-1",
      nickname: "Dev User",
      avatarUrl: null,
    });

    const spy = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    try {
      const result = await service.login({ code: "dev" });

      expect(result.accessToken).toBe("test-access-token");
      expect(result.user.id).toBe("user-dev-1");
      expect(result.user).not.toHaveProperty("phone");
      expect(result.user).not.toHaveProperty("realName");
      expect(weixin.code2Session).not.toHaveBeenCalled();
      expect(jwt.sign).toHaveBeenCalledWith(
        { sub: "user-dev-1", typ: "user" },
        expect.objectContaining({ secret: "dev-user-secret" }),
      );
      expect(spy).toHaveBeenCalled();
      const payload = JSON.parse(String(spy.mock.calls.at(-1)?.[0]));
      expect(payload.event).toBe(BusinessEvent.UserLogin);
      expect(payload.actorId).toBe("user-dev-1");
    } finally {
      spy.mockRestore();
    }
  });

  it("dev bypass accepts real code when Weixin credentials are missing", async () => {
    prisma.userIdentity.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: "user-dev-2",
      nickname: "Dev User",
      avatarUrl: null,
    });

    const result = await service.login({ code: "08123-real-weixin-code" });

    expect(result.accessToken).toBe("test-access-token");
    expect(result.user.id).toBe("user-dev-2");
    expect(weixin.code2Session).not.toHaveBeenCalled();
  });

  it("getMe returns canPublish from user row without organizer", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      nickname: "Alice",
      avatarUrl: "https://example.com/a.png",
      realName: null,
      phone: null,
      canPublish: true,
    });

    const result = await service.getMe("user-1");

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
    });
    expect(result).toEqual({
      id: "user-1",
      nickname: "Alice",
      avatarUrl: "https://example.com/a.png",
      realName: null,
      phone: null,
      canPublish: true,
    });
    expect(result).not.toHaveProperty("organizer");
  });

  it("updateMe rejects empty patch", async () => {
    await expect(service.updateMe("user-1", {})).rejects.toMatchObject({
      status: 400,
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("updateMe trims nickname and maps blank to null", async () => {
    prisma.user.update.mockResolvedValue({
      id: "user-1",
      nickname: null,
      avatarUrl: "http://x/api/uploads/avatars/a.jpg",
      realName: null,
      phone: null,
      canPublish: false,
    });

    const result = await service.updateMe("user-1", { nickname: "  " });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { nickname: null },
    });
    expect(result).toEqual({
      id: "user-1",
      nickname: null,
      avatarUrl: "http://x/api/uploads/avatars/a.jpg",
      realName: null,
      phone: null,
      canPublish: false,
    });
  });

  it("updateMe rejects too-long nickname", async () => {
    await expect(
      service.updateMe("user-1", { nickname: "啊".repeat(33) }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("updateMe rejects non-avatar url", async () => {
    await expect(
      service.updateMe("user-1", {
        avatarUrl: "wxfile://tmp.png",
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("updateMe writes nickname and avatarUrl and keeps canPublish", async () => {
    prisma.user.update.mockResolvedValue({
      id: "user-1",
      nickname: "小陈",
      avatarUrl: "http://x/api/uploads/avatars/a.jpg",
      realName: null,
      phone: null,
      canPublish: false,
    });

    const result = await service.updateMe("user-1", {
      nickname: " 小陈 ",
      avatarUrl: "http://x/api/uploads/avatars/a.jpg",
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        nickname: "小陈",
        avatarUrl: "http://x/api/uploads/avatars/a.jpg",
      },
    });
    expect(result.canPublish).toBe(false);
    expect(result.nickname).toBe("小陈");
  });

  it("getMe returns realName and phone for the owner", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      nickname: "Alice",
      avatarUrl: null,
      realName: "张三",
      phone: "13800138000",
      canPublish: true,
    });

    const result = await service.getMe("user-1");

    expect(result).toEqual({
      id: "user-1",
      nickname: "Alice",
      avatarUrl: null,
      realName: "张三",
      phone: "13800138000",
      canPublish: true,
    });
  });

  it("updateMe writes realName and phone", async () => {
    prisma.user.update.mockResolvedValue({
      id: "user-1",
      nickname: "Alice",
      avatarUrl: null,
      realName: "张三",
      phone: "13800138000",
      canPublish: true,
    });

    const result = await service.updateMe("user-1", {
      realName: " 张三 ",
      phone: "13800138000",
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { realName: "张三", phone: "13800138000" },
    });
    expect(result.realName).toBe("张三");
    expect(result.phone).toBe("13800138000");
  });

  it("updateMe clears realName and phone with blank or null", async () => {
    prisma.user.update.mockResolvedValue({
      id: "user-1",
      nickname: "Alice",
      avatarUrl: null,
      realName: null,
      phone: null,
      canPublish: true,
    });

    const result = await service.updateMe("user-1", {
      realName: "  ",
      phone: null,
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { realName: null, phone: null },
    });
    expect(result.realName).toBeNull();
    expect(result.phone).toBeNull();
  });

  it("updateMe rejects invalid phone", async () => {
    await expect(
      service.updateMe("user-1", { phone: "12345" }),
    ).rejects.toMatchObject({
      status: 400,
      message: "手机号格式不正确",
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("updateMe rejects too-long realName", async () => {
    await expect(
      service.updateMe("user-1", { realName: "啊".repeat(33) }),
    ).rejects.toMatchObject({
      status: 400,
      message: "报名姓名过长",
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});


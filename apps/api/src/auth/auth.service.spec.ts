import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
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

    const result = await service.login({ code: "dev" });

    expect(result.accessToken).toBe("test-access-token");
    expect(result.user.id).toBe("user-dev-1");
    expect(weixin.code2Session).not.toHaveBeenCalled();
    expect(jwt.sign).toHaveBeenCalledWith(
      { sub: "user-dev-1", typ: "user" },
      expect.objectContaining({ secret: "dev-user-secret" }),
    );
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
      canPublish: true,
    });
    expect(result).not.toHaveProperty("organizer");
  });
});


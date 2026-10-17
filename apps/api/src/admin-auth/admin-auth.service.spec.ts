import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { AdminRole } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { AdminAuthService } from "./admin-auth.service";

vi.mock("bcrypt", () => ({
  compare: vi.fn(),
}));

describe("AdminAuthService", () => {
  let service: AdminAuthService;

  const prisma = {
    adminUser: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };

  const jwt = {
    sign: vi.fn().mockReturnValue("admin-access-token"),
  };

  const configValues: Record<string, string> = {
    JWT_ADMIN_SECRET: "dev-admin-secret",
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

  beforeEach(async () => {
    vi.clearAllMocks();
    jwt.sign.mockReturnValue("admin-access-token");
    config.get.mockImplementation((key: string) => configValues[key]);
    config.getOrThrow.mockImplementation((key: string) => {
      const value = configValues[key];
      if (value === undefined) throw new Error(`Missing config ${key}`);
      return value;
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminAuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = moduleRef.get(AdminAuthService);
  });

  it("logs in with valid email/password and issues admin JWT", async () => {
    const admin = {
      id: "admin-1",
      email: "admin@example.com",
      passwordHash: "hashed",
      displayName: "Bootstrap Admin",
      role: AdminRole.admin,
      status: "active",
    };
    prisma.adminUser.findUnique.mockResolvedValue(admin);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    prisma.adminUser.update.mockResolvedValue({
      ...admin,
      lastLoginAt: new Date(),
    });

    const result = await service.login({
      email: "admin@example.com",
      password: "ChangeMeNow!",
    });

    expect(bcrypt.compare).toHaveBeenCalledWith("ChangeMeNow!", "hashed");
    expect(prisma.adminUser.update).toHaveBeenCalledWith({
      where: { id: "admin-1" },
      data: { lastLoginAt: expect.any(Date) },
    });
    expect(jwt.sign).toHaveBeenCalledWith(
      { sub: "admin-1", typ: "admin", role: AdminRole.admin },
      expect.objectContaining({ secret: "dev-admin-secret" }),
    );
    expect(result).toEqual({
      accessToken: "admin-access-token",
      admin: {
        id: "admin-1",
        email: "admin@example.com",
        displayName: "Bootstrap Admin",
        role: AdminRole.admin,
      },
    });
  });

  it("rejects invalid password", async () => {
    prisma.adminUser.findUnique.mockResolvedValue({
      id: "admin-1",
      email: "admin@example.com",
      passwordHash: "hashed",
      role: AdminRole.operator,
      status: "active",
    });
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    await expect(
      service.login({ email: "admin@example.com", password: "wrong" }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.adminUser.update).not.toHaveBeenCalled();
    expect(jwt.sign).not.toHaveBeenCalled();
  });

  it("rejects unknown email", async () => {
    prisma.adminUser.findUnique.mockResolvedValue(null);

    await expect(
      service.login({ email: "nope@example.com", password: "x" }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

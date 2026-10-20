import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../../prisma/prisma.service";
import { CanPublishGuard } from "./can-publish.guard";

function mockContext(user?: { userId: string }): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as ExecutionContext;
}

describe("CanPublishGuard", () => {
  const prisma = { user: { findUnique: vi.fn() } };
  let guard: CanPublishGuard;

  beforeEach(() => {
    vi.clearAllMocks();
    guard = new CanPublishGuard(prisma as unknown as PrismaService);
  });

  it("allows when canPublish is true", async () => {
    prisma.user.findUnique.mockResolvedValue({ canPublish: true });
    await expect(
      guard.canActivate(mockContext({ userId: "u1" })),
    ).resolves.toBe(true);
  });

  it("throws 403 when canPublish is false", async () => {
    prisma.user.findUnique.mockResolvedValue({ canPublish: false });
    await expect(
      guard.canActivate(mockContext({ userId: "u1" })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("throws 403 when user missing", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(
      guard.canActivate(mockContext({ userId: "u1" })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("throws when request has no user", async () => {
    await expect(guard.canActivate(mockContext())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

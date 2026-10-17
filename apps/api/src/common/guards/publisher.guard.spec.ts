import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { PublishStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../../prisma/prisma.service";
import { PublisherGuard } from "./publisher.guard";

function mockContext(user?: { userId: string }): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as ExecutionContext;
}

describe("PublisherGuard", () => {
  let guard: PublisherGuard;

  const prisma = {
    organizer: {
      findUnique: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    guard = new PublisherGuard(prisma as unknown as PrismaService);
  });

  it("allows when organizer is approved", async () => {
    prisma.organizer.findUnique.mockResolvedValue({
      publishStatus: PublishStatus.approved,
    });

    await expect(guard.canActivate(mockContext({ userId: "user-1" }))).resolves.toBe(
      true,
    );
    expect(prisma.organizer.findUnique).toHaveBeenCalledWith({
      where: { ownerUserId: "user-1" },
    });
  });

  it("throws 403 when organizer is not approved", async () => {
    prisma.organizer.findUnique.mockResolvedValue({
      publishStatus: PublishStatus.pending,
    });

    await expect(
      guard.canActivate(mockContext({ userId: "user-1" })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("throws 403 when organizer is missing", async () => {
    prisma.organizer.findUnique.mockResolvedValue(null);

    await expect(
      guard.canActivate(mockContext({ userId: "user-1" })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("throws when request has no user", async () => {
    await expect(guard.canActivate(mockContext())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.organizer.findUnique).not.toHaveBeenCalled();
  });
});

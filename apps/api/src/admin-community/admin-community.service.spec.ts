import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { CommunityDeletedBy } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { AdminCommunityService } from "./admin-community.service";

describe("AdminCommunityService", () => {
  let service: AdminCommunityService;
  const auditLogCreate = vi.fn();
  const prisma = {
    post: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(async (fn) =>
      fn({ post: prisma.post, auditLog: { create: auditLogCreate } }),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminCommunityService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(AdminCommunityService);
  });

  it("softDeletePost 标记 deletedBy=admin 并写审计", async () => {
    prisma.post.findUnique.mockResolvedValue({ id: "p1", deletedAt: null });
    prisma.post.update.mockResolvedValue({ id: "p1" });

    await service.softDeletePost("p1", "admin-1");

    const updateArg = prisma.post.update.mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: "p1" });
    expect(updateArg.data.deletedBy).toBe(CommunityDeletedBy.admin);
    expect(updateArg.data.deletedAt).toBeInstanceOf(Date);
    expect(auditLogCreate).toHaveBeenCalledWith({
      data: {
        actorType: "admin",
        actorId: "admin-1",
        action: "soft_delete_post",
        targetType: "post",
        targetId: "p1",
      },
    });
  });

  it("动态不存在 → 404，不写审计", async () => {
    prisma.post.findUnique.mockResolvedValue(null);

    await expect(service.softDeletePost("nope", "admin-1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.post.update).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
  });

  it("重复删除已删动态 → 404，不写审计", async () => {
    prisma.post.findUnique.mockResolvedValue({
      id: "p1",
      deletedAt: new Date(),
    });

    await expect(service.softDeletePost("p1", "admin-1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.post.update).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
  });
});

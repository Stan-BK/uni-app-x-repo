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
      updateMany: vi.fn(),
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

  it("softDeletePost 条件更新 deletedAt:null、标记 deletedBy=admin 并写审计", async () => {
    prisma.post.updateMany.mockResolvedValue({ count: 1 });

    await service.softDeletePost("p1", "admin-1");

    const updateArg = prisma.post.updateMany.mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: "p1", deletedAt: null });
    expect(updateArg.data.deletedBy).toBe(CommunityDeletedBy.admin);
    expect(updateArg.data.deletedAt).toBeInstanceOf(Date);
    expect(prisma.post.findUnique).not.toHaveBeenCalled();
    expect(auditLogCreate).toHaveBeenCalledTimes(1);
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

  it("动态不存在（更新 0 行） → 404 动态不存在，不写审计", async () => {
    prisma.post.updateMany.mockResolvedValue({ count: 0 });
    prisma.post.findUnique.mockResolvedValue(null);

    await expect(service.softDeletePost("nope", "admin-1")).rejects.toThrow(
      new NotFoundException("动态不存在"),
    );
    expect(auditLogCreate).not.toHaveBeenCalled();
  });

  it("更新 0 行且动态已删 → 404 动态已删除，不写审计", async () => {
    prisma.post.updateMany.mockResolvedValue({ count: 0 });
    prisma.post.findUnique.mockResolvedValue({ id: "p1" });

    await expect(service.softDeletePost("p1", "admin-1")).rejects.toThrow(
      new NotFoundException("动态已删除"),
    );
    expect(auditLogCreate).not.toHaveBeenCalled();
  });

  it("连续两次软删：第二次 404，审计只写一次", async () => {
    prisma.post.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    prisma.post.findUnique.mockResolvedValue({ id: "p1" });

    await service.softDeletePost("p1", "admin-1");
    await expect(service.softDeletePost("p1", "admin-2")).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    expect(auditLogCreate.mock.calls[0][0].data.actorId).toBe("admin-1");
  });
});

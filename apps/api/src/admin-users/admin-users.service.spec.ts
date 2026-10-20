import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { AdminUsersService } from "./admin-users.service";

describe("AdminUsersService", () => {
  let service: AdminUsersService;

  const prisma = {
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(
      async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminUsersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(AdminUsersService);
  });

  describe("list", () => {
    it("list returns paginated users with canPublish", async () => {
      const users = [
        {
          id: "u1",
          nickname: "Alice",
          canPublish: true,
          createdAt: new Date("2026-01-02"),
        },
        {
          id: "u2",
          nickname: "Bob",
          canPublish: false,
          createdAt: new Date("2026-01-01"),
        },
      ];
      prisma.user.findMany.mockResolvedValue(users);
      prisma.user.count.mockResolvedValue(2);

      const result = await service.list();

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        select: { id: true, nickname: true, canPublish: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        skip: 0,
        take: 20,
      });
      expect(prisma.user.count).toHaveBeenCalled();
      expect(result).toEqual({
        items: users,
        total: 2,
        page: 1,
        pageSize: 20,
      });
    });

    it("list applies page and caps pageSize at 50", async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      const result = await service.list({ page: 2, pageSize: 100 });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 50, take: 50 }),
      );
      expect(result.page).toBe(2);
      expect(result.pageSize).toBe(50);
    });
  });

  describe("freezePublish", () => {
    it("freeze sets canPublish false and writes audit", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: "u1", canPublish: true });
      prisma.user.update.mockResolvedValue({ id: "u1", canPublish: false });
      prisma.auditLog.create.mockResolvedValue({});

      await service.freezePublish("u1", "admin-1", { reason: "违规" });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "u1" },
        data: { canPublish: false },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorType: "admin",
          actorId: "admin-1",
          action: "freeze_publish",
          targetType: "user",
          targetId: "u1",
          reason: "违规",
        }),
      });
    });

    it("throws when user missing", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.freezePublish("missing", "admin-1", { reason: "违规" }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });
  });

  describe("unfreezePublish", () => {
    it("unfreeze sets canPublish true", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: "u1", canPublish: false });
      prisma.user.update.mockResolvedValue({ id: "u1", canPublish: true });
      prisma.auditLog.create.mockResolvedValue({});

      await service.unfreezePublish("u1", "admin-1", { reason: "已整改" });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "u1" },
        data: { canPublish: true },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorType: "admin",
          actorId: "admin-1",
          action: "unfreeze_publish",
          targetType: "user",
          targetId: "u1",
          reason: "已整改",
        }),
      });
    });
  });
});

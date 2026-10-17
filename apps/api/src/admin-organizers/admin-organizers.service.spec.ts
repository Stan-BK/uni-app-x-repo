import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PublishStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { AdminOrganizersService } from "./admin-organizers.service";

describe("AdminOrganizersService", () => {
  let service: AdminOrganizersService;

  const prisma = {
    organizer: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
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
        AdminOrganizersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(AdminOrganizersService);
  });

  describe("list", () => {
    it("defaults status filter to pending", async () => {
      prisma.organizer.findMany.mockResolvedValue([]);
      await service.list();
      expect(prisma.organizer.findMany).toHaveBeenCalledWith({
        where: { publishStatus: PublishStatus.pending },
        orderBy: { createdAt: "asc" },
      });
    });

    it("filters by provided status", async () => {
      prisma.organizer.findMany.mockResolvedValue([]);
      await service.list(PublishStatus.approved);
      expect(prisma.organizer.findMany).toHaveBeenCalledWith({
        where: { publishStatus: PublishStatus.approved },
        orderBy: { createdAt: "asc" },
      });
    });
  });

  describe("approve", () => {
    it("sets approved, stores note, and writes AuditLog", async () => {
      prisma.organizer.findUnique.mockResolvedValue({
        id: "org-1",
        publishStatus: PublishStatus.pending,
      });
      const updated = {
        id: "org-1",
        publishStatus: PublishStatus.approved,
        reviewNote: "ok",
      };
      prisma.organizer.update.mockResolvedValue(updated);
      prisma.auditLog.create.mockResolvedValue({});

      const result = await service.approve("org-1", "admin-1", { note: "ok" });

      expect(prisma.organizer.update).toHaveBeenCalledWith({
        where: { id: "org-1" },
        data: {
          publishStatus: PublishStatus.approved,
          reviewNote: "ok",
        },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          actorType: "admin",
          actorId: "admin-1",
          action: "approve",
          targetType: "organizer",
          targetId: "org-1",
          reason: "ok",
        },
      });
      expect(result).toEqual(updated);
    });

    it("throws when organizer missing", async () => {
      prisma.organizer.findUnique.mockResolvedValue(null);
      await expect(
        service.approve("missing", "admin-1", {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("reject", () => {
    it("sets rejected and writes AuditLog with reason", async () => {
      prisma.organizer.findUnique.mockResolvedValue({
        id: "org-1",
        publishStatus: PublishStatus.pending,
      });
      const updated = {
        id: "org-1",
        publishStatus: PublishStatus.rejected,
        reviewNote: "incomplete",
      };
      prisma.organizer.update.mockResolvedValue(updated);
      prisma.auditLog.create.mockResolvedValue({});

      const result = await service.reject("org-1", "admin-1", {
        reason: "incomplete",
      });

      expect(prisma.organizer.update).toHaveBeenCalledWith({
        where: { id: "org-1" },
        data: {
          publishStatus: PublishStatus.rejected,
          reviewNote: "incomplete",
        },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          actorType: "admin",
          actorId: "admin-1",
          action: "reject",
          targetType: "organizer",
          targetId: "org-1",
          reason: "incomplete",
        },
      });
      expect(result).toEqual(updated);
    });
  });

  describe("freeze", () => {
    it("sets frozen and writes AuditLog with reason", async () => {
      prisma.organizer.findUnique.mockResolvedValue({
        id: "org-1",
        publishStatus: PublishStatus.approved,
      });
      const updated = {
        id: "org-1",
        publishStatus: PublishStatus.frozen,
        reviewNote: "abuse",
      };
      prisma.organizer.update.mockResolvedValue(updated);
      prisma.auditLog.create.mockResolvedValue({});

      const result = await service.freeze("org-1", "admin-1", {
        reason: "abuse",
      });

      expect(prisma.organizer.update).toHaveBeenCalledWith({
        where: { id: "org-1" },
        data: {
          publishStatus: PublishStatus.frozen,
          reviewNote: "abuse",
        },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          actorType: "admin",
          actorId: "admin-1",
          action: "freeze",
          targetType: "organizer",
          targetId: "org-1",
          reason: "abuse",
        },
      });
      expect(result).toEqual(updated);
    });
  });
});

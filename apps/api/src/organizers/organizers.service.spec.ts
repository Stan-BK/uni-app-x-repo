import { ConflictException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PublishStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { OrganizersService } from "./organizers.service";

describe("OrganizersService", () => {
  let service: OrganizersService;

  const prisma = {
    organizer: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        OrganizersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(OrganizersService);
  });

  describe("apply", () => {
    it("creates organizer with pending when none exists", async () => {
      prisma.organizer.findUnique.mockResolvedValue(null);
      const created = {
        id: "org-1",
        ownerUserId: "user-1",
        name: "Acme",
        publishStatus: PublishStatus.pending,
        applyReason: "want to host",
      };
      prisma.organizer.create.mockResolvedValue(created);

      const result = await service.apply("user-1", {
        name: "Acme",
        reason: "want to host",
      });

      expect(prisma.organizer.create).toHaveBeenCalledWith({
        data: {
          ownerUserId: "user-1",
          name: "Acme",
          applyReason: "want to host",
          publishStatus: PublishStatus.pending,
        },
      });
      expect(result).toEqual(created);
    });

    it("re-applies when existing status is rejected", async () => {
      prisma.organizer.findUnique.mockResolvedValue({
        id: "org-1",
        ownerUserId: "user-1",
        name: "Old",
        publishStatus: PublishStatus.rejected,
      });
      const updated = {
        id: "org-1",
        ownerUserId: "user-1",
        name: "New Name",
        publishStatus: PublishStatus.pending,
        applyReason: "try again",
      };
      prisma.organizer.update.mockResolvedValue(updated);

      const result = await service.apply("user-1", {
        name: "New Name",
        reason: "try again",
      });

      expect(prisma.organizer.update).toHaveBeenCalledWith({
        where: { ownerUserId: "user-1" },
        data: {
          name: "New Name",
          applyReason: "try again",
          publishStatus: PublishStatus.pending,
        },
      });
      expect(result).toEqual(updated);
    });

    it("re-applies when existing status is none", async () => {
      prisma.organizer.findUnique.mockResolvedValue({
        id: "org-1",
        ownerUserId: "user-1",
        name: "Draft",
        publishStatus: PublishStatus.none,
      });
      prisma.organizer.update.mockResolvedValue({
        id: "org-1",
        publishStatus: PublishStatus.pending,
      });

      await service.apply("user-1", { name: "Draft Org" });

      expect(prisma.organizer.update).toHaveBeenCalled();
      expect(prisma.organizer.create).not.toHaveBeenCalled();
    });

    it.each([
      PublishStatus.approved,
      PublishStatus.pending,
      PublishStatus.frozen,
    ])("throws 409 when status is %s", async (status) => {
      prisma.organizer.findUnique.mockResolvedValue({
        id: "org-1",
        ownerUserId: "user-1",
        name: "Acme",
        publishStatus: status,
      });

      await expect(
        service.apply("user-1", { name: "Acme" }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.organizer.create).not.toHaveBeenCalled();
      expect(prisma.organizer.update).not.toHaveBeenCalled();
    });
  });

  describe("getMe", () => {
    it("returns organizer when present", async () => {
      const organizer = {
        id: "org-1",
        ownerUserId: "user-1",
        name: "Acme",
        publishStatus: PublishStatus.pending,
      };
      prisma.organizer.findUnique.mockResolvedValue(organizer);

      await expect(service.getMe("user-1")).resolves.toEqual({
        organizer,
      });
    });

    it("returns null organizer when absent", async () => {
      prisma.organizer.findUnique.mockResolvedValue(null);

      await expect(service.getMe("user-1")).resolves.toEqual({
        organizer: null,
      });
    });
  });

  describe("canPublish", () => {
    it("returns true only when approved", async () => {
      prisma.organizer.findUnique.mockResolvedValue({
        publishStatus: PublishStatus.approved,
      });
      await expect(service.canPublish("user-1")).resolves.toEqual({
        canPublish: true,
      });
    });

    it("returns false when pending", async () => {
      prisma.organizer.findUnique.mockResolvedValue({
        publishStatus: PublishStatus.pending,
      });
      await expect(service.canPublish("user-1")).resolves.toEqual({
        canPublish: false,
      });
    });

    it("returns false when no organizer", async () => {
      prisma.organizer.findUnique.mockResolvedValue(null);
      await expect(service.canPublish("user-1")).resolves.toEqual({
        canPublish: false,
      });
    });
  });
});

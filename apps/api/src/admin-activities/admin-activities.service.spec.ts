import { ConflictException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ActivityLifecycle } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { REGISTRATION_CANCEL_HOOK } from "../activities/registration-cancel.hook";
import { PrismaService } from "../prisma/prisma.service";
import { AdminActivitiesService } from "./admin-activities.service";

describe("AdminActivitiesService", () => {
  let service: AdminActivitiesService;
  const prisma = {
    activity: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  const cancelHook = {
    cancelAllForActivity: vi.fn(),
    closeActivity: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(async (fn) =>
      fn({
        activity: prisma.activity,
        auditLog: { create: vi.fn() },
      }),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminActivitiesService,
        { provide: PrismaService, useValue: prisma },
        { provide: REGISTRATION_CANCEL_HOOK, useValue: cancelHook },
      ],
    }).compile();
    service = moduleRef.get(AdminActivitiesService);
  });

  it("remove sets removed and audits", async () => {
    prisma.activity.findUnique.mockResolvedValue({
      id: "act-1",
      lifecycle: ActivityLifecycle.published,
    });
    prisma.activity.update.mockResolvedValue({
      id: "act-1",
      lifecycle: ActivityLifecycle.removed,
      removeReason: "违规",
    });

    const result = await service.remove("act-1", "admin-1", {
      reason: "违规",
    });
    expect(cancelHook.closeActivity).toHaveBeenCalledWith("act-1");
    expect(result.lifecycle).toBe(ActivityLifecycle.removed);
  });

  it("remove rejects non-published", async () => {
    prisma.activity.findUnique.mockResolvedValue({
      id: "act-1",
      lifecycle: ActivityLifecycle.draft,
    });
    await expect(
      service.remove("act-1", "admin-1", { reason: "x" }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

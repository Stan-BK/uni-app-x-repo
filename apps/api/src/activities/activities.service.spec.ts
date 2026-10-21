import { BusinessEvent } from "@activity/shared";
import { BadRequestException, ForbiddenException, Logger } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ActivityLifecycle, FeeType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { ActivitiesService } from "./activities.service";
import { REGISTRATION_CANCEL_HOOK } from "./registration-cancel.hook";

describe("ActivitiesService", () => {
  let service: ActivitiesService;
  const prisma = {
    user: { findUnique: vi.fn() },
    activity: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  };
  const cancelHook = { cancelAllForActivity: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ActivitiesService,
        { provide: PrismaService, useValue: prisma },
        { provide: REGISTRATION_CANCEL_HOOK, useValue: cancelHook },
      ],
    }).compile();
    service = moduleRef.get(ActivitiesService);
  });

  it("create draft with minimal title", async () => {
    prisma.user.findUnique.mockResolvedValue({ canPublish: true });
    const row = {
      id: "act-1",
      ownerUserId: "user-1",
      title: "徒步",
      lifecycle: ActivityLifecycle.draft,
    };
    prisma.activity.create.mockResolvedValue(row);

    const result = await service.create("user-1", { title: "徒步" });
    const createData = prisma.activity.create.mock.calls[0][0].data;
    expect(createData.ownerUserId).toBe("user-1");
    expect(createData).not.toHaveProperty("organizerId");
    expect(result.lifecycle).toBe(ActivityLifecycle.draft);
  });

  it("create throws ForbiddenException when canPublish is false", async () => {
    prisma.user.findUnique.mockResolvedValue({ canPublish: false });

    await expect(
      service.create("user-1", { title: "徒步" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.activity.create).not.toHaveBeenCalled();
  });

  it("publish rejects when endAt <= startAt", async () => {
    prisma.user.findUnique.mockResolvedValue({ canPublish: true });
    prisma.activity.findFirst.mockResolvedValue({
      id: "act-1",
      ownerUserId: "user-1",
      title: "徒步",
      coverUrl: "https://example.com/c.jpg",
      category: "徒步",
      rules: "规则",
      place: "公园",
      capacity: 10,
      feeType: FeeType.free,
      feeCents: 0,
      startAt: new Date("2026-11-02T10:00:00Z"),
      endAt: new Date("2026-11-02T09:00:00Z"),
      lifecycle: ActivityLifecycle.draft,
    });

    await expect(service.publish("user-1", "act-1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  const publishableDraft = {
    id: "act-1",
    ownerUserId: "user-1",
    title: "徒步",
    coverUrl: "https://example.com/c.jpg",
    category: "观赛",
    rules: "规则",
    place: "公园",
    capacity: 10,
    feeType: FeeType.free,
    feeCents: 0,
    startAt: new Date("2026-11-02T10:00:00Z"),
    endAt: new Date("2026-11-02T12:00:00Z"),
    registrationDeadlineAt: null,
    lifecycle: ActivityLifecycle.draft,
  };

  it("publish logs activity.publish", async () => {
    prisma.user.findUnique.mockResolvedValue({ canPublish: true });
    prisma.activity.findFirst.mockResolvedValue(publishableDraft);
    prisma.activity.update.mockResolvedValue({
      ...publishableDraft,
      lifecycle: ActivityLifecycle.published,
    });
    const spy = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    try {
      await service.publish("user-1", "act-1");
      const payload = JSON.parse(String(spy.mock.calls.at(-1)?.[0]));
      expect(payload.event).toBe(BusinessEvent.ActivityPublish);
      expect(payload.actorId).toBe("user-1");
      expect(payload.targetId).toBe("act-1");
    } finally {
      spy.mockRestore();
    }
  });

  it("update with publish throws ForbiddenException when canPublish is false", async () => {
    prisma.user.findUnique.mockResolvedValue({ canPublish: false });
    prisma.activity.findFirst.mockResolvedValue({
      id: "act-1",
      ownerUserId: "user-1",
      lifecycle: ActivityLifecycle.draft,
    });

    await expect(
      service.update("user-1", "act-1", { publish: true }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.activity.update).not.toHaveBeenCalled();
  });

  it("unpublish calls cancel hook and sets draft", async () => {
    prisma.activity.findFirst.mockResolvedValue({
      id: "act-1",
      ownerUserId: "user-1",
      lifecycle: ActivityLifecycle.published,
    });
    prisma.activity.update.mockResolvedValue({
      id: "act-1",
      lifecycle: ActivityLifecycle.draft,
    });
    cancelHook.cancelAllForActivity.mockResolvedValue(undefined);

    const result = await service.unpublish("user-1", "act-1");
    expect(cancelHook.cancelAllForActivity).toHaveBeenCalledWith("act-1");
    expect(result.lifecycle).toBe(ActivityLifecycle.draft);
  });

  it("unpublish succeeds when canPublish is false but user still owns the activity", async () => {
    prisma.user.findUnique.mockResolvedValue({ canPublish: false });
    prisma.activity.findFirst.mockResolvedValue({
      id: "act-1",
      ownerUserId: "user-1",
      lifecycle: ActivityLifecycle.published,
    });
    prisma.activity.update.mockResolvedValue({
      id: "act-1",
      lifecycle: ActivityLifecycle.draft,
    });
    cancelHook.cancelAllForActivity.mockResolvedValue(undefined);

    const result = await service.unpublish("user-1", "act-1");
    expect(cancelHook.cancelAllForActivity).toHaveBeenCalledWith("act-1");
    expect(result.lifecycle).toBe(ActivityLifecycle.draft);
  });
});

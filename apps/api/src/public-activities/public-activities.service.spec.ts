import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ActivityLifecycle } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { PublicActivitiesService } from "./public-activities.service";

describe("PublicActivitiesService", () => {
  let service: PublicActivitiesService;
  const prisma = {
    activity: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
    },
    registration: {
      count: vi.fn(),
      groupBy: vi.fn(),
      findMany: vi.fn(),
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    prisma.registration.findMany.mockResolvedValue([]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        PublicActivitiesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(PublicActivitiesService);
  });

  it("list only published and not ended, default sort startAt asc", async () => {
    prisma.activity.findMany.mockResolvedValue([]);
    prisma.activity.count.mockResolvedValue(0);
    prisma.registration.groupBy.mockResolvedValue([]);

    const res = await service.list({});
    expect(res).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
    expect(prisma.activity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          lifecycle: ActivityLifecycle.published,
          endAt: expect.objectContaining({ gt: expect.any(Date) }),
        }),
        orderBy: { startAt: "asc" },
        skip: 0,
        take: 20,
        include: { owner: { select: { nickname: true } } },
      }),
    );
  });

  it("list applies q and publishedAt sort", async () => {
    prisma.activity.findMany.mockResolvedValue([]);
    prisma.activity.count.mockResolvedValue(0);
    prisma.registration.groupBy.mockResolvedValue([]);

    await service.list({ q: " 徒步 ", sort: "publishedAt", page: 2, pageSize: 10 });
    expect(prisma.activity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          title: { contains: "徒步", mode: "insensitive" },
        }),
        orderBy: { publishedAt: "desc" },
        skip: 10,
        take: 10,
      }),
    );
  });

  it("list respects explicit order", async () => {
    prisma.activity.findMany.mockResolvedValue([]);
    prisma.activity.count.mockResolvedValue(0);
    prisma.registration.groupBy.mockResolvedValue([]);

    await service.list({ sort: "startAt", order: "desc" });
    expect(prisma.activity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { startAt: "desc" } }),
    );

    await service.list({ sort: "publishedAt", order: "asc" });
    expect(prisma.activity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { publishedAt: "asc" } }),
    );
  });

  it("list rejects invalid sort", async () => {
    await expect(service.list({ sort: "nope" as "startAt" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("list rejects invalid order", async () => {
    await expect(service.list({ order: "sideways" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("list returns up to 3 attendees without phone or confirmedCount", async () => {
    prisma.activity.findMany.mockResolvedValue([hotRow("a1", "2026-10-01T00:00:00.000Z")]);
    prisma.activity.count.mockResolvedValue(1);
    prisma.registration.groupBy.mockResolvedValue([
      { activityId: "a1", _count: { _all: 4 } },
    ]);
    prisma.registration.findMany.mockResolvedValue([
      { activityId: "a1", user: { nickname: "甲", avatarUrl: "https://x/1.jpg" } },
      { activityId: "a1", user: { nickname: "乙", avatarUrl: null } },
      { activityId: "a1", user: { nickname: "丙", avatarUrl: "https://x/3.jpg" } },
      { activityId: "a1", user: { nickname: "丁", avatarUrl: "https://x/4.jpg" } },
    ]);

    const res = await service.list({});
    expect(res.items[0].attendees).toEqual([
      { nickname: "甲", avatarUrl: "https://x/1.jpg" },
      { nickname: "乙", avatarUrl: null },
      { nickname: "丙", avatarUrl: "https://x/3.jpg" },
    ]);
    expect(res.items[0]).not.toHaveProperty("confirmedCount");
    expect(JSON.stringify(res.items[0])).not.toContain("丁");
  });

  it("get returns public dto for published", async () => {
    const start = new Date("2030-01-01T10:00:00.000Z");
    const end = new Date("2030-01-01T12:00:00.000Z");
    prisma.activity.findUnique.mockResolvedValue({
      id: "a1",
      title: "徒步",
      coverUrl: "https://x/c.jpg",
      category: "观赛",
      description: null,
      rules: "须知",
      startAt: start,
      endAt: end,
      place: "滨江",
      placeLat: 1,
      placeLng: 2,
      capacity: 10,
      feeType: "free",
      feeCents: 0,
      feeNote: null,
      lifecycle: ActivityLifecycle.published,
      publishedAt: new Date("2026-10-01T00:00:00.000Z"),
      cancelReason: "secret",
      removeReason: "secret",
      platformFeeBps: 100,
      owner: { nickname: "探索社" },
    });
    prisma.registration.count.mockResolvedValue(0);

    const dto = await service.getById("a1");
    expect(prisma.activity.findUnique).toHaveBeenCalledWith({
      where: { id: "a1" },
      include: { owner: { select: { nickname: true } } },
    });
    expect(dto.displayStatus).toBe("open");
    expect(dto.hostName).toBe("探索社");
    expect(dto).not.toHaveProperty("organizer");
    expect(dto).not.toHaveProperty("cancelReason");
    expect(dto).not.toHaveProperty("removeReason");
    expect(dto.attendees).toEqual([]);
    expect(dto.confirmedCount).toBe(0);
  });

  it("get returns confirmed attendees without phone", async () => {
    const start = new Date("2030-01-01T10:00:00.000Z");
    const end = new Date("2030-01-01T12:00:00.000Z");
    prisma.activity.findUnique.mockResolvedValue({
      id: "a1",
      title: "徒步",
      coverUrl: "https://x/c.jpg",
      category: "观赛",
      description: null,
      rules: "须知",
      startAt: start,
      endAt: end,
      place: "滨江",
      placeLat: 1,
      placeLng: 2,
      capacity: 10,
      feeType: "free",
      feeCents: 0,
      feeNote: null,
      lifecycle: ActivityLifecycle.published,
      publishedAt: new Date("2026-10-01T00:00:00.000Z"),
      owner: { nickname: "探索社" },
    });
    prisma.registration.count.mockResolvedValue(2);
    prisma.registration.findMany.mockResolvedValue([
      {
        name: "报名表姓名",
        user: { nickname: "阿茶", avatarUrl: "https://x/a.jpg" },
      },
      {
        name: "乙",
        user: { nickname: null, avatarUrl: null },
      },
    ]);

    const dto = await service.getById("a1");
    expect(prisma.registration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ activityId: "a1" }),
      }),
    );
    expect(dto.attendees).toEqual([
      { nickname: "阿茶", avatarUrl: "https://x/a.jpg" },
      { nickname: "用户", avatarUrl: null },
    ]);
    expect(JSON.stringify(dto.attendees)).not.toContain("报名表姓名");
    expect(dto).not.toHaveProperty("phone");
    expect(dto.confirmedCount).toBe(2);
  });

  it("get maps null nickname to 用户", async () => {
    const start = new Date("2030-01-01T10:00:00.000Z");
    const end = new Date("2030-01-01T12:00:00.000Z");
    prisma.activity.findUnique.mockResolvedValue({
      id: "a1",
      title: "徒步",
      coverUrl: "https://x/c.jpg",
      category: "观赛",
      description: null,
      rules: "须知",
      startAt: start,
      endAt: end,
      place: "滨江",
      placeLat: 1,
      placeLng: 2,
      capacity: 10,
      feeType: "free",
      feeCents: 0,
      feeNote: null,
      lifecycle: ActivityLifecycle.published,
      publishedAt: new Date("2026-10-01T00:00:00.000Z"),
      cancelReason: null,
      removeReason: null,
      platformFeeBps: 100,
      owner: { nickname: null },
    });
    prisma.registration.count.mockResolvedValue(0);

    const dto = await service.getById("a1");
    expect(dto.hostName).toBe("用户");
    expect(dto).not.toHaveProperty("organizer");
  });

  it("get maps whitespace nickname to 用户", async () => {
    const start = new Date("2030-01-01T10:00:00.000Z");
    const end = new Date("2030-01-01T12:00:00.000Z");
    prisma.activity.findUnique.mockResolvedValue({
      id: "a1",
      title: "徒步",
      coverUrl: "https://x/c.jpg",
      category: "观赛",
      description: null,
      rules: "须知",
      startAt: start,
      endAt: end,
      place: "滨江",
      placeLat: 1,
      placeLng: 2,
      capacity: 10,
      feeType: "free",
      feeCents: 0,
      feeNote: null,
      lifecycle: ActivityLifecycle.published,
      publishedAt: new Date("2026-10-01T00:00:00.000Z"),
      cancelReason: null,
      removeReason: null,
      platformFeeBps: 100,
      owner: { nickname: "   " },
    });
    prisma.registration.count.mockResolvedValue(0);

    const dto = await service.getById("a1");
    expect(dto.hostName).toBe("用户");
  });

  it("get returns full when confirmedCount >= capacity", async () => {
    const start = new Date("2020-01-01T10:00:00.000Z");
    const end = new Date("2030-01-01T12:00:00.000Z");
    prisma.activity.findUnique.mockResolvedValue({
      id: "a1",
      title: "徒步",
      coverUrl: "https://x/c.jpg",
      category: "观赛",
      description: null,
      rules: "须知",
      startAt: start,
      endAt: end,
      place: "滨江",
      placeLat: 1,
      placeLng: 2,
      capacity: 2,
      feeType: "free",
      feeCents: 0,
      feeNote: null,
      lifecycle: ActivityLifecycle.published,
      publishedAt: new Date("2026-10-01T00:00:00.000Z"),
      cancelReason: null,
      removeReason: null,
      platformFeeBps: 100,
      owner: { nickname: "探索社" },
    });
    prisma.registration.count.mockResolvedValue(2);

    const dto = await service.getById("a1");
    expect(dto.displayStatus).toBe("full");
  });

  it("get returns closed when registration deadline passed", async () => {
    const start = new Date("2030-01-01T10:00:00.000Z");
    const end = new Date("2030-01-01T12:00:00.000Z");
    prisma.activity.findUnique.mockResolvedValue({
      id: "a1",
      title: "徒步",
      coverUrl: "https://x/c.jpg",
      category: "观赛",
      description: null,
      rules: "须知",
      startAt: start,
      endAt: end,
      registrationDeadlineAt: new Date("2020-01-01T00:00:00.000Z"),
      allowUserCancel: true,
      refundable: false,
      place: "滨江",
      placeLat: 1,
      placeLng: 2,
      capacity: 10,
      feeType: "free",
      feeCents: 0,
      feeNote: null,
      lifecycle: ActivityLifecycle.published,
      publishedAt: new Date("2026-10-01T00:00:00.000Z"),
      cancelReason: null,
      removeReason: null,
      platformFeeBps: 100,
      owner: { nickname: "探索社" },
    });
    prisma.registration.count.mockResolvedValue(0);

    const dto = await service.getById("a1");
    expect(dto.displayStatus).toBe("closed");
  });

  it("get throws cancelled with code", async () => {
    prisma.activity.findUnique.mockResolvedValue({
      id: "a1",
      lifecycle: ActivityLifecycle.cancelled,
      owner: { nickname: "x" },
    });
    try {
      await service.getById("a1");
      expect.fail("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(NotFoundException);
      const body = (e as NotFoundException).getResponse() as {
        code?: string;
        message?: string;
      };
      expect(body.code).toBe("ACTIVITY_CANCELLED");
    }
  });

  it("get throws removed with code", async () => {
    prisma.activity.findUnique.mockResolvedValue({
      id: "a1",
      lifecycle: ActivityLifecycle.removed,
      owner: { nickname: "x" },
    });
    try {
      await service.getById("a1");
      expect.fail("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(NotFoundException);
      const body = (e as NotFoundException).getResponse() as { code?: string };
      expect(body.code).toBe("ACTIVITY_REMOVED");
    }
  });

  it("get draft as not found without code", async () => {
    prisma.activity.findUnique.mockResolvedValue({
      id: "a1",
      lifecycle: ActivityLifecycle.draft,
      owner: { nickname: "x" },
    });
    try {
      await service.getById("a1");
      expect.fail("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(NotFoundException);
      const body = (e as NotFoundException).getResponse() as { code?: string };
      expect(body.code).toBeUndefined();
    }
  });

  function hotRow(id: string, publishedAt: string) {
    return {
      id,
      title: id,
      coverUrl: "https://x/c.jpg",
      category: "观赛",
      description: null,
      rules: "须知",
      startAt: new Date("2030-01-01T10:00:00.000Z"),
      endAt: new Date("2030-01-01T12:00:00.000Z"),
      registrationDeadlineAt: new Date("2030-01-01T10:00:00.000Z"),
      allowUserCancel: true,
      refundable: false,
      place: "滨江",
      placeLat: 1,
      placeLng: 2,
      capacity: 20,
      feeType: "free",
      feeCents: 0,
      feeNote: null,
      lifecycle: ActivityLifecycle.published,
      publishedAt: new Date(publishedAt),
      cancelReason: null,
      removeReason: null,
      platformFeeBps: 100,
      owner: { nickname: "探索社" },
    };
  }

  it("listHot ranks published not-ended activities by confirmed count", async () => {
    prisma.activity.findMany.mockResolvedValue([
      hotRow("low", "2026-10-03T00:00:00.000Z"),
      hotRow("high", "2026-10-01T00:00:00.000Z"),
      hotRow("mid", "2026-10-02T00:00:00.000Z"),
      hotRow("zero", "2026-10-04T00:00:00.000Z"),
    ]);
    prisma.registration.groupBy.mockResolvedValue([
      { activityId: "high", _count: { _all: 9 } },
      { activityId: "mid", _count: { _all: 4 } },
      { activityId: "low", _count: { _all: 1 } },
    ]);

    const res = await service.listHot();
    expect(prisma.activity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          lifecycle: ActivityLifecycle.published,
          endAt: expect.objectContaining({ gt: expect.any(Date) }),
        }),
      }),
    );
    expect(res.map((row) => row.id)).toEqual(["high", "mid", "low"]);
    expect(res[0]).not.toHaveProperty("confirmedCount");
    expect(res[0]).not.toHaveProperty("cancelReason");
  });

  it("listHot breaks ties by publishedAt desc", async () => {
    prisma.activity.findMany.mockResolvedValue([
      hotRow("older", "2026-10-01T00:00:00.000Z"),
      hotRow("newer", "2026-10-03T00:00:00.000Z"),
    ]);
    prisma.registration.groupBy.mockResolvedValue([
      { activityId: "older", _count: { _all: 2 } },
      { activityId: "newer", _count: { _all: 2 } },
    ]);

    const res = await service.listHot();
    expect(res.map((row) => row.id)).toEqual(["newer", "older"]);
  });

  it("listHot returns fewer than 3 when not enough published activities", async () => {
    prisma.activity.findMany.mockResolvedValue([
      hotRow("only", "2026-10-01T00:00:00.000Z"),
    ]);
    prisma.registration.groupBy.mockResolvedValue([]);

    const res = await service.listHot();
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe("only");
  });
});

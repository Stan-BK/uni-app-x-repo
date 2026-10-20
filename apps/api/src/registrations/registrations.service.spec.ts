import { ForbiddenException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { RegistrationErrorCode } from "@activity/shared";
import {
  ActivityLifecycle,
  FeeType,
  RegistrationStatus,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { RegistrationsService } from "./registrations.service";

describe("RegistrationsService", () => {
  let service: RegistrationsService;
  const tx = {
    $queryRaw: vi.fn(),
    activity: { findUnique: vi.fn() },
    registration: {
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
    activity: {
      findUnique: vi.fn(),
    },
    registration: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        RegistrationsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = mod.get(RegistrationsService);
  });

  const publishedFree = {
    id: "act1",
    lifecycle: ActivityLifecycle.published,
    feeType: FeeType.free,
    capacity: 2,
    startAt: new Date("2030-01-01"),
    endAt: new Date("2030-01-02"),
    registrationDeadlineAt: new Date("2030-01-01"),
    allowUserCancel: true,
  };

  it("create confirms when capacity available", async () => {
    tx.$queryRaw.mockResolvedValue([publishedFree]);
    tx.registration.findUnique.mockResolvedValue(null);
    tx.registration.count.mockResolvedValue(0);
    tx.registration.create.mockResolvedValue({
      id: "r1",
      activityId: "act1",
      userId: "u1",
      name: "张三",
      phone: "13800138000",
      status: RegistrationStatus.confirmed,
      cancelledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const dto = await service.create("u1", {
      activityId: "act1",
      name: "张三",
      phone: "13800138000",
    });
    expect(dto.status).toBe("confirmed");
    expect(tx.registration.create).toHaveBeenCalled();
  });

  it("create rejects paid", async () => {
    tx.$queryRaw.mockResolvedValue([
      { ...publishedFree, feeType: FeeType.paid },
    ]);
    await expect(
      service.create("u1", {
        activityId: "act1",
        name: "张三",
        phone: "13800138000",
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: RegistrationErrorCode.PaidNotSupported,
      }),
    });
  });

  it("create rejects when full", async () => {
    tx.$queryRaw.mockResolvedValue([publishedFree]);
    tx.registration.findUnique.mockResolvedValue(null);
    tx.registration.count.mockResolvedValue(2);
    await expect(
      service.create("u1", {
        activityId: "act1",
        name: "张三",
        phone: "13800138000",
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: RegistrationErrorCode.ActivityFull,
      }),
    });
  });

  it("create rejects when activity ended", async () => {
    tx.$queryRaw.mockResolvedValue([
      {
        ...publishedFree,
        startAt: new Date("2020-01-01"),
        endAt: new Date("2020-01-02"),
      },
    ]);
    await expect(
      service.create("u1", {
        activityId: "act1",
        name: "张三",
        phone: "13800138000",
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: RegistrationErrorCode.ActivityEnded,
      }),
    });
  });

  it("create rejects when registration deadline passed", async () => {
    tx.$queryRaw.mockResolvedValue([
      {
        ...publishedFree,
        registrationDeadlineAt: new Date("2020-06-01"),
        startAt: new Date("2030-01-01"),
        endAt: new Date("2030-01-02"),
      },
    ]);
    await expect(
      service.create("u1", {
        activityId: "act1",
        name: "张三",
        phone: "13800138000",
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: RegistrationErrorCode.RegistrationClosed,
      }),
    });
  });

  it("create is idempotent when already confirmed", async () => {
    const existing = {
      id: "r1",
      activityId: "act1",
      userId: "u1",
      name: "张三",
      phone: "13800138000",
      status: RegistrationStatus.confirmed,
      cancelledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    tx.$queryRaw.mockResolvedValue([publishedFree]);
    tx.registration.findUnique.mockResolvedValue(existing);
    const dto = await service.create("u1", {
      activityId: "act1",
      name: "李四",
      phone: "13900139000",
    });
    expect(dto.id).toBe("r1");
    expect(tx.registration.create).not.toHaveBeenCalled();
    expect(tx.registration.update).not.toHaveBeenCalled();
  });

  it("create reactivates cancelled registration", async () => {
    const existing = {
      id: "r1",
      activityId: "act1",
      userId: "u1",
      name: "旧名",
      phone: "13700137000",
      status: RegistrationStatus.cancelled,
      cancelledAt: new Date("2026-01-01"),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    tx.$queryRaw.mockResolvedValue([publishedFree]);
    tx.registration.findUnique.mockResolvedValue(existing);
    tx.registration.count.mockResolvedValue(0);
    tx.registration.update.mockResolvedValue({
      ...existing,
      name: "张三",
      phone: "13800138000",
      status: RegistrationStatus.confirmed,
      cancelledAt: null,
    });
    const dto = await service.create("u1", {
      activityId: "act1",
      name: "张三",
      phone: "13800138000",
    });
    expect(dto.status).toBe("confirmed");
    expect(tx.registration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "r1" },
        data: expect.objectContaining({
          status: RegistrationStatus.confirmed,
          name: "张三",
          phone: "13800138000",
          cancelledAt: null,
        }),
      }),
    );
    expect(tx.registration.create).not.toHaveBeenCalled();
  });

  it("cancel rejects when allowUserCancel is false", async () => {
    prisma.registration.findUnique.mockResolvedValue({
      id: "r1",
      userId: "u1",
      status: RegistrationStatus.confirmed,
      activity: { ...publishedFree, allowUserCancel: false },
    });
    await expect(service.cancel("u1", "r1")).rejects.toMatchObject({
      response: expect.objectContaining({
        code: RegistrationErrorCode.CancelNotAllowed,
      }),
    });
  });

  it("cancel releases confirmed registration", async () => {
    prisma.registration.findUnique.mockResolvedValue({
      id: "r1",
      userId: "u1",
      status: RegistrationStatus.confirmed,
      activity: publishedFree,
    });
    tx.$queryRaw.mockResolvedValue([publishedFree]);
    tx.registration.update.mockResolvedValue({
      id: "r1",
      activityId: "act1",
      userId: "u1",
      name: "张三",
      phone: "13800138000",
      status: RegistrationStatus.cancelled,
      cancelledAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const dto = await service.cancel("u1", "r1");
    expect(dto.status).toBe("cancelled");
  });

  it("cancel forbidden for other user", async () => {
    prisma.registration.findUnique.mockResolvedValue({
      id: "r1",
      userId: "u2",
      status: RegistrationStatus.confirmed,
      activity: publishedFree,
    });
    await expect(service.cancel("u1", "r1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("cancel is idempotent when already cancelled", async () => {
    const row = {
      id: "r1",
      activityId: "act1",
      userId: "u1",
      name: "张三",
      phone: "13800138000",
      status: RegistrationStatus.cancelled,
      cancelledAt: new Date("2026-01-01"),
      createdAt: new Date(),
      updatedAt: new Date(),
      activity: publishedFree,
    };
    prisma.registration.findUnique.mockResolvedValue(row);
    const dto = await service.cancel("u1", "r1");
    expect(dto.status).toBe("cancelled");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("cancel rejects when activity ended", async () => {
    prisma.registration.findUnique.mockResolvedValue({
      id: "r1",
      userId: "u1",
      status: RegistrationStatus.confirmed,
      activity: {
        ...publishedFree,
        startAt: new Date("2020-01-01"),
        endAt: new Date("2020-01-02"),
      },
    });
    await expect(service.cancel("u1", "r1")).rejects.toMatchObject({
      response: expect.objectContaining({
        code: RegistrationErrorCode.ActivityEnded,
      }),
    });
  });

  it("listMine returns paginated items with activity summary", async () => {
    const start = new Date("2030-01-01T10:00:00.000Z");
    prisma.registration.findMany.mockResolvedValue([
      {
        id: "r1",
        activityId: "act1",
        userId: "u1",
        name: "张三",
        phone: "13800138000",
        status: RegistrationStatus.confirmed,
        cancelledAt: null,
        createdAt: new Date("2026-10-01T00:00:00.000Z"),
        updatedAt: new Date("2026-10-01T00:00:00.000Z"),
        activity: {
          id: "act1",
          title: "徒步",
          coverUrl: "https://x/c.jpg",
          startAt: start,
          place: "滨江",
          endAt: new Date("2030-01-02"),
          capacity: 10,
        },
      },
    ]);
    prisma.registration.count.mockResolvedValue(1);
    prisma.registration.groupBy.mockResolvedValue([
      { activityId: "act1", _count: { _all: 1 } },
    ]);

    const res = await service.listMine("u1", {});
    expect(res).toEqual({
      items: [
        expect.objectContaining({
          id: "r1",
          status: "confirmed",
          activity: expect.objectContaining({
            id: "act1",
            title: "徒步",
            coverUrl: "https://x/c.jpg",
            place: "滨江",
            startAt: start.toISOString(),
            displayStatus: "open",
          }),
        }),
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });
  });

  it("listForOwner forbidden when not owner", async () => {
    prisma.activity.findUnique.mockResolvedValue({
      id: "act1",
      ownerUserId: "u-other",
    });
    await expect(
      service.listForOwner("u1", "act1", {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("listForOwner success when owner", async () => {
    prisma.activity.findUnique.mockResolvedValue({
      id: "act1",
      ownerUserId: "u1",
    });
    prisma.registration.findMany.mockResolvedValue([
      {
        id: "r1",
        activityId: "act1",
        userId: "u2",
        name: "张三",
        phone: "13800138000",
        status: RegistrationStatus.confirmed,
        cancelledAt: null,
        createdAt: new Date("2026-10-01T00:00:00.000Z"),
        updatedAt: new Date("2026-10-01T00:00:00.000Z"),
      },
    ]);
    prisma.registration.count.mockResolvedValue(1);

    const res = await service.listForOwner("u1", "act1", {});
    expect(res).toEqual({
      items: [
        {
          id: "r1",
          userId: "u2",
          name: "张三",
          phone: "13800138000",
          status: RegistrationStatus.confirmed,
          createdAt: "2026-10-01T00:00:00.000Z",
          cancelledAt: null,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });
  });
});

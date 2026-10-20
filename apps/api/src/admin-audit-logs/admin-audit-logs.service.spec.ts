import { Test } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { AdminAuditLogsService } from "./admin-audit-logs.service";

const row = {
  id: "log-1",
  actorType: "admin",
  actorId: "adm-1",
  action: "freeze_publish",
  targetType: "user",
  targetId: "u1",
  reason: "违规",
  meta: null,
  createdAt: new Date("2026-10-20T12:00:00.000Z"),
};

describe("AdminAuditLogsService", () => {
  let service: AdminAuditLogsService;

  const prisma = {
    auditLog: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    adminUser: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    activity: { findMany: vi.fn() },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    prisma.auditLog.findMany.mockResolvedValue([row]);
    prisma.auditLog.count.mockResolvedValue(1);
    prisma.adminUser.findMany.mockResolvedValue([
      { id: "adm-1", displayName: "运营甲", email: "a@example.com" },
    ]);
    prisma.user.findMany.mockResolvedValue([{ id: "u1", nickname: "Alice" }]);
    prisma.activity.findMany.mockResolvedValue([]);

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminAuditLogsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(AdminAuditLogsService);
  });

  it("lists newest first with default page size 20", async () => {
    const result = await service.list();

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: 0,
      take: 20,
    });
    expect(result).toEqual({
      items: [
        {
          id: "log-1",
          createdAt: row.createdAt,
          action: "freeze_publish",
          targetType: "user",
          targetId: "u1",
          reason: "违规",
          actor: {
            id: "adm-1",
            displayName: "运营甲",
            email: "a@example.com",
          },
          target: { id: "u1", label: "Alice" },
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });
  });

  it("applies filters, pagination, and caps pageSize at 50", async () => {
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.auditLog.count.mockResolvedValue(0);

    const result = await service.list({
      action: "remove",
      targetType: "activity",
      targetId: "act-1",
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-10-31T23:59:59.000Z",
      page: 2,
      pageSize: 100,
    });

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
      where: {
        action: "remove",
        targetType: "activity",
        targetId: "act-1",
        createdAt: {
          gte: new Date("2026-10-01T00:00:00.000Z"),
          lte: new Date("2026-10-31T23:59:59.000Z"),
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: 50,
      take: 50,
    });
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(50);
    expect(result.total).toBe(0);
  });

  it("returns empty list when from is after to", async () => {
    const result = await service.list({
      from: "2026-10-20T00:00:00.000Z",
      to: "2026-10-01T00:00:00.000Z",
    });

    expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
    expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
  });

  it("keeps the row when actor or target is missing", async () => {
    prisma.adminUser.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([]);

    const result = await service.list();

    expect(result.items[0]?.actor).toEqual({
      id: "adm-1",
      displayName: null,
      email: null,
    });
    expect(result.items[0]?.target).toEqual({ id: "u1", label: "" });
  });

  it("maps activity title as target label", async () => {
    prisma.auditLog.findMany.mockResolvedValue([
      {
        ...row,
        action: "remove",
        targetType: "activity",
        targetId: "act-1",
      },
    ]);
    prisma.user.findMany.mockResolvedValue([]);
    prisma.activity.findMany.mockResolvedValue([
      { id: "act-1", title: "周末市集" },
    ]);

    const result = await service.list({ action: "remove" });

    expect(result.items[0]?.target).toEqual({
      id: "act-1",
      label: "周末市集",
    });
  });
});

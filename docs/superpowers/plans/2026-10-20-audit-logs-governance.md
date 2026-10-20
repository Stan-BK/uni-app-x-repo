# P0-5 审计日志查询 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Admin 补上只读审计查询：`GET /admin/audit-logs` + `/audit-logs` 页，使冻结/下架写入的 `AuditLog` 可按操作、对象、时间翻页查看；仅 `admin` 角色可访问。

**Architecture:** 复用现有 `AuditLog`（只追加、不改写）。独立 `AdminAuditLogsModule` 提供列表接口：分页与用户列表一致，查询时批量联表 `AdminUser` / `User` / `Activity` 填展示名。Admin 登录持久化 `role`，路由与导航对 `operator` 隐藏审计入口；写路径（冻结/下架）本计划不改。

**Tech Stack:** NestJS 11、Prisma 6、PostgreSQL、Vitest、`@activity/shared`、Vue 3 + Element Plus Admin、pnpm workspace

**前置文档：** [ADR-0008](../../adr/0008-operational-governance-audit-logs.md)、[设计规格](../specs/2026-10-20-audit-logs-governance-design.md)、ADR-0004（admin 才可看审计）

---

## 文件结构

```text
packages/shared/src/audit.ts                 # AuditAction / AuditTargetType / 中文标签
packages/shared/src/index.ts                 # 导出 audit

apps/api/prisma/schema.prisma                # AuditLog @@index([createdAt])
apps/api/prisma/migrations/20261020123000_add_audit_log_created_at_index/migration.sql

apps/api/src/admin-audit-logs/
  admin-audit-logs.module.ts
  admin-audit-logs.controller.ts
  admin-audit-logs.service.ts
  admin-audit-logs.service.spec.ts
  dto/list-audit-logs.query.ts
  dto/list-audit-logs.query.spec.ts

apps/api/src/common/guards/roles.guard.spec.ts
apps/api/src/app.module.ts                   # import AdminAuditLogsModule

apps/admin/src/api/http.ts                   # 持久化 admin profile
apps/admin/src/api/admin.ts                  # listAuditLogs
apps/admin/src/views/Login.vue               # 登录后写入 profile
apps/admin/src/router.ts                     # /audit-logs + role guard
apps/admin/src/views/AuditLogs.vue           # 新建
apps/admin/src/views/Users.vue               # 审计入口（仅 admin）
apps/admin/src/views/Activities.vue          # 同上
```

本计划**不改** `admin-users` / `admin-activities` 的写入逻辑，不改 mp。

---

### Task 1: shared 审计常量

**Files:**
- Create: `packages/shared/src/audit.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: 新增 `audit.ts`**

```ts
export const AuditAction = {
  FreezePublish: "freeze_publish",
  UnfreezePublish: "unfreeze_publish",
  Remove: "remove",
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export const AuditTargetType = {
  User: "user",
  Activity: "activity",
} as const;
export type AuditTargetType =
  (typeof AuditTargetType)[keyof typeof AuditTargetType];

export const AuditActionLabel: Record<AuditAction, string> = {
  freeze_publish: "冻结发布权",
  unfreeze_publish: "恢复发布权",
  remove: "下架活动",
};

export function auditActionLabel(action: string): string {
  if (action in AuditActionLabel) {
    return AuditActionLabel[action as AuditAction];
  }
  return action;
}
```

- [ ] **Step 2: 从 `index.ts` 导出**

`packages/shared/src/index.ts` 全文：

```ts
/** Shared enums and constants for mp / api / admin. */
export * from "./identity";
export * from "./activity";
export * from "./audit";
```

- [ ] **Step 3: 构建 shared**

Run: `pnpm --filter @activity/shared build`  
Expected: PASS（exit 0）

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/audit.ts packages/shared/src/index.ts
git commit -m "$(cat <<'EOF'
feat(shared): 导出审计 action 与对象类型

EOF
)"
```

---

### Task 2: Prisma — `AuditLog.createdAt` 索引

**Files:**
- Modify: `apps/api/prisma/schema.prisma`（`model AuditLog`）
- Create: `apps/api/prisma/migrations/20261020123000_add_audit_log_created_at_index/migration.sql`

- [ ] **Step 1: 改 schema**

`model AuditLog` 的索引改为：

```prisma
model AuditLog {
  id         String   @id @default(cuid())
  actorType  String
  actorId    String
  action     String
  targetType String
  targetId   String
  reason     String?
  meta       Json?
  createdAt  DateTime @default(now())

  @@index([targetType, targetId])
  @@index([createdAt])
}
```

不要改其它字段。

- [ ] **Step 2: 手写迁移 SQL**

创建 `apps/api/prisma/migrations/20261020123000_add_audit_log_created_at_index/migration.sql`：

```sql
-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
```

不跑 `prisma migrate dev`（避免本任务依赖本地 Postgres）。实现后由开发者在有库的环境执行 `pnpm --filter @activity/api prisma:migrate` 或部署时 migrate deploy。

- [ ] **Step 3: 生成 Client**

Run: `pnpm --filter @activity/api prisma:generate`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20261020123000_add_audit_log_created_at_index/migration.sql
git commit -m "$(cat <<'EOF'
feat(api): 为 AuditLog 增加 createdAt 索引

EOF
)"
```

---

### Task 3: `AdminAuditLogsService` TDD

**Files:**
- Create: `apps/api/src/admin-audit-logs/admin-audit-logs.service.spec.ts`
- Create: `apps/api/src/admin-audit-logs/admin-audit-logs.service.ts`

- [ ] **Step 1: 写失败单测**

创建 `apps/api/src/admin-audit-logs/admin-audit-logs.service.spec.ts`：

```ts
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
```

- [ ] **Step 2: 跑测，确认失败**

Run: `pnpm --filter @activity/api test -- src/admin-audit-logs/admin-audit-logs.service.spec.ts`  
Expected: FAIL（找不到 `AdminAuditLogsService` 或模块）

- [ ] **Step 3: 最小实现**

创建 `apps/api/src/admin-audit-logs/admin-audit-logs.service.ts`：

```ts
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export type ListAuditLogsInput = {
  action?: string;
  targetType?: string;
  targetId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

@Injectable()
export class AdminAuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListAuditLogsInput = {}) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 20));
    const fromDate = query.from ? new Date(query.from) : undefined;
    const toDate = query.to ? new Date(query.to) : undefined;

    if (fromDate && toDate && fromDate > toDate) {
      return { items: [], total: 0, page, pageSize };
    }

    const where: Prisma.AuditLogWhereInput = {
      ...(query.action ? { action: query.action } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(query.targetId ? { targetId: query.targetId } : {}),
      ...(fromDate || toDate
        ? {
            createdAt: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const adminIds = [
      ...new Set(
        rows.filter((r) => r.actorType === "admin").map((r) => r.actorId),
      ),
    ];
    const userIds = [
      ...new Set(
        rows.filter((r) => r.targetType === "user").map((r) => r.targetId),
      ),
    ];
    const activityIds = [
      ...new Set(
        rows.filter((r) => r.targetType === "activity").map((r) => r.targetId),
      ),
    ];

    const [admins, users, activities] = await Promise.all([
      adminIds.length
        ? this.prisma.adminUser.findMany({
            where: { id: { in: adminIds } },
            select: { id: true, displayName: true, email: true },
          })
        : Promise.resolve([]),
      userIds.length
        ? this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, nickname: true },
          })
        : Promise.resolve([]),
      activityIds.length
        ? this.prisma.activity.findMany({
            where: { id: { in: activityIds } },
            select: { id: true, title: true },
          })
        : Promise.resolve([]),
    ]);

    const adminMap = new Map(admins.map((a) => [a.id, a]));
    const userMap = new Map(users.map((u) => [u.id, u]));
    const activityMap = new Map(activities.map((a) => [a.id, a]));

    const items = rows.map((logRow) => {
      const admin = adminMap.get(logRow.actorId);
      let label = "";
      if (logRow.targetType === "user") {
        label = userMap.get(logRow.targetId)?.nickname?.trim() ?? "";
      } else if (logRow.targetType === "activity") {
        label = activityMap.get(logRow.targetId)?.title ?? "";
      }
      return {
        id: logRow.id,
        createdAt: logRow.createdAt,
        action: logRow.action,
        targetType: logRow.targetType,
        targetId: logRow.targetId,
        reason: logRow.reason,
        actor: {
          id: logRow.actorId,
          displayName: admin?.displayName ?? null,
          email: admin?.email ?? null,
        },
        target: { id: logRow.targetId, label },
      };
    });

    return { items, total, page, pageSize };
  }
}
```

- [ ] **Step 4: 跑测，确认通过**

Run: `pnpm --filter @activity/api test -- src/admin-audit-logs/admin-audit-logs.service.spec.ts`  
Expected: PASS（5 tests）

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/admin-audit-logs/admin-audit-logs.service.ts apps/api/src/admin-audit-logs/admin-audit-logs.service.spec.ts
git commit -m "$(cat <<'EOF'
feat(api): 实现 Admin 审计日志分页查询

EOF
)"
```

---

### Task 4: 查询 DTO、仅 admin 的路由、挂模块

**Files:**
- Create: `apps/api/src/admin-audit-logs/dto/list-audit-logs.query.ts`
- Create: `apps/api/src/admin-audit-logs/dto/list-audit-logs.query.spec.ts`
- Create: `apps/api/src/admin-audit-logs/admin-audit-logs.controller.ts`
- Create: `apps/api/src/admin-audit-logs/admin-audit-logs.module.ts`
- Create: `apps/api/src/common/guards/roles.guard.spec.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: 写 DTO 与 RolesGuard 失败单测**

`apps/api/src/admin-audit-logs/dto/list-audit-logs.query.ts`：

```ts
import { Transform } from "class-transformer";
import { IsIn, IsISO8601, IsOptional, IsString } from "class-validator";
import { AuditAction, AuditTargetType } from "@activity/shared";

function emptyToUndefined({ value }: { value: unknown }) {
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
}

export class ListAuditLogsQuery {
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsIn(Object.values(AuditAction))
  action?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsIn(Object.values(AuditTargetType))
  targetType?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  targetId?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsISO8601()
  from?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}
```

`apps/api/src/admin-audit-logs/dto/list-audit-logs.query.spec.ts`：

```ts
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { ListAuditLogsQuery } from "./list-audit-logs.query";

describe("ListAuditLogsQuery", () => {
  it("accepts known action and ISO dates", async () => {
    const dto = plainToInstance(ListAuditLogsQuery, {
      action: "freeze_publish",
      targetType: "user",
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-10-20T00:00:00.000Z",
    });
    expect(await validate(dto)).toEqual([]);
  });

  it("rejects unknown action", async () => {
    const dto = plainToInstance(ListAuditLogsQuery, { action: "nope" });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "action")).toBe(true);
  });

  it("rejects invalid date", async () => {
    const dto = plainToInstance(ListAuditLogsQuery, { from: "not-a-date" });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "from")).toBe(true);
  });

  it("treats blank action as omitted", async () => {
    const dto = plainToInstance(ListAuditLogsQuery, { action: "  " });
    expect(dto.action).toBeUndefined();
    expect(await validate(dto)).toEqual([]);
  });
});
```

`apps/api/src/common/guards/roles.guard.spec.ts`：

```ts
import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RolesGuard } from "./roles.guard";

function mockContext(role?: string): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => (role ? { admin: { adminId: "a1", role } } : {}),
    }),
  } as ExecutionContext;
}

describe("RolesGuard", () => {
  const reflector = { getAllAndOverride: vi.fn() };
  let guard: RolesGuard;

  beforeEach(() => {
    vi.clearAllMocks();
    guard = new RolesGuard(reflector as unknown as Reflector);
    reflector.getAllAndOverride.mockReturnValue(["admin"]);
  });

  it("allows admin", () => {
    expect(guard.canActivate(mockContext("admin"))).toBe(true);
  });

  it("forbids operator", () => {
    expect(() => guard.canActivate(mockContext("operator"))).toThrow(
      ForbiddenException,
    );
  });

  it("forbids missing role", () => {
    expect(() => guard.canActivate(mockContext())).toThrow(ForbiddenException);
  });
});
```

- [ ] **Step 2: 跑 DTO / Guard 测（DTO 应先过，Guard 在现有 `RolesGuard` 上应过）**

Run: `pnpm --filter @activity/api test -- src/admin-audit-logs/dto/list-audit-logs.query.spec.ts src/common/guards/roles.guard.spec.ts`  
Expected: DTO 4 tests PASS；Guard 3 tests PASS（`RolesGuard` 已存在）

若 DTO 测因文件未参与编译失败，先确认 Step 1 文件已保存再跑。

- [ ] **Step 3: Controller + Module + 挂到 AppModule**

`apps/api/src/admin-audit-logs/admin-audit-logs.controller.ts`：

```ts
import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AdminRole } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { AdminJwtGuard } from "../common/guards/admin-jwt.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { AdminAuditLogsService } from "./admin-audit-logs.service";
import { ListAuditLogsQuery } from "./dto/list-audit-logs.query";

@Controller("admin/audit-logs")
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles(AdminRole.admin)
export class AdminAuditLogsController {
  constructor(private readonly adminAuditLogsService: AdminAuditLogsService) {}

  @Get()
  list(@Query() query: ListAuditLogsQuery) {
    return this.adminAuditLogsService.list({
      action: query.action,
      targetType: query.targetType,
      targetId: query.targetId?.trim() || undefined,
      from: query.from,
      to: query.to,
      page: query.page === undefined ? undefined : Number(query.page),
      pageSize:
        query.pageSize === undefined ? undefined : Number(query.pageSize),
    });
  }
}
```

只注册 `GET`，不要加 POST/PATCH/DELETE。

`apps/api/src/admin-audit-logs/admin-audit-logs.module.ts`：

```ts
import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { AdminAuditLogsController } from "./admin-audit-logs.controller";
import { AdminAuditLogsService } from "./admin-audit-logs.service";

@Module({
  imports: [AdminAuthModule],
  controllers: [AdminAuditLogsController],
  providers: [AdminAuditLogsService],
})
export class AdminAuditLogsModule {}
```

`apps/api/src/app.module.ts`：在 imports 列表中 `AdminActivitiesModule` 旁加入 `AdminAuditLogsModule`（先增加 `import { AdminAuditLogsModule } from "./admin-audit-logs/admin-audit-logs.module";`）。

- [ ] **Step 4: 全量 API 单测 + type-check**

Run: `pnpm --filter @activity/api test`  
Expected: PASS（既有测试 + 本模块新增测试全部绿）

Run: `pnpm --filter @activity/api type-check`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/admin-audit-logs apps/api/src/common/guards/roles.guard.spec.ts apps/api/src/app.module.ts
git commit -m "$(cat <<'EOF'
feat(api): 开放仅 admin 可读的审计日志接口

EOF
)"
```

---

### Task 5: Admin 登录持久化 `role`

**Files:**
- Modify: `apps/admin/src/api/http.ts`
- Modify: `apps/admin/src/views/Login.vue`

- [ ] **Step 1: `http.ts` 增加 profile，token 清空时一起清**

在 `TOKEN_KEY` 旁增加 `ADMIN_KEY`，并导出读写。`setAdminToken(null)` 必须同时 `removeItem(ADMIN_KEY)`（401 与退出共用）。

`apps/admin/src/api/http.ts` 全文：

```ts
import { AdminRole } from "@activity/shared";

const TOKEN_KEY = "admin_access_token";
const ADMIN_KEY = "admin_profile";

export type AdminProfile = {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
};

export function getApiBase(): string {
  return import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:3000/api";
}

export function getAdminToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getAdminProfile(): AdminProfile | null {
  const raw = localStorage.getItem(ADMIN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AdminProfile;
  } catch {
    return null;
  }
}

export function setAdminProfile(admin: AdminProfile | null): void {
  if (admin) {
    localStorage.setItem(ADMIN_KEY, JSON.stringify(admin));
  } else {
    localStorage.removeItem(ADMIN_KEY);
  }
}

export function setAdminToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ADMIN_KEY);
  }
}

export function isAdminRole(): boolean {
  return getAdminProfile()?.role === AdminRole.Admin;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  auth?: boolean;
};

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", body, auth = true } = options;
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (auth) {
    const token = getAdminToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const res = await fetch(`${getApiBase()}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 401) {
    setAdminToken(null);
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "message" in data &&
      (typeof (data as { message: unknown }).message === "string" ||
        Array.isArray((data as { message: unknown }).message))
        ? String(
            Array.isArray((data as { message: unknown }).message)
              ? (data as { message: string[] }).message.join(", ")
              : (data as { message: string }).message,
          )
        : res.statusText || `HTTP ${res.status}`;
    throw new ApiError(res.status, message);
  }

  return data as T;
}
```

- [ ] **Step 2: 登录成功写入 profile**

`Login.vue` 的 `onSubmit` 在 `setAdminToken(result.accessToken)` **之后**调用 `setAdminProfile(result.admin)`。

将 import 改为：

```ts
import { ApiError, setAdminProfile, setAdminToken } from "../api/http";
```

成功分支：

```ts
    const result = await adminLogin(form.email.trim(), form.password);
    setAdminToken(result.accessToken);
    setAdminProfile(result.admin);
```

- [ ] **Step 3: Admin type-check**

Run: `pnpm --filter @activity/admin type-check`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/api/http.ts apps/admin/src/views/Login.vue
git commit -m "$(cat <<'EOF'
feat(admin): 登录后持久化管理员角色

EOF
)"
```

---

### Task 6: 审计页、路由守卫、导航入口

**Files:**
- Modify: `apps/admin/src/api/admin.ts`
- Modify: `apps/admin/src/router.ts`
- Create: `apps/admin/src/views/AuditLogs.vue`
- Modify: `apps/admin/src/views/Users.vue`
- Modify: `apps/admin/src/views/Activities.vue`

- [ ] **Step 1: API client**

在 `apps/admin/src/api/admin.ts` 末尾追加（不要改现有 freeze/remove 函数）：

```ts
export type AuditLogRow = {
  id: string;
  createdAt: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  actor: { id: string; displayName: string | null; email: string | null };
  target: { id: string; label: string };
};

export type ListAuditLogsParams = {
  action?: string;
  targetType?: string;
  targetId?: string;
  from?: string;
  to?: string;
  page?: number;
};

export function listAuditLogs(params: ListAuditLogsParams = {}) {
  const q = new URLSearchParams();
  if (params.action) q.set("action", params.action);
  if (params.targetType) q.set("targetType", params.targetType);
  if (params.targetId) q.set("targetId", params.targetId);
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  if (params.page) q.set("page", String(params.page));
  const qs = q.toString();
  return apiRequest<{
    items: AuditLogRow[];
    total: number;
    page: number;
    pageSize: number;
  }>(`/admin/audit-logs${qs ? `?${qs}` : ""}`);
}
```

- [ ] **Step 2: 路由 + `admin` 角色守卫**

`apps/admin/src/router.ts` 全文：

```ts
import { AdminRole } from "@activity/shared";
import { createRouter, createWebHistory } from "vue-router";
import { getAdminProfile, getAdminToken } from "./api/http";
import LoginView from "./views/Login.vue";
import UsersView from "./views/Users.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/users" },
    {
      path: "/login",
      name: "login",
      component: LoginView,
      meta: { public: true },
    },
    {
      path: "/users",
      name: "users",
      component: UsersView,
    },
    {
      path: "/activities",
      name: "activities",
      component: () => import("./views/Activities.vue"),
    },
    {
      path: "/audit-logs",
      name: "audit-logs",
      component: () => import("./views/AuditLogs.vue"),
      meta: { roles: [AdminRole.Admin] },
    },
  ],
});

router.beforeEach((to) => {
  if (to.meta.public) return true;
  if (!getAdminToken()) {
    return { name: "login", query: { redirect: to.fullPath } };
  }
  const roles = to.meta.roles as string[] | undefined;
  if (roles?.length && !roles.includes(getAdminProfile()?.role ?? "")) {
    return { name: "users" };
  }
  return true;
});
```

- [ ] **Step 3: 新建 `AuditLogs.vue`**

创建 `apps/admin/src/views/AuditLogs.vue`（Composition API + `<script setup>`）：

```vue
<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import {
  AuditAction,
  AuditTargetType,
  auditActionLabel,
} from "@activity/shared";
import { listAuditLogs, type AuditLogRow } from "../api/admin";
import { ApiError, setAdminToken } from "../api/http";

const router = useRouter();
const rows = ref<AuditLogRow[]>([]);
const loading = ref(false);
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);
const action = ref("");
const targetType = ref("");
const targetId = ref("");
const range = ref<[Date, Date] | undefined>(undefined);

async function load(nextPage = 1) {
  loading.value = true;
  try {
    const result = await listAuditLogs({
      action: action.value || undefined,
      targetType: targetType.value || undefined,
      targetId: targetId.value.trim() || undefined,
      from: range.value?.[0]?.toISOString(),
      to: range.value?.[1]?.toISOString(),
      page: nextPage,
    });
    rows.value = result.items;
    page.value = result.page;
    pageSize.value = result.pageSize;
    total.value = result.total;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      await router.replace("/login");
      return;
    }
    if (e instanceof ApiError && e.status === 403) {
      await router.replace("/users");
      return;
    }
    ElMessage.error(e instanceof ApiError ? e.message : "加载失败");
  } finally {
    loading.value = false;
  }
}

function actorText(row: AuditLogRow) {
  return row.actor.displayName?.trim() || row.actor.email || "管理员";
}

function targetText(row: AuditLogRow) {
  const fallback = row.targetType === AuditTargetType.User ? "用户" : "活动";
  const label = row.target.label.trim() || fallback;
  return `${label}（${row.target.id}）`;
}

function logout() {
  setAdminToken(null);
  void router.replace("/login");
}

watch([action, targetType, range], () => {
  void load(1);
});

onMounted(() => {
  void load(1);
});
</script>

<template>
  <div class="page">
    <div class="bar">
      <h1>审计日志</h1>
      <el-space>
        <router-link class="nav-link" to="/users">用户发布权</router-link>
        <router-link class="nav-link" to="/activities">活动列表</router-link>
        <el-button :loading="loading" @click="load(page)">刷新</el-button>
        <el-button @click="logout">退出</el-button>
      </el-space>
    </div>

    <el-space class="filters" wrap>
      <el-select v-model="action" clearable placeholder="操作" style="width: 160px">
        <el-option :label="auditActionLabel(AuditAction.FreezePublish)" :value="AuditAction.FreezePublish" />
        <el-option :label="auditActionLabel(AuditAction.UnfreezePublish)" :value="AuditAction.UnfreezePublish" />
        <el-option :label="auditActionLabel(AuditAction.Remove)" :value="AuditAction.Remove" />
      </el-select>
      <el-select v-model="targetType" clearable placeholder="对象类型" style="width: 140px">
        <el-option label="用户" :value="AuditTargetType.User" />
        <el-option label="活动" :value="AuditTargetType.Activity" />
      </el-select>
      <el-input
        v-model="targetId"
        clearable
        placeholder="对象 ID"
        style="width: 220px"
        @keyup.enter="load(1)"
      />
      <el-date-picker
        v-model="range"
        type="datetimerange"
        start-placeholder="开始"
        end-placeholder="结束"
      />
      <el-button type="primary" :loading="loading" @click="load(1)">查询</el-button>
    </el-space>

    <el-table
      v-loading="loading"
      class="table"
      row-key="id"
      :data="rows"
      stripe
      empty-text="暂无审计记录"
    >
      <el-table-column label="时间" min-width="180">
        <template #default="{ row }">
          {{ new Date(row.createdAt).toLocaleString() }}
        </template>
      </el-table-column>
      <el-table-column label="操作人" min-width="200">
        <template #default="{ row }">
          <div>{{ actorText(row) }}</div>
          <span class="mono">{{ row.actor.id }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="140">
        <template #default="{ row }">
          {{ auditActionLabel(row.action) }}
        </template>
      </el-table-column>
      <el-table-column label="对象" min-width="240">
        <template #default="{ row }">
          {{ targetText(row) }}
        </template>
      </el-table-column>
      <el-table-column label="原因" min-width="160">
        <template #default="{ row }">
          {{ row.reason || "—" }}
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      class="pager"
      background
      layout="prev, pager, next, total"
      :current-page="page"
      :page-size="pageSize"
      :total="total"
      @current-change="load"
    />
  </div>
</template>

<style scoped>
.page {
  max-width: 1100px;
  margin: 0 auto;
  padding: 24px;
}
.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.bar h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}
.nav-link {
  color: var(--el-color-primary);
  text-decoration: none;
  font-size: 14px;
}
.nav-link:hover {
  text-decoration: underline;
}
.filters {
  margin-bottom: 16px;
}
.table {
  width: 100%;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  user-select: all;
}
.pager {
  margin-top: 16px;
  justify-content: flex-end;
}
</style>
```

对象 ID 用「查询」或回车再请求（避免每个按键打接口）；操作/类型/时间范围变更会 `watch` 后从第 1 页重查。

- [ ] **Step 4: 用户页 / 活动页增加仅 admin 可见的「审计日志」链接**

`Users.vue`：

1. import 增加 `isAdminRole`：

```ts
import { ApiError, isAdminRole, setAdminToken } from "../api/http";
```

2. 顶栏 `el-space` 里、活动列表链接旁增加：

```vue
        <router-link v-if="isAdminRole()" class="nav-link" to="/audit-logs">审计日志</router-link>
        <router-link class="nav-link" to="/activities">活动列表</router-link>
```

`Activities.vue` 同样：

```ts
import { ApiError, isAdminRole, setAdminToken } from "../api/http";
```

顶栏：

```vue
        <router-link class="nav-link" to="/users">用户发布权</router-link>
        <router-link v-if="isAdminRole()" class="nav-link" to="/audit-logs">审计日志</router-link>
```

- [ ] **Step 5: type-check**

Run: `pnpm --filter @activity/admin type-check`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/api/admin.ts apps/admin/src/router.ts apps/admin/src/views/AuditLogs.vue apps/admin/src/views/Users.vue apps/admin/src/views/Activities.vue
git commit -m "$(cat <<'EOF'
feat(admin): 增加仅管理员可见的审计日志页

EOF
)"
```

---

### Task 7: 文档收尾

**Files:**
- Modify: `docs/adr/0008-operational-governance-audit-logs.md`
- Modify: `docs/superpowers/specs/2026-10-20-audit-logs-governance-design.md`
- Modify: `docs/roadmap.md`

- [ ] **Step 1: ADR-0008 → Implemented**

状态行改为 `Implemented`。后果中补一句：已落地 `GET /admin/audit-logs` 与 Admin `/audit-logs`。

规格顶部状态改为 `Implemented`。文档同步清单里「实现后」那一项勾上。

`docs/roadmap.md` P0-5：

```md
- [x] 审计日志查询（ADR-0008 本期增量）
```

- [ ] **Step 2: 回归 API 单测**

Run: `pnpm --filter @activity/api test`  
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add docs/adr/0008-operational-governance-audit-logs.md docs/superpowers/specs/2026-10-20-audit-logs-governance-design.md docs/roadmap.md
git commit -m "$(cat <<'EOF'
docs: ADR-0008 Implemented，审计查询已落地

EOF
)"
```

---

## 手工验收（实现后，不阻塞单测）

用 bootstrap admin（`role=admin`）登录后台：

1. 顶栏出现「审计日志」；冻结/恢复/下架后刷新审计页能看到对应行和原因。  
2. 筛操作、对象类型、对象 ID、时间范围、翻页。  
3. 空结果展示「暂无审计记录」。  
4. 若有 `operator` 账号：无「审计日志」链接；直接打开 `/audit-logs` 回到用户页；请求接口 403。

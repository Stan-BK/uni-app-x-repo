# P0-3 发现与详情 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地匿名公开活动列表（分页、标题搜索、开始/发布时间排序）与详情（展示态 + 分享链错误态），接通 mp 首页/详情，使 ADR-0006 / AT-ACT-06 可验收。

**Architecture:** 独立 `PublicActivitiesModule` 暴露 `GET /api/public/activities` 与 `GET /api/public/activities/:id`；服务端强制可见性与 DTO 裁剪；`displayStatus` 由时间计算；mp 匿名 `request(..., { auth: false })`；报名 API 不接（CTA 占位）。

**Tech Stack:** NestJS 11、Prisma 6、PostgreSQL、Vitest、`@activity/shared`、uni-app Vue3、pnpm workspace

**前置文档：** [ADR-0006](../../adr/0006-activity-discovery-and-public-visibility.md)、[设计规格](../specs/2026-10-19-p0-3-discovery-and-detail-design.md)、ADR-0005、`docs/roadmap.md` P0-3

**注意：** Prisma `Organizer` 字段为 `name`（无 `displayName`）。公开 DTO 映射为 `organizer: { displayName: organizer.name }`。

---

## 文件结构（将创建/改造）

```text
packages/shared/src/
  activity.ts                 # + DisplayStatus / Sort / 错误 code

apps/api/src/
  public-activities/
    public-activities.module.ts
    public-activities.controller.ts
    public-activities.service.ts
    public-activities.service.spec.ts
    dto/list-public-activities.query.ts
    public-activity.mapper.ts   # toPublicDto + displayStatus
  app.module.ts                 # 注册 PublicActivitiesModule

apps/mp/src/
  api/public-activities.ts      # 匿名公开 API
  utils/request.ts              # ApiError 解析 code
  pages/home/index.vue          # 列表 + 搜索 + 排序 + 分页
  pages/activity/detail.vue     # 详情 / 错误态 / CTA 占位
```

---

### Task 1: shared 公开展示枚举与错误码

**Files:**
- Modify: `packages/shared/src/activity.ts`

- [ ] **Step 1: 追加导出**

在 `packages/shared/src/activity.ts` **末尾追加**（保留现有 Lifecycle / FeeType / Category / Registration）：

```ts
/** 公开展示态（由 startAt/endAt 计算；满员 full 留 P0-4） */
export const ActivityDisplayStatus = {
  Upcoming: "upcoming",
  Open: "open",
  Ended: "ended",
  // Full: "full", // P0-4
} as const;
export type ActivityDisplayStatus =
  (typeof ActivityDisplayStatus)[keyof typeof ActivityDisplayStatus];

export const PublicActivitySort = {
  StartAt: "startAt",
  PublishedAt: "publishedAt",
} as const;
export type PublicActivitySort =
  (typeof PublicActivitySort)[keyof typeof PublicActivitySort];

export const PublicActivityErrorCode = {
  Cancelled: "ACTIVITY_CANCELLED",
  Removed: "ACTIVITY_REMOVED",
} as const;
export type PublicActivityErrorCode =
  (typeof PublicActivityErrorCode)[keyof typeof PublicActivityErrorCode];
```

`index.ts` 已 `export * from "./activity"`，无需改。

- [ ] **Step 2: 类型检查**

Run: `pnpm --filter @activity/shared type-check`  
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/activity.ts
git commit -m "$(cat <<'EOF'
feat(shared): 增加公开展示态、排序与公开错误码

EOF
)"
```

---

### Task 2: PublicActivitiesService（TDD）

**Files:**
- Create: `apps/api/src/public-activities/public-activity.mapper.ts`
- Create: `apps/api/src/public-activities/public-activities.service.ts`
- Create: `apps/api/src/public-activities/public-activities.service.spec.ts`

- [ ] **Step 1: 写失败测试**

```ts
// apps/api/src/public-activities/public-activities.service.spec.ts
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
  };

  beforeEach(async () => {
    vi.clearAllMocks();
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
      }),
    );
  });

  it("list applies q and publishedAt sort", async () => {
    prisma.activity.findMany.mockResolvedValue([]);
    prisma.activity.count.mockResolvedValue(0);

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

  it("list rejects invalid sort", async () => {
    await expect(service.list({ sort: "nope" as "startAt" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
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
      organizer: { name: "探索社" },
    });

    const dto = await service.getById("a1");
    expect(dto.displayStatus).toBe("upcoming");
    expect(dto.organizer).toEqual({ displayName: "探索社" });
    expect(dto).not.toHaveProperty("cancelReason");
    expect(dto).not.toHaveProperty("removeReason");
  });

  it("get throws cancelled with code", async () => {
    prisma.activity.findUnique.mockResolvedValue({
      id: "a1",
      lifecycle: ActivityLifecycle.cancelled,
      organizer: { name: "x" },
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
      organizer: { name: "x" },
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
      organizer: { name: "x" },
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
});
```

- [ ] **Step 2: Run 确认失败**

Run: `pnpm --filter @activity/api test -- src/public-activities/public-activities.service.spec.ts`  
Expected: FAIL（模块/文件不存在）

- [ ] **Step 3: 实现 mapper + service**

```ts
// apps/api/src/public-activities/public-activity.mapper.ts
import {
  ActivityDisplayStatus,
  type ActivityDisplayStatus as DisplayStatus,
} from "@activity/shared";
import type { Activity, FeeType, Organizer } from "@prisma/client";

export type PublicActivityDto = {
  id: string;
  title: string;
  coverUrl: string;
  category: string;
  description: string | null;
  rules?: string;
  startAt: string | null;
  endAt: string | null;
  place: string;
  placeLat: number | null;
  placeLng: number | null;
  capacity: number;
  feeType: FeeType;
  feeCents: number;
  feeNote: string | null;
  lifecycle: string;
  displayStatus: DisplayStatus;
  publishedAt: string | null;
  organizer: { displayName: string };
};

export function computeDisplayStatus(
  startAt: Date | null,
  endAt: Date | null,
  now = new Date(),
): DisplayStatus {
  if (endAt && now >= endAt) return ActivityDisplayStatus.Ended;
  if (startAt && now < startAt) return ActivityDisplayStatus.Upcoming;
  return ActivityDisplayStatus.Open;
}

type ActivityWithOrg = Activity & { organizer: Pick<Organizer, "name"> };

export function toPublicDto(
  row: ActivityWithOrg,
  opts: { includeRules: boolean; now?: Date },
): PublicActivityDto {
  const dto: PublicActivityDto = {
    id: row.id,
    title: row.title,
    coverUrl: row.coverUrl,
    category: row.category,
    description: row.description,
    startAt: row.startAt?.toISOString() ?? null,
    endAt: row.endAt?.toISOString() ?? null,
    place: row.place,
    placeLat: row.placeLat,
    placeLng: row.placeLng,
    capacity: row.capacity,
    feeType: row.feeType,
    feeCents: row.feeCents,
    feeNote: row.feeNote,
    lifecycle: row.lifecycle,
    displayStatus: computeDisplayStatus(row.startAt, row.endAt, opts.now),
    publishedAt: row.publishedAt?.toISOString() ?? null,
    organizer: { displayName: row.organizer.name },
  };
  if (opts.includeRules) dto.rules = row.rules;
  return dto;
}
```

```ts
// apps/api/src/public-activities/public-activities.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  PublicActivityErrorCode,
  PublicActivitySort,
} from "@activity/shared";
import { ActivityLifecycle } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { toPublicDto } from "./public-activity.mapper";

export type ListPublicQuery = {
  q?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
};

@Injectable()
export class PublicActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListPublicQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 20));
    const sort = query.sort ?? PublicActivitySort.StartAt;
    if (
      sort !== PublicActivitySort.StartAt &&
      sort !== PublicActivitySort.PublishedAt
    ) {
      throw new BadRequestException("Invalid sort");
    }

    const q = query.q?.trim() ?? "";
    const now = new Date();
    const where = {
      lifecycle: ActivityLifecycle.published,
      endAt: { gt: now },
      ...(q
        ? { title: { contains: q, mode: "insensitive" as const } }
        : {}),
    };
    const orderBy =
      sort === PublicActivitySort.PublishedAt
        ? { publishedAt: "desc" as const }
        : { startAt: "asc" as const };

    const skip = (page - 1) * pageSize;
    const [rows, total] = await Promise.all([
      this.prisma.activity.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
        include: { organizer: { select: { name: true } } },
      }),
      this.prisma.activity.count({ where }),
    ]);

    return {
      items: rows.map((row) =>
        toPublicDto(row, { includeRules: false, now }),
      ),
      total,
      page,
      pageSize,
    };
  }

  async getById(id: string) {
    const row = await this.prisma.activity.findUnique({
      where: { id },
      include: { organizer: { select: { name: true } } },
    });
    if (!row || row.lifecycle === ActivityLifecycle.draft) {
      throw new NotFoundException("活动不存在");
    }
    if (row.lifecycle === ActivityLifecycle.cancelled) {
      throw new NotFoundException({
        message: "活动已取消",
        code: PublicActivityErrorCode.Cancelled,
      });
    }
    if (row.lifecycle === ActivityLifecycle.removed) {
      throw new NotFoundException({
        message: "活动已下架",
        code: PublicActivityErrorCode.Removed,
      });
    }
    if (row.lifecycle !== ActivityLifecycle.published) {
      throw new NotFoundException("活动不存在");
    }
    return toPublicDto(row, { includeRules: true });
  }
}
```

- [ ] **Step 4: 测试 PASS**

Run: `pnpm --filter @activity/api test -- src/public-activities/public-activities.service.spec.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/public-activities
git commit -m "$(cat <<'EOF'
feat(api): PublicActivitiesService 公开列表与详情可见性

EOF
)"
```

---

### Task 3: Controller、Query DTO、Module

**Files:**
- Create: `apps/api/src/public-activities/dto/list-public-activities.query.ts`
- Create: `apps/api/src/public-activities/public-activities.controller.ts`
- Create: `apps/api/src/public-activities/public-activities.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Query DTO + Controller + Module**

```ts
// apps/api/src/public-activities/dto/list-public-activities.query.ts
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class ListPublicActivitiesQuery {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  sort?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;
}
```

```ts
// apps/api/src/public-activities/public-activities.controller.ts
import { Controller, Get, Param, Query } from "@nestjs/common";
import { ListPublicActivitiesQuery } from "./dto/list-public-activities.query";
import { PublicActivitiesService } from "./public-activities.service";

@Controller("public/activities")
export class PublicActivitiesController {
  constructor(private readonly publicActivities: PublicActivitiesService) {}

  @Get()
  list(@Query() query: ListPublicActivitiesQuery) {
    return this.publicActivities.list(query);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.publicActivities.getById(id);
  }
}
```

```ts
// apps/api/src/public-activities/public-activities.module.ts
import { Module } from "@nestjs/common";
import { PublicActivitiesController } from "./public-activities.controller";
import { PublicActivitiesService } from "./public-activities.service";

@Module({
  controllers: [PublicActivitiesController],
  providers: [PublicActivitiesService],
})
export class PublicActivitiesModule {}
```

在 `apps/api/src/app.module.ts` 的 imports 中加入：

```ts
import { PublicActivitiesModule } from "./public-activities/public-activities.module";
// ...
    PublicActivitiesModule,
```

（放在 `ActivitiesModule` 附近即可。）

- [ ] **Step 2: 全量 API 测试**

Run: `pnpm --filter @activity/api test`  
Expected: 全部 PASS

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/public-activities apps/api/src/app.module.ts
git commit -m "$(cat <<'EOF'
feat(api): 暴露匿名 GET /public/activities 路由

EOF
)"
```

---

### Task 4: mp 请求层解析 code + 公开 API 客户端

**Files:**
- Modify: `apps/mp/src/utils/request.ts`
- Create: `apps/mp/src/api/public-activities.ts`

- [ ] **Step 1: 扩展 ApiError 与 messageFromBody**

将 `ApiError` 改为携带可选 `code`：

```ts
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: string[],
    public code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
```

在 `messageFromBody` 中解析顶层与嵌套 `code`（与 Nest `NotFoundException({ message, code })` 对齐），返回 `{ message, fields?, code? }`；`reject(new ApiError(status, ..., fields, code))`。

- [ ] **Step 2: 公开 API**

```ts
// apps/mp/src/api/public-activities.ts
import { request } from "@/utils/request";

export type PublicActivity = {
  id: string;
  title: string;
  coverUrl: string;
  category: string;
  description?: string | null;
  rules?: string;
  startAt?: string | null;
  endAt?: string | null;
  place: string;
  placeLat?: number | null;
  placeLng?: number | null;
  capacity: number;
  feeType: "free" | "paid";
  feeCents: number;
  feeNote?: string | null;
  lifecycle: string;
  displayStatus: "upcoming" | "open" | "ended";
  publishedAt?: string | null;
  organizer: { displayName: string };
};

export type ListPublicParams = {
  q?: string;
  sort?: "startAt" | "publishedAt";
  page?: number;
  pageSize?: number;
};

export function listPublicActivities(params: ListPublicParams = {}) {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.sort) qs.set("sort", params.sort);
  if (params.page) qs.set("page", String(params.page));
  if (params.pageSize) qs.set("pageSize", String(params.pageSize));
  const q = qs.toString();
  return request<{
    items: PublicActivity[];
    total: number;
    page: number;
    pageSize: number;
  }>(`/public/activities${q ? `?${q}` : ""}`, { auth: false });
}

export function getPublicActivity(id: string) {
  return request<PublicActivity>(`/public/activities/${encodeURIComponent(id)}`, {
    auth: false,
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/mp/src/utils/request.ts apps/mp/src/api/public-activities.ts
git commit -m "$(cat <<'EOF'
feat(mp): 公开活动 API 客户端与错误码解析

EOF
)"
```

---

### Task 5: mp 首页接公开列表（搜索 / 排序 / 分页）

**Files:**
- Modify: `apps/mp/src/pages/home/index.vue`

- [ ] **Step 1: 替换 mock 为 API**

要点（保持现有视觉结构可微调，不必像素级保留 mock 色块）：

- `import { listPublicActivities, type PublicActivity } from '@/api/public-activities'`
- 状态：`items`、`loading`、`q`、`sort`（`'startAt' | 'publishedAt'`，默认 `'startAt'`）、`page`、`total`、`pageSize=20`
- UI：顶部搜索输入（确认后触发 reload）、排序切换（开始时间 / 发布时间）、列表卡片展示 `title`、封面 `coverUrl`（`image`）、时间、地点、`displayStatus` 文案、费用文案
- `load({ reset?: boolean })`：`reset` 时 `page=1` 并替换列表；否则追加（上拉）
- `onReachBottom` 或「加载更多」按钮：若 `items.length < total` 则 `page++` 再 load
- `goDetail(id)` → `/pages/activity/detail?id=`
- **不要**再依赖 `@/mocks/activities`（本页）
- 错误用 `uni.showToast`；`auth: false` 已由 API 封装

展示态文案：

```ts
const DISPLAY_LABEL: Record<string, string> = {
  upcoming: "未开始",
  open: "报名中",
  ended: "已结束",
};
```

费用：`feeType === 'free' || feeCents === 0` → `免费`，否则 `¥${(feeCents/100).toFixed(...)}`（与现有组织者页一致即可）。

- [ ] **Step 2: 联调检查清单（手动）**

1. API 已启动且库中有 `published` 且未结束活动  
2. 首页匿名可见列表  
3. 搜索标题生效；切换排序生效  
4. 已结束/草稿不出现在列表  

- [ ] **Step 3: Commit**

```bash
git add apps/mp/src/pages/home/index.vue
git commit -m "$(cat <<'EOF'
feat(mp): 首页对接公开活动列表、搜索与排序

EOF
)"
```

---

### Task 6: mp 活动详情（展示态 + 分享链错误态）

**Files:**
- Modify: `apps/mp/src/pages/activity/detail.vue`

- [ ] **Step 1: 接 getPublicActivity**

- `onLoad` 取 `id`，调用 `getPublicActivity`
- 成功：渲染封面、标题、`displayStatus`、时间地点、主办 `organizer.displayName`、名额上限、费用、须知 `rules`
- CTA：
  - `open` / `upcoming`：按钮可点，点击 `uni.showToast({ title: '报名即将开放', icon: 'none' })`（**不**调报名 API；若跳转 `/pages/register/index` 仅允许带 id 的占位，且 register 页仍可暂时 mock——本阶段以 toast 占位即可）
  - `ended`：按钮禁用，文案「活动已结束」
- 失败：
  - `ApiError.code === 'ACTIVITY_CANCELLED'` → 全页文案「活动已取消」
  - `ApiError.code === 'ACTIVITY_REMOVED'` → 「活动已下架」
  - 其他 404 → 「活动不存在或已下架」
  - **不渲染**活动正文卡片
- 移除对本页 `@/mocks/activities` 的依赖

- [ ] **Step 2: 手动验收分享链**

用已取消 / 已下架 / 草稿 / 已结束 published 的 id 打开详情，确认文案与是否露正文符合 ADR-0006。

- [ ] **Step 3: Commit**

```bash
git add apps/mp/src/pages/activity/detail.vue
git commit -m "$(cat <<'EOF'
feat(mp): 活动详情对接公开 API 与分享链错误态

EOF
)"
```

---

### Task 7: 文档收尾

**Files:**
- Modify: `docs/roadmap.md`（勾选 P0-3 完成项）
- Modify: `docs/adr/0006-activity-discovery-and-public-visibility.md`（状态 → Implemented）
- Modify: `docs/adr/README.md`
- Modify: `docs/superpowers/specs/2026-10-19-p0-3-discovery-and-detail-design.md`（状态 → Implemented；勾选实现计划与实现后项）

- [ ] **Step 1: 勾选 roadmap 并更新 ADR 状态**

P0-3 四项全部 `[x]`；ADR-0006 与索引改为 `Implemented`；设计规格状态改为 `Implemented`，§9 清单勾选实现计划与实现后项。

- [ ] **Step 2: 全量 API 测试**

Run: `pnpm --filter @activity/api test`  
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add docs
git commit -m "$(cat <<'EOF'
docs: P0-3 发现与详情验收勾选，ADR-0006 Implemented

EOF
)"
```

---

## Spec 覆盖自检

| Spec 要求 | Task |
| --- | --- |
| 独立 `/public/activities` | 2, 3 |
| 列表仅 published 且未结束 | 2 |
| `q` / `sort` / 分页 | 2, 3, 5 |
| 详情 published（含 ended） | 2, 6 |
| draft/cancelled/removed 无正文 | 2, 6 |
| displayStatus upcoming/open/ended | 1, 2, 5, 6 |
| 匿名可读 | 3, 4, 5 |
| DTO 裁剪（无 removeReason 等） | 2 |
| organizer.displayName ← name | 2 |
| 无报名 API / 无分类筛选 | 5, 6（占位 CTA） |
| 文档勾选 | 7 |

## 非目标（计划内不做）

分类筛选、满员、报名闭环、支付、Admin 变更、删除 `mocks/activities.ts`（其它页仍可能引用，留给后续阶段）。

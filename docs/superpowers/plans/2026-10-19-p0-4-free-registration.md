# P0-4 免费报名闭环 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地免费活动报名（创建/取消/我的报名/组织者名单）、名额并发与幂等、公开 `displayStatus=full`，并兑现活动退回/取消/下架时批量取消有效报名。

**Architecture:** 新增 `RegistrationsModule`（用户 JWT）；报名在事务内 `SELECT Activity FOR UPDATE` 后计 `confirmed` 数并 upsert；`@@unique([userId, activityId])` 保证幂等；真实 `RegistrationCancelHook` 替换 Noop；公开 mapper 计入名额计算 `full`；mp 接通报名表单、详情 CTA、我的报名取消、组织者名单。

**Tech Stack:** NestJS 11、Prisma 6、PostgreSQL、Vitest、`@activity/shared`、uni-app Vue3、pnpm workspace

**前置文档：** [ADR-0007](../../adr/0007-registration-idempotency-and-capacity.md)、[设计规格](../specs/2026-10-19-p0-4-free-registration-design.md)、ADR-0005/0006、`docs/roadmap.md` P0-4

**路由约定（本计划锁定）：**
- `POST /api/registrations` — 报名
- `POST /api/registrations/:id/cancel` — 用户取消
- `GET /api/registrations/me` — 我的报名
- `GET /api/organizer/activities/:activityId/registrations` — 组织者名单

---

## 文件结构（将创建/改造）

```text
packages/shared/src/activity.ts          # + Full、RegistrationErrorCode

apps/api/prisma/schema.prisma            # + RegistrationStatus enum、Registration model
apps/api/prisma/migrations/...           # migrate

apps/api/src/registrations/
  registrations.module.ts
  registrations.controller.ts
  registrations.service.ts
  registrations.service.spec.ts
  dto/create-registration.dto.ts
  dto/list-my-registrations.query.ts
  registration.mapper.ts
  prisma-registration-cancel.hook.ts     # 真实钩子

apps/api/src/activities/
  registration-cancel.hook.ts            # 保留接口；module 改用真实实现
  activities.module.ts                   # 导出/绑定钩子供 registrations 使用

apps/api/src/organizer-registrations/    # 或挂在 activities controller
  ...                                    # GET 名单（见 Task 5）

apps/api/src/public-activities/
  public-activity.mapper.ts              # computeDisplayStatus + confirmedCount
  public-activities.service.ts           # count confirmed

apps/mp/src/
  api/registrations.ts
  pages/register/index.vue
  pages/activity/detail.vue
  pages/mine/registrations.vue
  pages/organizer/registrations.vue      # 新建；pages.json 注册
  pages/organizer/detail.vue             # 入口链到名单
```

---

### Task 1: shared — `full` 与报名错误码

**Files:**
- Modify: `packages/shared/src/activity.ts`

- [ ] **Step 1: 启用 Full 并追加错误码**

将 `ActivityDisplayStatus` 改为：

```ts
export const ActivityDisplayStatus = {
  Upcoming: "upcoming",
  Open: "open",
  Ended: "ended",
  Full: "full",
} as const;
```

在文件末尾追加：

```ts
export const RegistrationErrorCode = {
  PaidNotSupported: "PAID_NOT_SUPPORTED",
  ActivityFull: "ACTIVITY_FULL",
  ActivityEnded: "ACTIVITY_ENDED",
  ActivityNotOpenable: "ACTIVITY_NOT_OPENABLE",
  AlreadyRegistered: "ALREADY_REGISTERED",
  NotCancellable: "REGISTRATION_NOT_CANCELLABLE",
} as const;
export type RegistrationErrorCode =
  (typeof RegistrationErrorCode)[keyof typeof RegistrationErrorCode];
```

- [ ] **Step 2: 构建**

Run: `pnpm --filter @activity/shared build`  
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/activity.ts
git commit -m "$(cat <<'EOF'
feat(shared): 启用 displayStatus.full 与报名错误码

EOF
)"
```

---

### Task 2: Prisma Registration 模型

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: migration via `prisma migrate`

- [ ] **Step 1: 在 schema 增加枚举与模型**

在 `FeeType` 后追加：

```prisma
enum RegistrationStatus {
  pending_review
  confirmed
  rejected
  cancelled
}

model Registration {
  id          String             @id @default(cuid())
  activityId  String
  userId      String
  name        String
  phone       String
  status      RegistrationStatus @default(confirmed)
  cancelledAt DateTime?
  createdAt   DateTime           @default(now())
  updatedAt   DateTime           @updatedAt
  activity    Activity           @relation(fields: [activityId], references: [id])
  user        User               @relation(fields: [userId], references: [id])

  @@unique([userId, activityId])
  @@index([activityId, status])
  @@index([userId, createdAt])
}
```

在 `User` 增加：`registrations Registration[]`  
在 `Activity` 增加：`registrations Registration[]`

- [ ] **Step 2: 迁移**

Run（在 `apps/api`，需本地 Postgres）：

```bash
pnpm --filter @activity/api exec prisma migrate dev --name add_registration
pnpm --filter @activity/api exec prisma generate
```

Expected: migrate 成功；client 含 `registration`

- [ ] **Step 3: Commit**

```bash
git add apps/api/prisma
git commit -m "$(cat <<'EOF'
feat(api): 增加 Registration 模型与迁移

EOF
)"
```

---

### Task 3: RegistrationsService — 报名 / 取消 / 我的列表（TDD）

**Files:**
- Create: `apps/api/src/registrations/registration.mapper.ts`
- Create: `apps/api/src/registrations/registrations.service.ts`
- Create: `apps/api/src/registrations/registrations.service.spec.ts`

- [ ] **Step 1: 写失败测试（核心场景）**

```ts
// apps/api/src/registrations/registrations.service.spec.ts
import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ActivityLifecycle, FeeType, RegistrationStatus } from "@prisma/client";
import { RegistrationErrorCode } from "@activity/shared";
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
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    registration: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
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
  };

  it("create confirms when capacity available", async () => {
    tx.$queryRaw.mockResolvedValue([publishedFree]); // FOR UPDATE 返回行
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
    tx.$queryRaw.mockResolvedValue([{ ...publishedFree, feeType: FeeType.paid }]);
    await expect(
      service.create("u1", { activityId: "act1", name: "张三", phone: "13800138000" }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: RegistrationErrorCode.PaidNotSupported }),
    });
  });

  it("create rejects when full", async () => {
    tx.$queryRaw.mockResolvedValue([publishedFree]);
    tx.registration.findUnique.mockResolvedValue(null);
    tx.registration.count.mockResolvedValue(2);
    await expect(
      service.create("u1", { activityId: "act1", name: "张三", phone: "13800138000" }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: RegistrationErrorCode.ActivityFull }),
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
    await expect(service.cancel("u1", "r1")).rejects.toBeInstanceOf(ForbiddenException);
  });
});
```

（实现时按实际 `$queryRaw` / `$executeRaw` 写法微调 mock；关键是覆盖 paid/full/幂等/取消/越权。）

- [ ] **Step 2: Run 确认失败**

Run: `pnpm --filter @activity/api exec vitest run src/registrations/registrations.service.spec.ts`  
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 mapper + service**

`registration.mapper.ts`：

```ts
import type { Registration } from "@prisma/client";

export type RegistrationDto = {
  id: string;
  activityId: string;
  userId: string;
  name: string;
  phone: string;
  status: string;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function toRegistrationDto(row: Registration): RegistrationDto {
  return {
    id: row.id,
    activityId: row.activityId,
    userId: row.userId,
    name: row.name,
    phone: row.phone,
    status: row.status,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
```

`registrations.service.ts` 要点：

```ts
// create(userId, { activityId, name, phone }):
//   validate name/phone (trim; phone /^1\d{10}$/)
//   return prisma.$transaction(async (tx) => {
//     const rows = await tx.$queryRaw`SELECT * FROM "Activity" WHERE id = ${activityId} FOR UPDATE`;
//     const activity = rows[0]; if (!activity) throw NotFound
//     if lifecycle !== published → Conflict + ACTIVITY_NOT_OPENABLE
//     if now >= endAt → Conflict + ACTIVITY_ENDED
//     if feeType === paid → Conflict + PAID_NOT_SUPPORTED
//     const existing = await tx.registration.findUnique({ where: { userId_activityId: { userId, activityId } } })
//     if (existing?.status === confirmed) return toDto(existing)  // 幂等 200
//     const confirmedCount = await tx.registration.count({ where: { activityId, status: confirmed } })
//     if (confirmedCount >= capacity) → Conflict + ACTIVITY_FULL
//     if (existing?.status === cancelled) update → confirmed, clear cancelledAt, set name/phone
//     else create confirmed
//   })

// cancel(userId, id):
//   load registration + activity; if !row NotFound; if row.userId !== userId Forbidden
//   if cancelled return toDto (幂等)
//   if now >= endAt → Conflict + ACTIVITY_ENDED
//   if status !== confirmed → Conflict + NOT_CANCELLABLE
//   transaction: lock activity FOR UPDATE; update cancelled + cancelledAt

// listMine(userId, { page, pageSize, status? }):
//   findMany include activity+organizer; map displayStatus via public mapper helper
```

Conflict 抛法与公开模块一致：

```ts
throw new ConflictException({
  message: "...",
  code: RegistrationErrorCode.ActivityFull,
});
```

- [ ] **Step 4: Run 测试通过**

Run: `pnpm --filter @activity/api exec vitest run src/registrations/registrations.service.spec.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/registrations
git commit -m "$(cat <<'EOF'
feat(api): RegistrationsService 报名/取消/名额与幂等

EOF
)"
```

---

### Task 4: RegistrationsController + Module

**Files:**
- Create: `apps/api/src/registrations/dto/create-registration.dto.ts`
- Create: `apps/api/src/registrations/dto/list-my-registrations.query.ts`
- Create: `apps/api/src/registrations/registrations.controller.ts`
- Create: `apps/api/src/registrations/registrations.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: DTO**

```ts
// create-registration.dto.ts
import { IsString, Matches, MaxLength, MinLength } from "class-validator";

export class CreateRegistrationDto {
  @IsString()
  activityId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(32)
  name!: string;

  @IsString()
  @Matches(/^1\d{10}$/)
  phone!: string;
}
```

`list-my-registrations.query.ts`：可选 `status`、`page`、`pageSize`（同公开列表分页校验）。

- [ ] **Step 2: Controller**

```ts
@Controller("registrations")
@UseGuards(UserJwtGuard)
export class RegistrationsController {
  constructor(private readonly service: RegistrationsService) {}

  @Post()
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateRegistrationDto) {
    return this.service.create(user.userId, dto);
  }

  @Post(":id/cancel")
  cancel(@CurrentUser() user: CurrentUserPayload, @Param("id") id: string) {
    return this.service.cancel(user.userId, id);
  }

  @Get("me")
  listMine(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ListMyRegistrationsQuery,
  ) {
    return this.service.listMine(user.userId, query);
  }
}
```

注意：Nest 路由顺序 — `Get('me')` 必须注册在 `Post(':id/cancel')` 之前，或 cancel 使用独立路径避免 `me` 被当成 id（本计划 `me` 为 Get、`cancel` 为 Post `:id/cancel`，无冲突）。

- [ ] **Step 3: Module 注册进 AppModule**

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/registrations apps/api/src/app.module.ts
git commit -m "$(cat <<'EOF'
feat(api): 暴露报名/取消/我的报名 HTTP 接口

EOF
)"
```

---

### Task 5: 组织者报名名单

**Files:**
- Modify: `apps/api/src/activities/activities.controller.ts`（或新建 thin controller）
- Modify: `apps/api/src/registrations/registrations.service.ts` — `listForOrganizer`
- Modify: `apps/api/src/registrations/registrations.service.spec.ts`
- Modify: `apps/api/src/registrations/registrations.module.ts` — 若需注入 Activities 校验 owner，可复用现有 organizer 查找

- [ ] **Step 1: 测试** — 非 owner → Forbidden；owner → 分页列表含 name/phone/status

- [ ] **Step 2: 实现**

```ts
// GET /organizer/activities/:activityId/registrations
// Guard: UserJwtGuard + PublisherGuard
// service.listForOrganizer(userId, activityId, query):
//   resolve organizer by ownerUserId; activity.organizerId must match
//   else ForbiddenException
//   return paginated registrations (all statuses or default confirmed+cancelled)
```

将路由加在 `ActivitiesController`（已有 `organizer/activities` 前缀）更省事：

```ts
@Get(":id/registrations")
listRegistrations(
  @CurrentUser() user: CurrentUserPayload,
  @Param("id") id: string,
  @Query() query: ListMyRegistrationsQuery,
) {
  return this.registrations.listForOrganizer(user.userId, id, query);
}
```

需在 `ActivitiesModule` import `RegistrationsModule`（export service）。

- [ ] **Step 3: 测试通过并 Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(api): 组织者可分页查看活动报名名单

EOF
)"
```

---

### Task 6: 真实 RegistrationCancelHook

**Files:**
- Create: `apps/api/src/registrations/prisma-registration-cancel.hook.ts`
- Modify: `apps/api/src/activities/activities.module.ts`
- Modify: `apps/api/src/admin-activities/admin-activities.module.ts`（若独立提供 hook）
- Modify: 相关 spec（仍 mock hook 即可；另加 hook 单测）

- [ ] **Step 1: 实现**

```ts
@Injectable()
export class PrismaRegistrationCancelHook implements RegistrationCancelHook {
  constructor(private readonly prisma: PrismaService) {}

  async cancelAllForActivity(activityId: string): Promise<void> {
    await this.prisma.registration.updateMany({
      where: { activityId, status: RegistrationStatus.confirmed },
      data: { status: RegistrationStatus.cancelled, cancelledAt: new Date() },
    });
  }
}
```

- [ ] **Step 2: 替换 Noop 绑定**

`ActivitiesModule` / `AdminActivitiesModule`：

```ts
{ provide: REGISTRATION_CANCEL_HOOK, useClass: PrismaRegistrationCancelHook }
```

确保 `PrismaModule` 可注入；钩子类可放在 `RegistrationsModule` 并 export，或直接在 activities 模块 providers 注册（避免循环依赖：推荐 hook 放 `registrations` 或独立 `registration-hooks` 小文件且仅依赖 Prisma）。

- [ ] **Step 3: 单测 updateMany 被调用；Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(api): 退回/取消/下架时批量取消有效报名

EOF
)"
```

---

### Task 7: 公开 `displayStatus=full`

**Files:**
- Modify: `apps/api/src/public-activities/public-activity.mapper.ts`
- Modify: `apps/api/src/public-activities/public-activities.service.ts`
- Modify: `apps/api/src/public-activities/public-activities.service.spec.ts`

- [ ] **Step 1: 改 computeDisplayStatus**

```ts
export function computeDisplayStatus(
  startAt: Date | null,
  endAt: Date | null,
  confirmedCount: number,
  capacity: number,
  now = new Date(),
): DisplayStatus {
  if (endAt && now >= endAt) return ActivityDisplayStatus.Ended;
  if (confirmedCount >= capacity) return ActivityDisplayStatus.Full;
  if (startAt && now < startAt) return ActivityDisplayStatus.Upcoming;
  return ActivityDisplayStatus.Open;
}
```

`toPublicDto` 增加 `confirmedCount` 参数（或 opts）。

- [ ] **Step 2: list/getById 前 count confirmed**

```ts
const confirmedCount = await this.prisma.registration.count({
  where: { activityId: row.id, status: "confirmed" },
});
```

列表可用 `groupBy` 或对当前页 ids `findMany`+内存聚合，避免 N+1 也可接受 P0 对每条 count（pageSize≤50）。

- [ ] **Step 3: 单测满员 → full；Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(api): 公开展示态支持满员 full

EOF
)"
```

---

### Task 8: mp API 客户端

**Files:**
- Create: `apps/mp/src/api/registrations.ts`
- Modify: `apps/mp/src/api/public-activities.ts` — `displayStatus` 联合类型加 `"full"`

- [ ] **Step 1: 客户端**

```ts
import { request } from "@/utils/request";

export type Registration = {
  id: string;
  activityId: string;
  userId: string;
  name: string;
  phone: string;
  status: string;
  cancelledAt?: string | null;
  createdAt: string;
  activity?: {
    id: string;
    title: string;
    coverUrl: string;
    startAt?: string | null;
    place: string;
    displayStatus?: string;
  };
};

export function createRegistration(body: {
  activityId: string;
  name: string;
  phone: string;
}) {
  return request<Registration>("/registrations", { method: "POST", data: body });
}

export function cancelRegistration(id: string) {
  return request<Registration>(`/registrations/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
  });
}

export function listMyRegistrations(params: {
  page?: number;
  pageSize?: number;
  status?: string;
} = {}) {
  // 复用 toQuery 模式（无 URLSearchParams）
  return request<{ items: Registration[]; total: number; page: number; pageSize: number }>(
    `/registrations/me${toQuery(params)}`,
  );
}

export function listOrganizerRegistrations(
  activityId: string,
  params: { page?: number; pageSize?: number } = {},
) {
  return request<{ items: Registration[]; total: number; page: number; pageSize: number }>(
    `/organizer/activities/${encodeURIComponent(activityId)}/registrations${toQuery(params)}`,
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/mp/src/api
git commit -m "$(cat <<'EOF'
feat(mp): 报名相关 API 客户端

EOF
)"
```

---

### Task 9: mp 报名表单 + 详情 CTA

**Files:**
- Modify: `apps/mp/src/pages/register/index.vue`
- Modify: `apps/mp/src/pages/activity/detail.vue`

- [ ] **Step 1: detail CTA**

```ts
const canRegister = computed(() => {
  const a = activity.value;
  if (!a) return false;
  if (a.feeType === "paid") return false;
  return a.displayStatus === "open" || a.displayStatus === "upcoming";
});

const ctaText = computed(() => {
  const a = activity.value;
  if (!a) return "立即报名";
  if (a.feeType === "paid") return "暂不支持线上报名";
  if (a.displayStatus === "ended") return "活动已结束";
  if (a.displayStatus === "full") return "名额已满";
  return "立即报名";
});

function onCta() {
  if (!activity.value || !canRegister.value) return;
  uni.navigateTo({
    url: `/pages/register/index?activityId=${encodeURIComponent(activity.value.id)}`,
  });
}
```

DISPLAY_LABEL 增加 `full: "已满员"`。

- [ ] **Step 2: register/index.vue 接真实 API**

- `onLoad` 读 `activityId`；未登录则跳转现有登录流（与项目一致，如 `auth` util）。  
- 提交调用 `createRegistration`；成功 toast 后 `switchTab` 到我的报名或 `navigateBack`。  
- 处理 `ApiError.code`：`ACTIVITY_FULL` / `PAID_NOT_SUPPORTED` / `ALREADY_REGISTERED` 等文案。  
- 移除「仅 Mock」提示与本地 mock 写入。

- [ ] **Step 3: 手测或 H5 冒烟；Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(mp): 详情报名 CTA 与真实报名表单

EOF
)"
```

---

### Task 10: mp 我的报名 + 取消

**Files:**
- Modify: `apps/mp/src/pages/mine/registrations.vue`

- [ ] **Step 1: 拉取 `listMyRegistrations`；展示 status；未结束且 confirmed 显示「取消报名」按钮**

```ts
async function onCancel(item: Registration) {
  const res = await uni.showModal({ title: "取消报名", content: "确定取消该活动报名？" });
  if (!res.confirm) return;
  try {
    await cancelRegistration(item.id);
    uni.showToast({ title: "已取消", icon: "none" });
    await load({ reset: true });
  } catch (e) {
    uni.showToast({ title: errMessage(e), icon: "none" });
  }
}
```

- 去掉 mock / 标题映射到真实 id 的临时逻辑。  
- 点击卡片仍可进公开详情（`item.activityId`）。

- [ ] **Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(mp): 我的报名接服务端并支持取消

EOF
)"
```

---

### Task 11: mp 组织者报名名单页

**Files:**
- Create: `apps/mp/src/pages/organizer/registrations.vue`
- Modify: `apps/mp/src/pages.json` — 注册页面
- Modify: `apps/mp/src/pages/organizer/detail.vue` — 入口按钮「报名名单」

- [ ] **Step 1: 名单页**

- Query: `activityId`  
- `listOrganizerRegistrations` 分页展示 name/phone/status/时间  
- 越权/错误 toast

- [ ] **Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(mp): 组织者活动报名名单页

EOF
)"
```

---

### Task 12: 文档收尾

**Files:**
- Modify: `docs/adr/0007-registration-idempotency-and-capacity.md` → `Implemented`
- Modify: `docs/adr/README.md` 状态
- Modify: `docs/superpowers/specs/2026-10-19-p0-4-free-registration-design.md` → Implemented；勾选实现计划
- Modify: `docs/roadmap.md` P0-4 checklist 全部 `[x]`

- [x] **Step 1: 更新文档并 Commit**

```bash
git commit -m "$(cat <<'EOF'
docs: P0-4 报名闭环验收勾选，ADR-0007 Implemented

EOF
)"
```

---

## 规格覆盖自检

| 规格项 | Task |
| --- | --- |
| 仅 free 可报 / paid 拒绝 | 3, 9 |
| confirmed 直接成功 | 3 |
| 姓名+手机+登录 | 3, 4, 9 |
| 幂等 unique | 2, 3 |
| FOR UPDATE 名额 | 3 |
| 用户取消 | 3, 4, 10 |
| 系统批量取消钩子 | 6 |
| 我的报名 / 组织者名单 | 3–5, 10–11 |
| displayStatus full | 1, 7, 9 |
| AT-REG 并发/越权 | 3, 5 |

## 非目标（计划不实现）

支付、候补、审核制报名、Redis、Admin 报名审核 UI。

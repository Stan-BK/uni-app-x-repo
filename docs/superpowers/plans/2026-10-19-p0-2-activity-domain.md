# P0-2 活动域 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地 Activity 模型与组织者草稿/发布/退回草稿/取消、运营下架 API，并接通 mp「我的活动」与 Admin 最小下架页，使 AT-ACT-01～03 与 ADR-0005 修订路径可验收。

**Architecture:** `apps/api` 为活动权威；单一 `lifecycle`（无审核态）；组织者路由挂 `UserJwtGuard` + `PublisherGuard`；运营下架写 `AuditLog`；报名取消通过可注入钩子（P0-4 前为空实现）；`feeType=paid` 可写但不接支付。

**Tech Stack:** NestJS 11、Prisma 6、PostgreSQL、Vitest、`@activity/shared`、uni-app Vue3、Vue3 Admin、pnpm workspace

**前置文档：** [ADR-0005](../../adr/0005-activity-lifecycle-and-model.md)、[设计规格](../specs/2026-10-19-p0-2-activity-domain-design.md)、ADR-0003/0004、`docs/roadmap.md` P0-2

---

## 文件结构（将创建/改造）

```text
packages/shared/src/
  activity.ts            # Lifecycle / FeeType（从 index 拆出）
  index.ts               # 移除 ActivityReviewStatus 导出

apps/api/
  prisma/schema.prisma   # Activity + enums
  src/
    activities/
      activities.module.ts
      activities.controller.ts      # /organizer/activities
      activities.service.ts
      activities.service.spec.ts
      dto/*.ts
      registration-cancel.hook.ts   # 空钩子接口
    admin-activities/
      admin-activities.module.ts
      admin-activities.controller.ts
      admin-activities.service.ts
      admin-activities.service.spec.ts
      dto/remove-activity.dto.ts
    app.module.ts

apps/mp/src/
  api/activities.ts
  pages/organizer/create.vue   # 接 API
  pages/organizer/list.vue
  pages/organizer/edit.vue     # 可选：与 create 复用则改 create + query

apps/admin/src/
  api/admin.ts                 # listActivities / removeActivity
  views/Activities.vue
  router.ts
  App.vue                      # 导航链到活动页（若已有 nav）
```

---

### Task 1: shared 活动枚举（废弃审核态）

**Files:**
- Create: `packages/shared/src/activity.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: 写入 activity.ts 并精简 index**

将原 `index.ts` 内联的活动/报名枚举迁出；**不要**再导出 `ActivityReviewStatus`。

```ts
// packages/shared/src/activity.ts
export const ActivityLifecycleStatus = {
  Draft: "draft",
  Published: "published",
  Cancelled: "cancelled",
  Removed: "removed",
  Ended: "ended",
} as const;
export type ActivityLifecycleStatus =
  (typeof ActivityLifecycleStatus)[keyof typeof ActivityLifecycleStatus];

export const FeeType = {
  Free: "free",
  Paid: "paid",
} as const;
export type FeeType = (typeof FeeType)[keyof typeof FeeType];

export const RegistrationStatus = {
  PendingReview: "pending_review",
  Confirmed: "confirmed",
  Rejected: "rejected",
  Cancelled: "cancelled",
} as const;
export type RegistrationStatus =
  (typeof RegistrationStatus)[keyof typeof RegistrationStatus];
```

```ts
// packages/shared/src/index.ts
/** Shared enums and constants for mp / api / admin. */
export * from "./identity";
export * from "./activity";
```

- [ ] **Step 2: 类型检查**

Run: `pnpm --filter @activity/shared type-check`  
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/shared
git commit -m "$(cat <<'EOF'
feat(shared): 按 ADR-0005 拆分活动枚举并移除审核态导出

EOF
)"
```

---

### Task 2: Prisma Activity 模型与迁移

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/prisma/schema.prisma` 中 `Organizer` 增加 `activities Activity[]`

- [ ] **Step 1: 追加 enum 与 model**

在 `schema.prisma` 的 enum 区增加：

```prisma
enum ActivityLifecycle {
  draft
  published
  cancelled
  removed
  ended
}

enum FeeType {
  free
  paid
}
```

在 `Organizer` model 内增加：

```prisma
  activities Activity[]
```

追加：

```prisma
model Activity {
  id              String            @id @default(cuid())
  organizerId     String
  title           String
  coverUrl        String            @default("")
  category        String            @default("")
  description     String?
  rules           String            @default("")
  startAt         DateTime?
  endAt           DateTime?
  place           String            @default("")
  capacity        Int               @default(1)
  feeType         FeeType           @default(free)
  feeCents        Int               @default(0)
  feeNote         String?
  lifecycle       ActivityLifecycle @default(draft)
  cancelReason    String?
  removeReason    String?
  platformFeeBps  Int?
  publishedAt     DateTime?
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt
  organizer       Organizer         @relation(fields: [organizerId], references: [id])

  @@index([organizerId, lifecycle])
  @@index([lifecycle, startAt])
}
```

- [ ] **Step 2: 迁移**

Run: `pnpm --filter @activity/api prisma:migrate`  
（交互名：`add_activity`）  
Expected: migration 成功；`prisma generate` 成功

若 CI/非交互：

```bash
cd apps/api && pnpm exec prisma migrate dev --name add_activity
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/prisma
git commit -m "$(cat <<'EOF'
feat(api): 增加 Activity 模型与 lifecycle/fee 枚举

EOF
)"
```

---

### Task 3: 报名取消钩子（空实现）

**Files:**
- Create: `apps/api/src/activities/registration-cancel.hook.ts`

- [ ] **Step 1: 定义接口与 Noop 实现**

```ts
// apps/api/src/activities/registration-cancel.hook.ts
import { Injectable } from "@nestjs/common";

export const REGISTRATION_CANCEL_HOOK = Symbol("REGISTRATION_CANCEL_HOOK");

export interface RegistrationCancelHook {
  /** 取消某活动下全部有效报名；P0-4 前可为空操作 */
  cancelAllForActivity(activityId: string): Promise<void>;
}

@Injectable()
export class NoopRegistrationCancelHook implements RegistrationCancelHook {
  async cancelAllForActivity(_activityId: string): Promise<void> {
    // P0-4 接入真实报名取消
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/activities/registration-cancel.hook.ts
git commit -m "$(cat <<'EOF'
feat(api): 预留活动报名取消钩子（noop）

EOF
)"
```

---

### Task 4: ActivitiesService — 创建草稿与发布校验（TDD）

**Files:**
- Create: `apps/api/src/activities/dto/upsert-activity.dto.ts`
- Create: `apps/api/src/activities/activities.service.ts`
- Create: `apps/api/src/activities/activities.service.spec.ts`

- [ ] **Step 1: 写失败测试**

```ts
// apps/api/src/activities/activities.service.spec.ts
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ActivityLifecycle, FeeType, PublishStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { ActivitiesService } from "./activities.service";
import {
  NoopRegistrationCancelHook,
  REGISTRATION_CANCEL_HOOK,
} from "./registration-cancel.hook";

describe("ActivitiesService", () => {
  let service: ActivitiesService;
  const prisma = {
    organizer: { findUnique: vi.fn() },
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
    prisma.organizer.findUnique.mockResolvedValue({
      id: "org-1",
      publishStatus: PublishStatus.approved,
    });
    const row = {
      id: "act-1",
      organizerId: "org-1",
      title: "徒步",
      lifecycle: ActivityLifecycle.draft,
    };
    prisma.activity.create.mockResolvedValue(row);

    const result = await service.create("user-1", { title: "徒步" });
    expect(prisma.activity.create).toHaveBeenCalled();
    expect(result.lifecycle).toBe(ActivityLifecycle.draft);
  });

  it("publish rejects when endAt <= startAt", async () => {
    prisma.organizer.findUnique.mockResolvedValue({
      id: "org-1",
      publishStatus: PublishStatus.approved,
    });
    prisma.activity.findFirst.mockResolvedValue({
      id: "act-1",
      organizerId: "org-1",
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
});
```

- [ ] **Step 2: Run 确认失败**

Run: `pnpm --filter @activity/api test -- src/activities/activities.service.spec.ts`  
Expected: FAIL（module not found / ActivitiesService 不存在）

- [ ] **Step 3: DTO + Service 最小实现**

```ts
// apps/api/src/activities/dto/upsert-activity.dto.ts
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { FeeType } from "@prisma/client";

export class UpsertActivityDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80)
  title?: string;

  @IsOptional() @IsString() @MaxLength(500)
  coverUrl?: string;

  @IsOptional() @IsString() @MaxLength(40)
  category?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  rules?: string;

  @IsOptional() @IsISO8601()
  startAt?: string;

  @IsOptional() @IsISO8601()
  endAt?: string;

  @IsOptional() @IsString() @MaxLength(200)
  place?: string;

  @IsOptional() @IsInt() @Min(1)
  capacity?: number;

  @IsOptional() @IsEnum(FeeType)
  feeType?: FeeType;

  @IsOptional() @IsInt() @Min(0)
  feeCents?: number;

  @IsOptional() @IsString() @MaxLength(500)
  feeNote?: string;

  @IsOptional() @IsBoolean()
  publish?: boolean;
}
```

```ts
// apps/api/src/activities/activities.service.ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ActivityLifecycle,
  FeeType,
  PublishStatus,
  type Activity,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { UpsertActivityDto } from "./dto/upsert-activity.dto";
import {
  REGISTRATION_CANCEL_HOOK,
  type RegistrationCancelHook,
} from "./registration-cancel.hook";

@Injectable()
export class ActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REGISTRATION_CANCEL_HOOK)
    private readonly registrationCancel: RegistrationCancelHook,
  ) {}

  private async requireApprovedOrganizer(userId: string) {
    const organizer = await this.prisma.organizer.findUnique({
      where: { ownerUserId: userId },
    });
    if (!organizer || organizer.publishStatus !== PublishStatus.approved) {
      throw new ForbiddenException("Publisher approval required");
    }
    return organizer;
  }

  private async requireOwnedActivity(userId: string, activityId: string) {
    const organizer = await this.requireApprovedOrganizer(userId);
    const activity = await this.prisma.activity.findFirst({
      where: { id: activityId, organizerId: organizer.id },
    });
    if (!activity) throw new NotFoundException("Activity not found");
    return { organizer, activity };
  }

  private assertPublishable(a: Activity) {
    const missing: string[] = [];
    if (!a.title?.trim()) missing.push("title");
    if (!a.coverUrl?.trim()) missing.push("coverUrl");
    if (!a.category?.trim()) missing.push("category");
    if (!a.rules?.trim()) missing.push("rules");
    if (!a.place?.trim()) missing.push("place");
    if (!a.startAt) missing.push("startAt");
    if (!a.endAt) missing.push("endAt");
    if (!a.capacity || a.capacity < 1) missing.push("capacity");
    if (missing.length) {
      throw new BadRequestException({
        message: "Missing required fields for publish",
        fields: missing,
      });
    }
    if (a.endAt! <= a.startAt!) {
      throw new BadRequestException("endAt must be after startAt");
    }
    if (a.feeType === FeeType.free && a.feeCents !== 0) {
      throw new BadRequestException("feeCents must be 0 when feeType is free");
    }
    if (a.feeType === FeeType.paid && a.feeCents <= 0) {
      throw new BadRequestException("feeCents must be > 0 when feeType is paid");
    }
  }

  private mapDto(dto: UpsertActivityDto) {
    return {
      ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
      ...(dto.coverUrl !== undefined ? { coverUrl: dto.coverUrl.trim() } : {}),
      ...(dto.category !== undefined ? { category: dto.category.trim() } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.rules !== undefined ? { rules: dto.rules } : {}),
      ...(dto.startAt !== undefined ? { startAt: new Date(dto.startAt) } : {}),
      ...(dto.endAt !== undefined ? { endAt: new Date(dto.endAt) } : {}),
      ...(dto.place !== undefined ? { place: dto.place.trim() } : {}),
      ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
      ...(dto.feeType !== undefined ? { feeType: dto.feeType } : {}),
      ...(dto.feeCents !== undefined ? { feeCents: dto.feeCents } : {}),
      ...(dto.feeNote !== undefined ? { feeNote: dto.feeNote } : {}),
    };
  }

  async create(userId: string, dto: UpsertActivityDto): Promise<Activity> {
    const organizer = await this.requireApprovedOrganizer(userId);
    if (!dto.title?.trim()) {
      throw new BadRequestException("title is required");
    }
    const data = {
      organizerId: organizer.id,
      title: dto.title.trim(),
      ...this.mapDto({ ...dto, title: undefined }),
      lifecycle: ActivityLifecycle.draft,
    };
    const created = await this.prisma.activity.create({ data });
    if (dto.publish) {
      return this.publish(userId, created.id);
    }
    return created;
  }

  async update(
    userId: string,
    id: string,
    dto: UpsertActivityDto,
  ): Promise<Activity> {
    const { activity } = await this.requireOwnedActivity(userId, id);
    if (
      activity.lifecycle === ActivityLifecycle.cancelled ||
      activity.lifecycle === ActivityLifecycle.removed ||
      activity.lifecycle === ActivityLifecycle.ended
    ) {
      throw new ConflictException("Cannot edit activity in terminal state");
    }
    if (activity.lifecycle === ActivityLifecycle.published) {
      // 允许改内容但仍保持 published；或按产品仅允许草稿编辑——ADR：可编辑非终态
    }
    const updated = await this.prisma.activity.update({
      where: { id },
      data: this.mapDto(dto),
    });
    if (dto.publish) {
      return this.publish(userId, id);
    }
    return updated;
  }

  async publish(userId: string, id: string): Promise<Activity> {
    const { activity } = await this.requireOwnedActivity(userId, id);
    if (activity.lifecycle !== ActivityLifecycle.draft) {
      throw new ConflictException("Only draft can be published");
    }
    this.assertPublishable(activity);
    return this.prisma.activity.update({
      where: { id },
      data: {
        lifecycle: ActivityLifecycle.published,
        publishedAt: new Date(),
      },
    });
  }

  async unpublish(userId: string, id: string): Promise<Activity> {
    const { activity } = await this.requireOwnedActivity(userId, id);
    if (activity.lifecycle !== ActivityLifecycle.published) {
      throw new ConflictException("Only published can unpublish to draft");
    }
    await this.registrationCancel.cancelAllForActivity(id);
    return this.prisma.activity.update({
      where: { id },
      data: { lifecycle: ActivityLifecycle.draft },
    });
  }

  async cancel(
    userId: string,
    id: string,
    reason?: string,
  ): Promise<Activity> {
    const { activity } = await this.requireOwnedActivity(userId, id);
    if (
      activity.lifecycle !== ActivityLifecycle.draft &&
      activity.lifecycle !== ActivityLifecycle.published
    ) {
      throw new ConflictException("Cannot cancel from current state");
    }
    await this.registrationCancel.cancelAllForActivity(id);
    return this.prisma.activity.update({
      where: { id },
      data: {
        lifecycle: ActivityLifecycle.cancelled,
        cancelReason: reason ?? null,
      },
    });
  }

  async listMine(
    userId: string,
    opts: { lifecycle?: ActivityLifecycle; skip?: number; take?: number },
  ) {
    const organizer = await this.requireApprovedOrganizer(userId);
    const where = {
      organizerId: organizer.id,
      ...(opts.lifecycle ? { lifecycle: opts.lifecycle } : {}),
    };
    const take = Math.min(opts.take ?? 20, 50);
    const skip = opts.skip ?? 0;
    const [items, total] = await Promise.all([
      this.prisma.activity.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take,
      }),
      this.prisma.activity.count({ where }),
    ]);
    return { items, total, skip, take };
  }

  async getMine(userId: string, id: string): Promise<Activity> {
    const { activity } = await this.requireOwnedActivity(userId, id);
    return activity;
  }
}
```

- [ ] **Step 4: 补全 unpublish/cancel 测试并跑通**

在 spec 中增加：

```ts
  it("unpublish calls cancel hook and sets draft", async () => {
    prisma.organizer.findUnique.mockResolvedValue({
      id: "org-1",
      publishStatus: PublishStatus.approved,
    });
    prisma.activity.findFirst.mockResolvedValue({
      id: "act-1",
      organizerId: "org-1",
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
```

Run: `pnpm --filter @activity/api test -- src/activities/activities.service.spec.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/activities
git commit -m "$(cat <<'EOF'
feat(api): ActivitiesService 草稿/发布/退回/取消

EOF
)"
```

---

### Task 5: 组织者 ActivitiesController + Module

**Files:**
- Create: `apps/api/src/activities/activities.controller.ts`
- Create: `apps/api/src/activities/activities.module.ts`
- Create: `apps/api/src/activities/dto/cancel-activity.dto.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/common/guards/publisher.guard.ts`（注释改为「用于活动发布路由」即可）

- [ ] **Step 1: Controller + Module**

```ts
// apps/api/src/activities/dto/cancel-activity.dto.ts
import { IsOptional, IsString, MaxLength } from "class-validator";

export class CancelActivityDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
```

```ts
// apps/api/src/activities/activities.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ActivityLifecycle } from "@prisma/client";
import {
  CurrentUser,
  type CurrentUserPayload,
} from "../common/decorators/current-user.decorator";
import { PublisherGuard } from "../common/guards/publisher.guard";
import { UserJwtGuard } from "../common/guards/user-jwt.guard";
import { ActivitiesService } from "./activities.service";
import { CancelActivityDto } from "./dto/cancel-activity.dto";
import { UpsertActivityDto } from "./dto/upsert-activity.dto";

@Controller("organizer/activities")
@UseGuards(UserJwtGuard, PublisherGuard)
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Post()
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpsertActivityDto,
  ) {
    return this.activitiesService.create(user.userId, dto);
  }

  @Get()
  list(
    @CurrentUser() user: CurrentUserPayload,
    @Query("lifecycle") lifecycle?: ActivityLifecycle,
    @Query("skip") skip?: string,
    @Query("take") take?: string,
  ) {
    return this.activitiesService.listMine(user.userId, {
      lifecycle,
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
    });
  }

  @Get(":id")
  get(
    @CurrentUser() user: CurrentUserPayload,
    @Param("id") id: string,
  ) {
    return this.activitiesService.getMine(user.userId, id);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: CurrentUserPayload,
    @Param("id") id: string,
    @Body() dto: UpsertActivityDto,
  ) {
    return this.activitiesService.update(user.userId, id, dto);
  }

  @Post(":id/publish")
  publish(
    @CurrentUser() user: CurrentUserPayload,
    @Param("id") id: string,
  ) {
    return this.activitiesService.publish(user.userId, id);
  }

  @Post(":id/unpublish")
  unpublish(
    @CurrentUser() user: CurrentUserPayload,
    @Param("id") id: string,
  ) {
    return this.activitiesService.unpublish(user.userId, id);
  }

  @Post(":id/cancel")
  cancel(
    @CurrentUser() user: CurrentUserPayload,
    @Param("id") id: string,
    @Body() dto: CancelActivityDto,
  ) {
    return this.activitiesService.cancel(user.userId, id, dto.reason);
  }
}
```

```ts
// apps/api/src/activities/activities.module.ts
import { Module } from "@nestjs/common";
import { ActivitiesController } from "./activities.controller";
import { ActivitiesService } from "./activities.service";
import {
  NoopRegistrationCancelHook,
  REGISTRATION_CANCEL_HOOK,
} from "./registration-cancel.hook";

@Module({
  controllers: [ActivitiesController],
  providers: [
    ActivitiesService,
    { provide: REGISTRATION_CANCEL_HOOK, useClass: NoopRegistrationCancelHook },
  ],
  exports: [ActivitiesService, REGISTRATION_CANCEL_HOOK],
})
export class ActivitiesModule {}
```

`app.module.ts` imports 增加 `ActivitiesModule`。

确保 `PublisherGuard` 与 `UserJwtGuard` 已在某处 `providers` 可注入（与现有 organizers 模块同样方式：若 Guard 依赖 Prisma，需在 module providers 注册或标 `@Injectable` 且 PrismaModule `@Global()`——按仓库现有模式复制 `OrganizersModule`）。

查看并对齐：

```ts
// 若 OrganizersModule 未显式提供 UserJwtGuard，则 AuthModule export JwtStrategy；
// ActivitiesModule 同样依赖全局 PrismaModule + Auth 的 JWT 策略。
```

- [ ] **Step 2: 启动 API 冒烟**

Run: 保证 `pnpm --filter @activity/api start:dev` 无报错；用已有 weixin bypass 登录后：

```bash
# 示例（token 替换）
curl -s -X POST http://localhost:3000/organizer/activities \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"测试活动"}'
```

Expected: 201/200 + `lifecycle: draft`；无发布权用户 403

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/activities apps/api/src/app.module.ts
git commit -m "$(cat <<'EOF'
feat(api): 组织者活动 REST 接口

EOF
)"
```

---

### Task 6: Admin 下架 API（TDD）

**Files:**
- Create: `apps/api/src/admin-activities/*`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: 失败测试**

```ts
// apps/api/src/admin-activities/admin-activities.service.spec.ts
import { ConflictException, NotFoundException } from "@nestjs/common";
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
  const cancelHook = { cancelAllForActivity: vi.fn() };

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
    expect(cancelHook.cancelAllForActivity).toHaveBeenCalledWith("act-1");
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
```

- [ ] **Step 2: Run 确认失败**

Run: `pnpm --filter @activity/api test -- src/admin-activities/admin-activities.service.spec.ts`  
Expected: FAIL

- [ ] **Step 3: 实现 Service / Controller / Module**

```ts
// apps/api/src/admin-activities/dto/remove-activity.dto.ts
import { IsString, MinLength, MaxLength } from "class-validator";

export class RemoveActivityDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}
```

```ts
// apps/api/src/admin-activities/admin-activities.service.ts
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ActivityLifecycle, type Activity } from "@prisma/client";
import {
  REGISTRATION_CANCEL_HOOK,
  type RegistrationCancelHook,
} from "../activities/registration-cancel.hook";
import { PrismaService } from "../prisma/prisma.service";
import type { RemoveActivityDto } from "./dto/remove-activity.dto";

@Injectable()
export class AdminActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REGISTRATION_CANCEL_HOOK)
    private readonly registrationCancel: RegistrationCancelHook,
  ) {}

  list(lifecycle?: ActivityLifecycle) {
    return this.prisma.activity.findMany({
      where: lifecycle ? { lifecycle } : undefined,
      orderBy: { updatedAt: "desc" },
      take: 100,
      include: { organizer: { select: { id: true, name: true } } },
    });
  }

  async remove(
    id: string,
    adminId: string,
    dto: RemoveActivityDto,
  ): Promise<Activity> {
    const activity = await this.prisma.activity.findUnique({ where: { id } });
    if (!activity) throw new NotFoundException("Activity not found");
    if (activity.lifecycle !== ActivityLifecycle.published) {
      throw new ConflictException("Only published activities can be removed");
    }
    await this.registrationCancel.cancelAllForActivity(id);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.activity.update({
        where: { id },
        data: {
          lifecycle: ActivityLifecycle.removed,
          removeReason: dto.reason,
        },
      });
      await tx.auditLog.create({
        data: {
          actorType: "admin",
          actorId: adminId,
          action: "remove",
          targetType: "activity",
          targetId: id,
          reason: dto.reason,
        },
      });
      return updated;
    });
  }
}
```

```ts
// apps/api/src/admin-activities/admin-activities.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ActivityLifecycle, AdminRole } from "@prisma/client";
import {
  CurrentAdmin,
  type CurrentAdminPayload,
} from "../common/decorators/current-admin.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { AdminJwtGuard } from "../common/guards/admin-jwt.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { AdminActivitiesService } from "./admin-activities.service";
import { RemoveActivityDto } from "./dto/remove-activity.dto";

@Controller("admin/activities")
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles(AdminRole.operator, AdminRole.admin)
export class AdminActivitiesController {
  constructor(private readonly adminActivitiesService: AdminActivitiesService) {}

  @Get()
  list(@Query("lifecycle") lifecycle?: ActivityLifecycle) {
    return this.adminActivitiesService.list(lifecycle);
  }

  @Post(":id/remove")
  remove(
    @Param("id") id: string,
    @CurrentAdmin() admin: CurrentAdminPayload,
    @Body() dto: RemoveActivityDto,
  ) {
    return this.adminActivitiesService.remove(id, admin.adminId, dto);
  }
}
```

```ts
// apps/api/src/admin-activities/admin-activities.module.ts
import { Module } from "@nestjs/common";
import { ActivitiesModule } from "../activities/activities.module";
import { AdminActivitiesController } from "./admin-activities.controller";
import { AdminActivitiesService } from "./admin-activities.service";

@Module({
  imports: [ActivitiesModule],
  controllers: [AdminActivitiesController],
  providers: [AdminActivitiesService],
})
export class AdminActivitiesModule {}
```

`app.module.ts` 增加 `AdminActivitiesModule`。

- [ ] **Step 4: 测试 PASS**

Run: `pnpm --filter @activity/api test`  
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/admin-activities apps/api/src/app.module.ts
git commit -m "$(cat <<'EOF'
feat(api): Admin 活动列表与下架

EOF
)"
```

---

### Task 7: mp 组织者活动 API 与页面

**Files:**
- Create: `apps/mp/src/api/activities.ts`
- Modify: `apps/mp/src/pages/organizer/create.vue`
- Modify: `apps/mp/src/pages/organizer/list.vue`
- Modify: `apps/mp/src/pages.json`（若增加 edit 页）
- Read: `apps/mp/src/utils/request.ts`（复用）

- [ ] **Step 1: API 封装**

```ts
// apps/mp/src/api/activities.ts
import { request } from "@/utils/request";

export type Activity = {
  id: string;
  title: string;
  coverUrl: string;
  category: string;
  description?: string | null;
  rules: string;
  startAt?: string | null;
  endAt?: string | null;
  place: string;
  capacity: number;
  feeType: "free" | "paid";
  feeCents: number;
  feeNote?: string | null;
  lifecycle: "draft" | "published" | "cancelled" | "removed" | "ended";
  cancelReason?: string | null;
  removeReason?: string | null;
};

export type UpsertBody = Partial<{
  title: string;
  coverUrl: string;
  category: string;
  description: string;
  rules: string;
  startAt: string;
  endAt: string;
  place: string;
  capacity: number;
  feeType: "free" | "paid";
  feeCents: number;
  feeNote: string;
  publish: boolean;
}>;

export function createActivity(body: UpsertBody) {
  return request<Activity>("/organizer/activities", {
    method: "POST",
    data: body,
  });
}

export function listMyActivities(lifecycle?: string) {
  const q = lifecycle ? `?lifecycle=${lifecycle}` : "";
  return request<{ items: Activity[]; total: number }>(
    `/organizer/activities${q}`,
  );
}

export function updateActivity(id: string, body: UpsertBody) {
  return request<Activity>(`/organizer/activities/${id}`, {
    method: "PATCH",
    data: body,
  });
}

export function publishActivity(id: string) {
  return request<Activity>(`/organizer/activities/${id}/publish`, {
    method: "POST",
  });
}

export function unpublishActivity(id: string) {
  return request<Activity>(`/organizer/activities/${id}/unpublish`, {
    method: "POST",
  });
}

export function cancelActivity(id: string, reason?: string) {
  return request<Activity>(`/organizer/activities/${id}/cancel`, {
    method: "POST",
    data: { reason },
  });
}
```

若 `request` 的参数名是 `body` 而非 `data`，以 `utils/request.ts` 实际签名为准。

- [ ] **Step 2: 改造 create.vue**

表单字段：title、coverUrl（可先填占位 URL）、category、place、startAt/endAt（字符串）、capacity、rules、feeType/feeCents。  
按钮：「保存草稿」→ `createActivity` / `updateActivity`；「发布」→ 带 `publish:true` 或再调 `publishActivity`。  
无发布权提示保持；去掉纯本地 storage 草稿（或迁移成功后再清）。

- [ ] **Step 3: 改造 list.vue**

`onShow` 调 `listMyActivities()`；展示 title + lifecycle；操作：发布（draft）、退回草稿、取消（published 显示二选一）；点击进编辑（可用 `create` 页 `?id=`）。

- [ ] **Step 4: 微信开发者工具 / HBuilder 联调**

Expected: 已批准组织者可创建草稿并发布；未批准 403 toast

- [ ] **Step 5: Commit**

```bash
git add apps/mp/src/api/activities.ts apps/mp/src/pages/organizer
git commit -m "$(cat <<'EOF'
feat(mp): 组织者活动列表与创建对接 API

EOF
)"
```

---

### Task 8: Admin 活动列表与下架页

**Files:**
- Modify: `apps/admin/src/api/admin.ts`
- Create: `apps/admin/src/views/Activities.vue`
- Modify: `apps/admin/src/router.ts`
- Modify: `apps/admin/src/views/OrganizerApplications.vue` 或 `App.vue`（加导航链接「活动」）

- [ ] **Step 1: API**

```ts
// 追加到 apps/admin/src/api/admin.ts
export type ActivityRow = {
  id: string;
  title: string;
  lifecycle: string;
  feeType: string;
  feeCents: number;
  startAt: string | null;
  endAt: string | null;
  removeReason: string | null;
  organizer: { id: string; name: string };
};

export function listActivities(lifecycle?: string) {
  const q = lifecycle ? `?lifecycle=${encodeURIComponent(lifecycle)}` : "";
  return apiRequest<ActivityRow[]>(`/admin/activities${q}`);
}

export function removeActivity(id: string, reason: string) {
  return apiRequest<ActivityRow>(`/admin/activities/${id}/remove`, {
    method: "POST",
    body: { reason },
  });
}
```

- [ ] **Step 2: Activities.vue**

表格/列表展示 `listActivities('published')`（可切换全部）；每行「下架」→ prompt 原因 → `removeActivity`。  
风格对齐 `OrganizerApplications.vue`。

- [ ] **Step 3: 路由**

```ts
{
  path: "/activities",
  name: "activities",
  component: () => import("./views/Activities.vue"),
},
```

首页或组织者页增加 `<router-link to="/activities">活动</router-link>`。

- [ ] **Step 4: 浏览器联调 :5173**

Expected: 可对 published 下架；再次下架 409

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src
git commit -m "$(cat <<'EOF'
feat(admin): 活动列表与下架

EOF
)"
```

---

### Task 9: 文档收尾

**Files:**
- Modify: `docs/roadmap.md`（勾选 P0-2 完成项）
- Modify: `docs/adr/0005-activity-lifecycle-and-model.md`（状态 → Implemented）
- Modify: `docs/adr/README.md`
- Modify: `docs/superpowers/specs/2026-10-19-p0-2-activity-domain-design.md`（状态 → Implemented）

- [x] **Step 1: 勾选 roadmap 并更新 ADR 状态**

- [x] **Step 2: 全量 API 测试**

Run: `pnpm --filter @activity/api test`  
Expected: PASS

- [x] **Step 3: Commit**

```bash
git add docs
git commit -m "$(cat <<'EOF'
docs: P0-2 活动域验收勾选，ADR-0005 Implemented

EOF
)"
```

---

## Spec 覆盖自检

| Spec 要求 | Task |
| --- | --- |
| 字段与 free/paid | 2, 4 |
| 草稿/发布/退回/取消 | 4, 5, 7 |
| 单一 lifecycle、无审核 | 1, 2 |
| 我的活动列表 | 5, 7 |
| 运营 removed + AuditLog | 6, 8 |
| 报名取消钩子 | 3, 4, 6 |
| 不开放支付 | 全程无支付模块 |
| AT-ACT-01～03 | 4–5, 7 |

**Placeholder scan：** 无 TBD；UI 字段以 create 表单为准写死。  
**类型一致性：** `ActivityLifecycle` / `FeeType` Prisma 与 shared 字符串值对齐。

---

## 执行交接

Plan complete and saved to `docs/superpowers/plans/2026-10-19-p0-2-activity-domain.md`.

**两种执行方式：**

1. **Subagent-Driven（推荐）** — 每任务新开子代理，任务间复查  
2. **Inline Execution** — 本会话按 `executing-plans` 批量推进并设检查点  

选哪一种？

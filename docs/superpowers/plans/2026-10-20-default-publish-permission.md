# 用户默认可发布（取消组织者） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 ADR-0011 去掉 Organizer：登录用户默认 `canPublish=true` 即可发活动；公开主办用昵称；运营可冻结发布权。

**Architecture:** Prisma 将 `Activity.organizerId` 迁为 `ownerUserId`；`PublisherGuard` 改为读 `User.canPublish`；活动管理路由 `/organizer/activities` → `/me/activities`；Admin 组织者申请模块换成用户发布权冻结。登录 JWT 方案不变。

**Tech Stack:** NestJS 11、Prisma 6、PostgreSQL、Vitest、`@activity/shared`、uni-app Vue3、Vue3 Admin、pnpm workspace

**前置文档：** [ADR-0011](../../adr/0011-default-publish-permission.md)、[设计规格](../specs/2026-10-20-default-publish-permission-design.md)

**本计划不写 ADR-0008**（审计查询 UI / 完整 P0-5）。冻结 API + Admin 最小页属于 0011。

---

## 文件结构

```text
packages/shared/src/identity.ts          # 删除 PublishStatus

apps/api/prisma/schema.prisma
apps/api/prisma/migrations/<ts>_drop_organizer_add_owner/

apps/api/src/common/guards/can-publish.guard.ts      # 替换 publisher.guard.ts
apps/api/src/common/guards/can-publish.guard.spec.ts

apps/api/src/activities/activities.controller.ts     # @Controller("me/activities")
apps/api/src/activities/activities.service.ts        # ownerUserId + canPublish
apps/api/src/uploads/uploads.controller.ts           # me/uploads

apps/api/src/public-activities/public-activity.mapper.ts  # hostName
apps/api/src/registrations/registrations.service.ts       # listForOwner

apps/api/src/auth/auth.service.ts                    # GET /me 返回 canPublish

# 删除 organizers/、admin-organizers/
apps/api/src/admin-users/                            # 新建：list + freeze/unfreeze

apps/mp/src/api/activities.ts                        # /me/activities
apps/mp/src/api/public-activities.ts                 # hostName
apps/mp/src/stores/user.ts                           # 去掉 applyOrganizer
apps/mp/src/pages/activity/detail.vue                # 主办 hostName
apps/mp/src/pages/mine/registrations.vue             # 去掉申请组织者

apps/admin/src/api/admin.ts
apps/admin/src/views/Users.vue                       # 替换 OrganizerApplications.vue
apps/admin/src/router.ts
```

---

### Task 1: shared 去掉 `PublishStatus`

**Files:**
- Modify: `packages/shared/src/identity.ts`

- [ ] **Step 1: 删除 `PublishStatus` 常量与类型**

`identity.ts` 只保留 `IdentityProvider` 与 `AdminRole`。全文应变为：

```ts
export const IdentityProvider = {
  Weixin: "weixin",
  Toutiao: "toutiao",
  Xhs: "xhs",
} as const;
export type IdentityProvider =
  (typeof IdentityProvider)[keyof typeof IdentityProvider];

export const AdminRole = {
  Operator: "operator",
  Admin: "admin",
} as const;
export type AdminRole = (typeof AdminRole)[keyof typeof AdminRole];
```

- [ ] **Step 2: 构建 shared**

Run: `pnpm --filter @activity/shared build`  
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/identity.ts
git commit -m "$(cat <<'EOF'
feat(shared): 移除组织者 PublishStatus 枚举

EOF
)"
```

---

### Task 2: Prisma — `canPublish` + `ownerUserId`，删除 Organizer

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: 迁移 SQL（`pnpm --filter @activity/api prisma:migrate` 生成后核对）

- [ ] **Step 1: 改 schema**

`User`：删 `organizer`，加：

```prisma
canPublish    Boolean    @default(true)
activities    Activity[]
```

删除整个 `enum PublishStatus` 与 `model Organizer`。

`Activity` 将 `organizerId` / `organizer` 换成：

```prisma
ownerUserId String
owner       User     @relation(fields: [ownerUserId], references: [id])

@@index([ownerUserId, lifecycle])
@@index([lifecycle, startAt])
```

- [ ] **Step 2: 手写迁移（在 `prisma migrate` 生成后把 SQL 改成可回填）**

迁移必须先回填再 drop，核心 SQL：

```sql
ALTER TABLE "User" ADD COLUMN "canPublish" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Activity" ADD COLUMN "ownerUserId" TEXT;

UPDATE "Activity" AS a
SET "ownerUserId" = o."ownerUserId"
FROM "Organizer" AS o
WHERE a."organizerId" = o."id";

UPDATE "User" AS u
SET "canPublish" = false
FROM "Organizer" AS o
WHERE o."ownerUserId" = u."id" AND o."publishStatus" = 'frozen';

DELETE FROM "Activity" WHERE "ownerUserId" IS NULL;

ALTER TABLE "Activity" ALTER COLUMN "ownerUserId" SET NOT NULL;

ALTER TABLE "Activity" DROP CONSTRAINT IF EXISTS "Activity_organizerId_fkey";
DROP INDEX IF EXISTS "Activity_organizerId_lifecycle_idx";
ALTER TABLE "Activity" DROP COLUMN "organizerId";

CREATE INDEX "Activity_ownerUserId_lifecycle_idx" ON "Activity"("ownerUserId", "lifecycle");

ALTER TABLE "Activity" ADD CONSTRAINT "Activity_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

DROP TABLE IF EXISTS "Organizer";
DROP TYPE IF EXISTS "PublishStatus";
```

Run（在 `apps/api`，需 DATABASE_URL）：

```bash
pnpm --filter @activity/api prisma:migrate
pnpm --filter @activity/api exec prisma generate
```

Expected: migrate 成功；`prisma generate` 后 client 无 `organizer`。

- [ ] **Step 3: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "$(cat <<'EOF'
feat(api): 活动归属 User，删除 Organizer 表

EOF
)"
```

---

### Task 3: `CanPublishGuard`（TDD）

**Files:**
- Create: `apps/api/src/common/guards/can-publish.guard.ts`
- Create: `apps/api/src/common/guards/can-publish.guard.spec.ts`
- Delete: `publisher.guard.ts`、`publisher.guard.spec.ts`

- [ ] **Step 1: 写失败测试**

```ts
import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../../prisma/prisma.service";
import { CanPublishGuard } from "./can-publish.guard";

function mockContext(user?: { userId: string }): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as ExecutionContext;
}

describe("CanPublishGuard", () => {
  const prisma = { user: { findUnique: vi.fn() } };
  let guard: CanPublishGuard;

  beforeEach(() => {
    vi.clearAllMocks();
    guard = new CanPublishGuard(prisma as unknown as PrismaService);
  });

  it("allows when canPublish is true", async () => {
    prisma.user.findUnique.mockResolvedValue({ canPublish: true });
    await expect(
      guard.canActivate(mockContext({ userId: "u1" })),
    ).resolves.toBe(true);
  });

  it("throws 403 when canPublish is false", async () => {
    prisma.user.findUnique.mockResolvedValue({ canPublish: false });
    await expect(
      guard.canActivate(mockContext({ userId: "u1" })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("throws 403 when user missing", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(
      guard.canActivate(mockContext({ userId: "u1" })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("throws when request has no user", async () => {
    await expect(guard.canActivate(mockContext())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
```

- [ ] **Step 2: Run 确认失败**

Run: `pnpm --filter @activity/api test -- src/common/guards/can-publish.guard.spec.ts`  
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 Guard**

```ts
@Injectable()
export class CanPublishGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: { userId: string } }>();
    const userId = req.user?.userId;
    if (!userId) throw new UnauthorizedException("Missing authenticated user");
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { canPublish: true },
    });
    if (!user?.canPublish) {
      throw new ForbiddenException("发布权限已关闭");
    }
    return true;
  }
}
```

删除旧 `PublisherGuard` 文件。`ActivitiesModule` / `UploadsModule` 的 provider import 先改名（下一 Task 接路由）；本 Task 至少让新 spec 能编译：更新两处 import 指向 `CanPublishGuard`，类级 Guard 暂时仍挂上（Task 4 会按路由拆开）。

- [ ] **Step 4: Run 测试通过**

Run: `pnpm --filter @activity/api test -- src/common/guards/can-publish.guard.spec.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(api): 发布权 Guard 改为 User.canPublish

EOF
)"
```

---

### Task 4: ActivitiesService 归属与冻结语义（TDD）

**Files:**
- Modify: `apps/api/src/activities/activities.service.ts`
- Modify: `apps/api/src/activities/activities.service.spec.ts`
- Modify: `apps/api/src/activities/activities.controller.ts`
- Modify: `apps/api/src/activities/activities.module.ts`
- Modify: `apps/api/src/uploads/uploads.controller.ts`

- [ ] **Step 1: 改测试夹具**

`activities.service.spec.ts`：

- mock 改为 `prisma.user.findUnique`（返回 `{ canPublish: true }`）与 `activity.findFirst`（`ownerUserId: "user-1"`）。
- `create` 期望 `data.ownerUserId === "user-1"`，不再有 `organizerId`。
- 新增用例：`create` 在 `canPublish: false` 时抛 `ForbiddenException`。
- `unpublish` 在 `canPublish: false` 但仍为所有者时**成功**（冻结可退回）。

- [ ] **Step 2: Run 确认失败**

Run: `pnpm --filter @activity/api test -- src/activities/activities.service.spec.ts`  
Expected: FAIL（仍查 organizer）

- [ ] **Step 3: 改 service**

替换 `requireApprovedOrganizer` / `requireOwnedActivity`：

```ts
private async requireUser(userId: string) {
  const user = await this.prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ForbiddenException("用户不存在");
  return user;
}

private async requireCanPublish(userId: string) {
  const user = await this.requireUser(userId);
  if (!user.canPublish) throw new ForbiddenException("发布权限已关闭");
  return user;
}

private async requireOwnedActivity(userId: string, activityId: string) {
  const activity = await this.prisma.activity.findFirst({
    where: { id: activityId, ownerUserId: userId },
  });
  if (!activity) throw new NotFoundException("Activity not found");
  return { activity };
}
```

- `create`：先 `requireCanPublish`，`data.ownerUserId = userId`。  
- `publish`：`requireOwnedActivity` 后再 `requireCanPublish`。  
- `update`：若 `dto.publish`，同样 `requireCanPublish`；否则仅所有者。  
- `unpublish` / `cancel` / `getMine` / `listMine`：只校验所有者（`listMine` 用 `where: { ownerUserId: userId }`）。

Controller：`@Controller("me/activities")`；类上只留 `UserJwtGuard`；`@UseGuards(CanPublishGuard)` 加在 `create` 与 `publish`。`uploads`：`@Controller("me/uploads")` + `UserJwtGuard` + `CanPublishGuard`。

- [ ] **Step 4: Run 测试通过**

Run: `pnpm --filter @activity/api test -- src/activities/activities.service.spec.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(api): 活动管理改挂 User 并迁到 /me/activities

EOF
)"
```

---

### Task 5: 公开 DTO `hostName` + 报名名单所有者（TDD）

**Files:**
- Modify: `apps/api/src/public-activities/public-activity.mapper.ts`
- Modify: `apps/api/src/public-activities/public-activities.service.ts`
- Modify: `apps/api/src/public-activities/public-activities.service.spec.ts`
- Modify: `apps/api/src/registrations/registrations.service.ts`
- Modify: `apps/api/src/registrations/registrations.service.spec.ts`
- Modify: `apps/api/src/admin-activities/admin-activities.service.ts`

- [ ] **Step 1: 改公开测试期望**

`public-activities.service.spec.ts` 里 mock `include` 改为 `owner: { nickname: "探索社" }`（或 `null`）。

```ts
expect(dto.hostName).toBe("探索社");
expect(dto).not.toHaveProperty("organizer");
```

另加：`nickname: null` → `hostName === "用户"`。

`registrations.service.spec.ts`：`listForOrganizer` 改名为 `listForOwner`；mock 用 `activity.ownerUserId`；非所有者仍 403。

- [ ] **Step 2: Run 确认失败**

Run: `pnpm --filter @activity/api test -- src/public-activities/public-activities.service.spec.ts src/registrations/registrations.service.spec.ts`  
Expected: FAIL

- [ ] **Step 3: 实现 mapper 与查询**

```ts
export function hostNameFromNickname(nickname: string | null | undefined): string {
  const n = nickname?.trim();
  return n ? n : "用户";
}
```

`PublicActivityDto.organizer` 改为 `hostName: string`。  
`toPublicDto` 入参改为 `Activity & { owner: { nickname: string | null } }`，`hostName: hostNameFromNickname(row.owner.nickname)`。

`PublicActivitiesService.list/getById`：

```ts
include: { owner: { select: { nickname: true } } }
```

`listForOwner`：

```ts
const activity = await this.prisma.activity.findUnique({ where: { id: activityId } });
if (!activity) throw new NotFoundException("活动不存在");
if (activity.ownerUserId !== userId) {
  throw new ForbiddenException("无权查看该活动报名名单");
}
```

Controller 调用改为 `listForOwner`。  
Admin 活动列表 `include: { owner: { select: { id: true, nickname: true } } }`。

- [ ] **Step 4: Run 测试通过**

Run: `pnpm --filter @activity/api test`  
Expected: 除 organizers/admin-organizers 外尽量绿；那两份在 Task 6 删除。

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(api): 公开主办改 hostName，名单按活动所有者鉴权

EOF
)"
```

---

### Task 6: `GET /me` 带 `canPublish`；删除组织者模块；Admin 用户冻结（TDD）

**Files:**
- Modify: `apps/api/src/auth/auth.service.ts`、`auth.service.spec.ts`
- Delete: `apps/api/src/organizers/**`、`apps/api/src/admin-organizers/**`
- Create: `apps/api/src/admin-users/admin-users.module.ts`
- Create: `apps/api/src/admin-users/admin-users.controller.ts`
- Create: `apps/api/src/admin-users/admin-users.service.ts`
- Create: `apps/api/src/admin-users/admin-users.service.spec.ts`
- Create: `apps/api/src/admin-users/dto/freeze-publish.dto.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Auth `getMe`**

返回：

```ts
{
  id, nickname, avatarUrl,
  canPublish: user.canPublish,
}
```

去掉 `include: { organizer: true }` 与 `organizer` 字段。同步改 `auth.service.spec.ts`（若有 organizer 断言）。

- [ ] **Step 2: AdminUsers 失败测试**

```ts
it("freeze sets canPublish false and writes audit", async () => {
  prisma.user.findUnique.mockResolvedValue({ id: "u1", canPublish: true });
  prisma.user.update.mockResolvedValue({ id: "u1", canPublish: false });
  await service.freezePublish("u1", "admin-1", { reason: "违规" });
  expect(prisma.user.update).toHaveBeenCalledWith({
    where: { id: "u1" },
    data: { canPublish: false },
  });
  expect(prisma.auditLog.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      action: "freeze_publish",
      targetType: "user",
      targetId: "u1",
      reason: "违规",
    }),
  });
});

it("unfreeze sets canPublish true", async () => { /* 对称 */ });

it("list returns paginated users with canPublish", async () => { /* findMany + count */ });
```

- [ ] **Step 3: 实现 AdminUsers**

`FreezePublishDto`：`reason: string` 非空（与现 `FreezeOrganizerDto` 相同）。

路由（AdminJwt + Roles operator/admin）：

- `GET /admin/users?page&pageSize` → `{ items: { id, nickname, canPublish, createdAt }[], total, page, pageSize }`
- `POST /admin/users/:id/freeze-publish`
- `POST /admin/users/:id/unfreeze-publish`

`app.module`：去掉 `OrganizersModule`、`AdminOrganizersModule`，加入 `AdminUsersModule`。

- [ ] **Step 4: 全量 api 测试**

Run: `pnpm --filter @activity/api test`  
Expected: 全部 PASS（不应再有 organizer / PublishStatus 引用）。

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(api): 删除组织者申请流，改为冻结用户发布权

EOF
)"
```

---

### Task 7: mp 客户端与页面

**Files:**
- Modify: `apps/mp/src/api/activities.ts`（所有 `/organizer/activities` → `/me/activities`；upload → `/me/uploads/cover`）
- Modify: `apps/mp/src/api/public-activities.ts`（`organizer: { displayName }` → `hostName: string`）
- Modify: `apps/mp/src/api/registrations.ts`（组织者名单 URL → `/me/activities/:id/registrations`）
- Modify: `apps/mp/src/stores/user.ts`
- Modify: `apps/mp/src/pages/activity/detail.vue`
- Modify: `apps/mp/src/pages/mine/registrations.vue`
- Modify: `apps/mp/src/pages/organizer/*.vue` 文案「组织者」→「我的活动 / 发布」（目录可暂留）

- [ ] **Step 1: store**

- `MeResult` 改为 `{ id, nickname, avatarUrl, canPublish: boolean }`，去掉 `organizer`。  
- `publishStatus` / `canApplyOrganizer` / `applyOrganizer` 删除。  
- `refreshIdentity`：`this.canPublishFlag = this.me?.canPublish ?? false`，不再请求 `/organizers/can-publish`。  
- `canPublish` getter 仍用 `canPublishFlag`。

- [ ] **Step 2: 详情主办**

```vue
<text class="value">{{ activity.hostName }}</text>
```

- [ ] **Step 3: 我的页**

去掉「申请组织者」按钮与 `onApply`。保留登录、发布活动、我的活动；`v-if="user.canPublish"` 控制发布入口。冻结时不展示「发布活动」，可提示「发布权限已关闭」。

组织者工作台文案改为「发布 / 我的活动」。`listOrganizerRegistrations` 的请求路径改为 `/me/activities/.../registrations`。

- [ ] **Step 4: 手测或 H5**

- 登录后可进发布页并创建草稿。  
- 详情主办为昵称或「用户」。  
- 无申请组织者入口。

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(mp): 去掉申请组织者，发布与主办改走用户身份

EOF
)"
```

---

### Task 8: Admin 用户发布权页

**Files:**
- Modify: `apps/admin/src/api/admin.ts`
- Create: `apps/admin/src/views/Users.vue`
- Delete: `apps/admin/src/views/OrganizerApplications.vue`
- Modify: `apps/admin/src/router.ts`
- Modify: `apps/admin/src/views/Activities.vue`（主办列改为 `owner.nickname` / hostName）

- [ ] **Step 1: API 客户端**

```ts
export type AdminUserRow = {
  id: string;
  nickname: string | null;
  canPublish: boolean;
  createdAt: string;
};

export function listUsers(page = 1) {
  return apiRequest<{ items: AdminUserRow[]; total: number; page: number; pageSize: number }>(
    `/admin/users?page=${page}`,
  );
}

export function freezePublish(id: string, reason: string) {
  return apiRequest(`/admin/users/${id}/freeze-publish`, {
    method: "POST",
    body: { reason },
  });
}

export function unfreezePublish(id: string, reason: string) {
  return apiRequest(`/admin/users/${id}/unfreeze-publish`, {
    method: "POST",
    body: { reason },
  });
}
```

删除 `listOrganizers` / `approveOrganizer` / `rejectOrganizer`。  
`ActivityRow.organizer` 改为 `owner: { id: string; nickname: string | null }`。

- [ ] **Step 2: `Users.vue`**

表格：昵称、`canPublish`、冻结/恢复（恢复/冻结都弹窗要原因）。路由 `/users` 替换 `/organizers`，默认 redirect `/users`。

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(admin): 用用户发布权列表替换组织者申请队列

EOF
)"
```

---

### Task 9: 文档收尾

**Files:**
- Modify: `docs/adr/0011-default-publish-permission.md` → Implemented  
- Modify: `docs/superpowers/specs/2026-10-20-default-publish-permission-design.md` → Implemented  
- Modify: `docs/adr/README.md`  
- Modify: `docs/roadmap.md`：勾选「去掉 Organizer / 申请流；User.canPublish 默认 true」

- [ ] **Step 1: 更新状态并 Commit**

```bash
git commit -m "$(cat <<'EOF'
docs: ADR-0011 Implemented，用户默认可发布已落地

EOF
)"
```

- [ ] **Step 2: 全量验证**

```bash
pnpm --filter @activity/shared build
pnpm --filter @activity/api test
pnpm --filter @activity/api type-check
```

Expected: 全部 PASS。

---

## 规格覆盖自检

| 规格项 | Task |
| --- | --- |
| 取消 Organizer / PublishStatus | 1, 2, 6 |
| `User.canPublish` 默认 true | 2 |
| `Activity.ownerUserId` 回填 + frozen→false | 2 |
| 新建/发布需 canPublish；冻结可退回/取消/看名单 | 3, 4 |
| `/me/activities` 替换 `/organizer/*` | 4, 7 |
| `hostName` 昵称，空则「用户」 | 5, 7 |
| 非所有者名单 403 | 5 |
| Admin 冻结/恢复 + AuditLog | 6, 8 |
| mp 去掉申请组织者 | 7 |
| 实现后 ADR Implemented | 9 |

## 非目标（计划不实现）

ADR-0008 审计查询页、封号扩展、支付、强制昵称、活动下架 Admin 增强（下架 API 已有，本计划只改主办列）。

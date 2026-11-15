# 活动签到（确认到场）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `Registration` 上落地所有者扫码/手动确认到场，参与者动态短时签到码，名单区分已/未签到。

**Architecture:** 无状态 JWT（`purpose=checkin`）作二维码内容；签到结果写入 `Registration.checkedInAt` / `checkedInByUserId`；API 挂在现有 registrations / me/activities 路由；mp 新增签到码页与组织者签到工作台，扫码经适配层。

**Tech Stack:** NestJS + Prisma + `@nestjs/jwt`；`@activity/shared`；uni-app Vue3 mp-weixin；二维码生成用轻量库（如 `uqrcodejs`）。

**规格 / ADR：** [2026-11-15-activity-check-in-design.md](../specs/2026-11-15-activity-check-in-design.md)、[ADR-0017](../../adr/0017-activity-check-in.md)

---

## File map

| 路径 | 职责 |
| --- | --- |
| `packages/shared/src/check-in.ts` | `CheckInErrorCode` 等 |
| `packages/shared/src/index.ts` | re-export |
| `apps/api/prisma/schema.prisma` + migration | `checkedInAt` / `checkedInByUserId` |
| `apps/api/src/registrations/registration.mapper.ts` | DTO 含签到字段 |
| `apps/api/src/registrations/check-in.service.ts`（新建） | 发码、验码、签到写入 |
| `apps/api/src/registrations/registrations.service.ts` | `listForOwner` 筛选与 count；可选委托 check-in |
| `apps/api/src/registrations/registrations.controller.ts` | `POST :id/check-in-token` |
| `apps/api/src/activities/activities.controller.ts` | 扫码/手动签到路由 |
| `apps/api/src/registrations/*.spec.ts` | 单测 |
| `apps/api/.env.example` | `CHECK_IN_TOKEN_TTL_SEC` |
| `apps/mp/src/api/registrations.ts` | 客户端 API |
| `apps/mp/src/adapters/scan.ts`（新建） | `scanCode` 适配 |
| `apps/mp/src/pages/mine/check-in-code.vue`（新建） | 参与者签到码 |
| `apps/mp/src/pages/organizer/check-in.vue`（新建） | 组织者工作台 |
| `apps/mp/src/pages.json` | 注册页面 |
| 入口链：`mine/registrations.vue`、`organizer/detail.vue` 或 `organizer/registrations.vue` | 导航 |

---

### Task 1: shared 错误码

**Files:**
- Create: `packages/shared/src/check-in.ts`
- Modify: `packages/shared/src/index.ts`

- [x] **Step 1: 新增错误码**

```ts
// packages/shared/src/check-in.ts
export const CheckInErrorCode = {
  TokenInvalid: "CHECK_IN_TOKEN_INVALID",
  TokenExpired: "CHECK_IN_TOKEN_EXPIRED",
  NotAllowed: "CHECK_IN_NOT_ALLOWED",
  Forbidden: "CHECK_IN_FORBIDDEN",
  AlreadyDone: "CHECK_IN_ALREADY_DONE",
  RegistrationNotFound: "REGISTRATION_NOT_FOUND",
} as const;
export type CheckInErrorCode =
  (typeof CheckInErrorCode)[keyof typeof CheckInErrorCode];
```

- [x] **Step 2: export**

在 `packages/shared/src/index.ts` 增加：`export * from "./check-in";`

- [x] **Step 3: Commit**

```bash
git add packages/shared/src/check-in.ts packages/shared/src/index.ts
git commit -m "$(cat <<'EOF'
feat(shared): 活动签到错误码

EOF
)"
```

---

### Task 2: Prisma 字段

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: migration via `pnpm --filter api exec prisma migrate`

- [x] **Step 1: 改 schema**

在 `model Registration` 增加：

```prisma
  checkedInAt       DateTime?
  checkedInByUserId String?
  checkedInBy       User?     @relation("RegistrationCheckInBy", fields: [checkedInByUserId], references: [id])
```

并增加索引：`@@index([activityId, checkedInAt])`

在 `model User` 增加：

```prisma
  registrationsCheckedIn Registration[] @relation("RegistrationCheckInBy")
```

- [x] **Step 2: 迁移**

```bash
cd apps/api && pnpm exec prisma migrate dev --name activity_check_in
```

Expected: migration 成功，client 生成。

- [x] **Step 3: Commit**

```bash
git add apps/api/prisma
git commit -m "$(cat <<'EOF'
feat(api): Registration 增加签到字段

EOF
)"
```

---

### Task 3: RegistrationDto 映射

**Files:**
- Modify: `apps/api/src/registrations/registration.mapper.ts`
- Test: 随 Task 4+ 覆盖

- [x] **Step 1: 扩展 DTO**

```ts
export type RegistrationDto = {
  // ...existing fields...
  checkedInAt: string | null;
  checkedInByUserId: string | null;
};

export function toRegistrationDto(row: Registration): RegistrationDto {
  return {
    // ...existing...
    checkedInAt: row.checkedInAt?.toISOString() ?? null,
    checkedInByUserId: row.checkedInByUserId ?? null,
  };
}
```

- [x] **Step 2: Commit**

```bash
git add apps/api/src/registrations/registration.mapper.ts
git commit -m "$(cat <<'EOF'
feat(api): RegistrationDto 暴露签到字段

EOF
)"
```

---

### Task 4: CheckInService — 发码与验签（TDD）

**Files:**
- Create: `apps/api/src/registrations/check-in.service.ts`
- Create: `apps/api/src/registrations/check-in.service.spec.ts`
- Modify: `apps/api/src/registrations/registrations.module.ts`（providers + JwtModule import）
- Modify: `apps/api/.env.example`

- [x] **Step 1: 写失败单测骨架**（`check-in.service.spec.ts`）

覆盖用例（mock Prisma + JwtService + ConfigService）：

1. 本人 + confirmed + 未结束 → `issueToken` 返回 token / expiresInSec  
2. 已签到 → ConflictException `CHECK_IN_ALREADY_DONE`  
3. 非本人 → Forbidden `CHECK_IN_FORBIDDEN`  
4. 无 endAt / 已结束 / 非 confirmed → `CHECK_IN_NOT_ALLOWED`  
5. `verifyAndCheckIn`：有效 token 首次写入；再扫 `alreadyCheckedIn: true`  
6. 过期 token → `CHECK_IN_TOKEN_EXPIRED`  
7. purpose 缺失或登录态 token → `CHECK_IN_TOKEN_INVALID`  
8. 非所有者 → `CHECK_IN_FORBIDDEN`  
9. path activityId 与 payload 不一致 → `CHECK_IN_TOKEN_INVALID`

- [x] **Step 2: 跑测确认失败**

```bash
pnpm --filter api test -- check-in.service.spec.ts
```

Expected: FAIL（service 不存在或方法未实现）

- [x] **Step 3: 实现 `CheckInService`**

要点：

```ts
@Injectable()
export class CheckInService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private ttlSec(): number {
    const n = Number(this.config.get("CHECK_IN_TOKEN_TTL_SEC") ?? 180);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 180;
  }

  private secret(): string {
    return this.config.getOrThrow<string>("JWT_USER_SECRET");
  }

  async issueToken(userId: string, registrationId: string) { /* ... */ }

  async checkInWithToken(
    ownerUserId: string,
    activityId: string,
    token: string,
  ) { /* verify + applyCheckIn */ }

  async checkInManual(
    ownerUserId: string,
    activityId: string,
    registrationId: string,
  ) { /* applyCheckIn */ }

  private async applyCheckIn(
    ownerUserId: string,
    activityId: string,
    registrationId: string,
  ): Promise<{
    registrationId: string;
    name: string;
    phone: string;
    checkedInAt: string;
    alreadyCheckedIn: boolean;
  }> { /* load activity+reg; assert owner; assert allowed; if checkedInAt return idempotent; else update */ }
}
```

发码 `jwt.sign({ sub, purpose: "checkin", registrationId, activityId }, { secret, expiresIn: `${ttl}s` })`。

验签：`jwt.verify(token, { secret })`；捕获 TokenExpiredError → `CHECK_IN_TOKEN_EXPIRED`；其它 → `CHECK_IN_TOKEN_INVALID`；断言 `purpose === "checkin"` 且 `activityId` 匹配。

业务失败用 `ConflictException` / `ForbiddenException` / `NotFoundException`，body 带 `{ message, code: CheckInErrorCode.* }`（与报名服务一致）。

- [x] **Step 4: 模块注册**

`RegistrationsModule`：`imports: [JwtModule]`（若尚未从 Auth 导出则 `JwtModule.registerAsync` 与 auth 相同 secret，或 `forwardRef` / import `AuthModule` 已 export 的 `JwtModule`——**优先 import 已 export JwtModule 的 AuthModule**）。`providers` / `exports` 加入 `CheckInService`。

`.env.example` 增加：`CHECK_IN_TOKEN_TTL_SEC=180`

- [x] **Step 5: 跑测通过**

```bash
pnpm --filter api test -- check-in.service.spec.ts
```

Expected: PASS

- [x] **Step 6: Commit**

```bash
git add apps/api/src/registrations/check-in.service.ts \
  apps/api/src/registrations/check-in.service.spec.ts \
  apps/api/src/registrations/registrations.module.ts \
  apps/api/.env.example
git commit -m "$(cat <<'EOF'
feat(api): 签到发码与核销服务

EOF
)"
```

---

### Task 5: HTTP 路由

**Files:**
- Modify: `apps/api/src/registrations/registrations.controller.ts`
- Modify: `apps/api/src/activities/activities.controller.ts`
- Create DTO（可选）：`apps/api/src/registrations/dto/check-in-with-token.dto.ts`（`token: string`，`@IsString()` `@IsNotEmpty()`）

- [x] **Step 1: 报名侧发码**

```ts
@Post(":id/check-in-token")
issueCheckInToken(
  @CurrentUser() user: CurrentUserPayload,
  @Param("id") id: string,
) {
  return this.checkInService.issueToken(user.userId, id);
}
```

注意：`:id/check-in-token` 须注册在不会被其它 `:id` 冲突的位置（本 controller 已有 `:id/cancel`，同样模式即可）。

- [x] **Step 2: 活动侧扫码 / 手动**

在 `ActivitiesController` 注入 `CheckInService`：

```ts
@Post(":id/check-in")
checkInWithToken(
  @CurrentUser() user: CurrentUserPayload,
  @Param("id") id: string,
  @Body() dto: CheckInWithTokenDto,
) {
  return this.checkIn.checkInWithToken(user.userId, id, dto.token);
}

@Post(":id/registrations/:registrationId/check-in")
checkInManual(
  @CurrentUser() user: CurrentUserPayload,
  @Param("id") id: string,
  @Param("registrationId") registrationId: string,
) {
  return this.checkIn.checkInManual(user.userId, id, registrationId);
}
```

路由顺序：把更具体的 `registrations` / `check-in` 放在 `@Get(":id")` **之前**（若尚未如此，调整声明顺序）。

- [x] **Step 3: ActivitiesModule** 能注入 CheckInService（export from RegistrationsModule 并 import）。

- [x] **Step 4: 手动或 e2e 烟测**（可选 curl + AUTH_DEV_BYPASS）；至少保证 `pnpm --filter api test` 相关仍绿。

- [x] **Step 5: Commit**

```bash
git add apps/api/src/registrations apps/api/src/activities
git commit -m "$(cat <<'EOF'
feat(api): 签到 HTTP 路由

EOF
)"
```

---

### Task 6: listForOwner 筛选与 count

**Files:**
- Modify: `apps/api/src/registrations/dto/list-my-registrations.query.ts`（或 owner 专用 query：增加可选 `checkedIn?: string`，`"true"|"false"`）
- Modify: `apps/api/src/registrations/registrations.service.ts` `listForOwner`
- Modify: `apps/api/src/registrations/registrations.service.spec.ts`

- [x] **Step 1: 失败单测**

- `checkedIn=true` 只返回有 `checkedInAt` 的行  
- 响应含 `checkedInCount` / `notCheckedInCount`（针对该活动、默认与列表相同的 status 过滤；**规格默认按 confirmed 计**：若 query 未传 status，count 以 `status=confirmed` 为准；items 的 where 与现网一致——**实现约定：count 始终针对 `activityId + status=confirmed`；列表 items 仍尊重传入的 status，若未传 status 则不过滤 status（保持现网行为）。** 为签到工作台：mp 请求时显式 `status=confirmed`。）

- [x] **Step 2: 实现**

```ts
const checkedInFilter =
  query.checkedIn === "true"
    ? { checkedInAt: { not: null } }
    : query.checkedIn === "false"
      ? { checkedInAt: null }
      : {};

const where: Prisma.RegistrationWhereInput = {
  activityId,
  ...statusFilter,
  ...checkedInFilter,
};

const confirmedWhere: Prisma.RegistrationWhereInput = {
  activityId,
  status: RegistrationStatus.confirmed,
};

const [rows, total, checkedInCount, confirmedTotal] = await Promise.all([
  // findMany where...
  // count where
  this.prisma.registration.count({
    where: { ...confirmedWhere, checkedInAt: { not: null } },
  }),
  this.prisma.registration.count({ where: confirmedWhere }),
]);
const notCheckedInCount = confirmedTotal - checkedInCount;

// items 映射增加 checkedInAt / checkedInByUserId
return { items, total, page, pageSize, checkedInCount, notCheckedInCount };
```

- [x] **Step 3: 跑测**

```bash
pnpm --filter api test -- registrations.service.spec.ts
```

Expected: PASS

- [x] **Step 4: Commit**

```bash
git add apps/api/src/registrations
git commit -m "$(cat <<'EOF'
feat(api): 报名名单支持签到筛选与计数

EOF
)"
```

---

### Task 7: mp API + 扫码适配

**Files:**
- Modify: `apps/mp/src/api/registrations.ts`
- Create: `apps/mp/src/adapters/scan.ts`

- [x] **Step 1: API 函数**

```ts
export type CheckInTokenResult = {
  token: string;
  expiresAt: string;
  expiresInSec: number;
  activityId: string;
  registrationId: string;
};

export type CheckInResult = {
  registrationId: string;
  name: string;
  phone: string;
  checkedInAt: string;
  alreadyCheckedIn: boolean;
};

export function issueCheckInToken(registrationId: string) {
  return request<CheckInTokenResult>(
    `/registrations/${encodeURIComponent(registrationId)}/check-in-token`,
    { method: "POST" },
  );
}

export function checkInWithToken(activityId: string, token: string) {
  return request<CheckInResult>(
    `/me/activities/${encodeURIComponent(activityId)}/check-in`,
    { method: "POST", data: { token } },
  );
}

export function checkInManual(activityId: string, registrationId: string) {
  return request<CheckInResult>(
    `/me/activities/${encodeURIComponent(activityId)}/registrations/${encodeURIComponent(registrationId)}/check-in`,
    { method: "POST" },
  );
}
```

扩展 `Registration` 类型与 `listOrganizerRegistrations`：支持 `checkedIn?: boolean`；响应类型含 `checkedInCount` / `notCheckedInCount`；字段 `checkedInAt`。

- [x] **Step 2: scan 适配**

```ts
// apps/mp/src/adapters/scan.ts
export function scanQrCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    // #ifdef MP-WEIXIN
    uni.scanCode({
      onlyFromCamera: false,
      success: (res) => resolve(String(res.result || "").trim()),
      fail: reject,
    });
    // #endif
    // #ifndef MP-WEIXIN
    reject(new Error("当前端不支持扫码"));
    // #endif
  });
}
```

（若项目更倾向零 `#ifdef`：用 `uni.scanCode` 统一调用，H5 fail 时 toast——二选一，优先少 ifdef。）

- [x] **Step 3: Commit**

```bash
git add apps/mp/src/api/registrations.ts apps/mp/src/adapters/scan.ts
git commit -m "$(cat <<'EOF'
feat(mp): 签到 API 与扫码适配

EOF
)"
```

---

### Task 8: 参与者签到码页

**Files:**
- Create: `apps/mp/src/pages/mine/check-in-code.vue`
- Modify: `apps/mp/src/pages.json`
- Modify: `apps/mp/src/pages/mine/registrations.vue`（入口）
- Dependency: `pnpm --filter mp add uqrcodejs`（或同等 canvas QR；选定后锁定）

- [x] **Step 1: 安装 QR 库并实现页面**

逻辑：

- onLoad 取 `registrationId`  
- 若报名已有 `checkedInAt`（可先 `listMyRegistrations` 带 activity 或详情字段）：只展示已签到  
- 否则循环：`issueCheckInToken` → 生成二维码（纯 token 字符串）→ 按 `expiresInSec` 倒计时 → 到期刷新  
- 捕获 `CHECK_IN_ALREADY_DONE` → 切已签到 UI  
- 捕获 `CHECK_IN_NOT_ALLOWED` → 展示不可用文案  

- [x] **Step 2: pages.json**

```json
{
  "path": "pages/mine/check-in-code",
  "style": { "navigationBarTitleText": "签到码" }
}
```

- [x] **Step 3: 我的报名列表** 对 `confirmed` 且活动未结束项增加「签到码」跳转。

- [x] **Step 4: Commit**

```bash
git add apps/mp
git commit -m "$(cat <<'EOF'
feat(mp): 参与者动态签到码页

EOF
)"
```

---

### Task 9: 组织者签到工作台

**Files:**
- Create: `apps/mp/src/pages/organizer/check-in.vue`
- Modify: `apps/mp/src/pages.json`
- Modify: `apps/mp/src/pages/organizer/detail.vue`（或 list/registrations）加「签到」入口

- [x] **Step 1: 页面结构**

- Tab：扫码 | 未签到 | 已签到  
- 扫码：按钮 → `scanQrCode()` → `checkInWithToken` → toast 姓名 + 首次/已签到  
- 未签到列表：`listOrganizerRegistrations({ status: "confirmed", checkedIn: false })`；行内「标记到场」→ `uni.showModal` 确认 → `checkInManual` → 刷新  
- 已签到列表：`checkedIn: true`；展示 `checkedInAt`  
- 顶栏：`checkedInCount` / `notCheckedInCount`  
- 活动已结束：禁用扫码与手动（可按 `endAt` 本地判断 + 接口错误兜底）

- [x] **Step 2: pages.json 注册 `pages/organizer/check-in`**

- [x] **Step 3: Commit**

```bash
git add apps/mp
git commit -m "$(cat <<'EOF'
feat(mp): 组织者签到工作台

EOF
)"
```

---

### Task 10: 文档收尾与全量测试

**Files:**
- Modify: `docs/roadmap.md`（P2 签到条目勾选进度）  
- Modify: `docs/adr/0017-activity-check-in.md` → 实现完成后改 `Implemented`（本 Task 若代码已合入再改）  
- Modify: `docs/superpowers/specs/2026-11-15-activity-check-in-design.md` 状态  

- [x] **Step 1: API 全量测试**

```bash
pnpm --filter api test
pnpm --filter api exec tsc --noEmit
```

Expected: PASS

- [x] **Step 2: 更新 checklist**（roadmap / ADR / spec 状态）

- [x] **Step 3: Commit**

```bash
git add docs apps/api apps/mp packages/shared
git commit -m "$(cat <<'EOF'
docs: 签到实现收尾与 roadmap 回写

EOF
)"
```

---

## Self-review（计划作者）

| 规格要点 | 对应 Task |
| --- | --- |
| Registration 字段 | Task 2–3 |
| 短时 JWT 发码 / purpose | Task 4 |
| 扫码 / 手动 / 幂等 / 不可撤销 | Task 4–5 |
| 名单筛选 + count | Task 6 |
| 参与者码页、已签到不展示码 | Task 8 |
| 组织者工作台、二次确认 | Task 9 |
| shared 错误码 | Task 1 |
| AT-CI-01～09 | Task 4/6 单测 + Task 8–9 手测 |

无 TBD 步骤；`endAt` 空、AlreadyDone 发码、purpose 隔离均按 ADR/规格写死。

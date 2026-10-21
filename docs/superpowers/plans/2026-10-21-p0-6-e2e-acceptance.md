# P0-6 端到端验收与观测基线 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地 ADR-0009：探活、必填环境变量校验、三个业务事件 JSON 日志、API 冒烟脚本与手测清单，使 P0 闭环可试运营。

**Architecture:** 薄增量。`GET /api/health` 不查库。启动只校验三个 JWT/DB 环境变量。`logBusinessEvent()` 用 Nest `Logger` 打一行 JSON（`user.login` / `activity.publish` / `registration.create`）。冒烟是独立 Node 脚本，打已启动的 API，最后恢复 dev 用户发布权。不引入 pino / Sentry / 事件表，不改现有 HTTP 错误形状。

**Tech Stack:** NestJS 11、Vitest、`@activity/shared`、Node 原生 `fetch`、pnpm workspace

**前置文档：** [ADR-0009](../../adr/0009-e2e-acceptance-and-observability.md)、[设计规格](../specs/2026-10-21-p0-6-e2e-acceptance-design.md)

---

## 文件结构

```text
packages/shared/src/observability.ts          # BusinessEvent 常量
packages/shared/src/index.ts                 # 导出

apps/api/src/common/env.ts                   # assertRequiredEnv
apps/api/src/common/env.spec.ts
apps/api/src/common/log-business-event.ts
apps/api/src/common/log-business-event.spec.ts
apps/api/src/health/health.controller.ts
apps/api/src/health/health.controller.spec.ts
apps/api/src/health/health.module.ts
apps/api/src/app.module.ts                   # HealthModule
apps/api/src/main.ts                         # 启动前校验 env
apps/api/src/auth/auth.service.ts            # user.login
apps/api/src/auth/auth.service.spec.ts
apps/api/src/activities/activities.service.ts
apps/api/src/activities/activities.service.spec.ts
apps/api/src/registrations/registrations.service.ts
apps/api/src/registrations/registrations.service.spec.ts
apps/api/scripts/p0-smoke.mjs
apps/api/package.json                        # smoke script

apps/api/.env.example                        # 已有，对齐表格
apps/mp/.env.example                         # 已有
apps/admin/.env.example                      # 新建

docs/adr/0009-e2e-acceptance-and-observability.md
docs/adr/README.md
docs/roadmap.md
docs/superpowers/specs/2026-10-21-p0-6-e2e-acceptance-design.md
```

不改 Prisma schema，不加 Redis/MQ/Sentry，不改 Admin/mp 业务页（手测清单只写文档）。

---

### Task 1: shared 业务事件常量

**Files:**
- Create: `packages/shared/src/observability.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: 新增事件常量**

```ts
export const BusinessEvent = {
  UserLogin: "user.login",
  ActivityPublish: "activity.publish",
  RegistrationCreate: "registration.create",
} as const;
export type BusinessEvent =
  (typeof BusinessEvent)[keyof typeof BusinessEvent];
```

- [ ] **Step 2: 从 `packages/shared/src/index.ts` 导出**

现有文件追加一行：

```ts
export * from "./observability";
```

错误码已从 `./activity` 导出（`PublicActivityErrorCode` / `RegistrationErrorCode`），不必再造一份。

- [ ] **Step 3: 构建 shared**

Run: `pnpm --filter @activity/shared build`

Expected: 退出码 0

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/observability.ts packages/shared/src/index.ts
git commit -m "$(cat <<'EOF'
feat(shared): 增加 P0-6 业务事件名（ADR-0009）

EOF
)"
```

---

### Task 2: 启动环境变量校验

**Files:**
- Create: `apps/api/src/common/env.ts`
- Create: `apps/api/src/common/env.spec.ts`
- Modify: `apps/api/src/main.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from "vitest";
import { assertRequiredEnv } from "./env";

describe("assertRequiredEnv", () => {
  it("throws listing missing keys", () => {
    expect(() => assertRequiredEnv({})).toThrow(
      /Missing required env: DATABASE_URL, JWT_USER_SECRET, JWT_ADMIN_SECRET/,
    );
  });

  it("ignores blank values", () => {
    expect(() =>
      assertRequiredEnv({
        DATABASE_URL: "  ",
        JWT_USER_SECRET: "s",
        JWT_ADMIN_SECRET: "a",
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it("passes when all three are present", () => {
    expect(() =>
      assertRequiredEnv({
        DATABASE_URL: "postgresql://localhost/activity",
        JWT_USER_SECRET: "u",
        JWT_ADMIN_SECRET: "a",
      }),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @activity/api exec vitest run src/common/env.spec.ts`

Expected: FAIL（`assertRequiredEnv` 不存在）

- [ ] **Step 3: 实现**

```ts
const REQUIRED = ["DATABASE_URL", "JWT_USER_SECRET", "JWT_ADMIN_SECRET"] as const;

export function assertRequiredEnv(
  env: Record<string, string | undefined> = process.env,
): void {
  const missing = REQUIRED.filter((key) => !env[key]?.trim());
  if (missing.length) {
    throw new Error(`Missing required env: ${missing.join(", ")}`);
  }
}
```

`main.ts` 在 `NestFactory.create` 之前调用：

```ts
import { assertRequiredEnv } from "./common/env";

async function bootstrap() {
  assertRequiredEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // ...existing listen...
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @activity/api exec vitest run src/common/env.spec.ts`

Expected: PASS（3 tests）

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common/env.ts apps/api/src/common/env.spec.ts apps/api/src/main.ts
git commit -m "$(cat <<'EOF'
feat(api): 启动时校验 DATABASE_URL 与 JWT 密钥（ADR-0009）

EOF
)"
```

---

### Task 3: `GET /api/health`

**Files:**
- Create: `apps/api/src/health/health.controller.ts`
- Create: `apps/api/src/health/health.controller.spec.ts`
- Create: `apps/api/src/health/health.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from "vitest";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  it("returns ok and ISO time", () => {
    const result = new HealthController().check();
    expect(result.status).toBe("ok");
    expect(result.time).toBe(new Date(result.time).toISOString());
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @activity/api exec vitest run src/health/health.controller.spec.ts`

Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 controller + module，挂到 AppModule**

```ts
import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  check() {
    return { status: "ok" as const, time: new Date().toISOString() };
  }
}
```

```ts
import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";

@Module({ controllers: [HealthController] })
export class HealthModule {}
```

`app.module.ts` 的 `imports` 增加 `HealthModule`（放在 `ConfigModule` 之后即可）。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @activity/api exec vitest run src/health/health.controller.spec.ts`

Expected: PASS（1 test）

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/health apps/api/src/app.module.ts
git commit -m "$(cat <<'EOF'
feat(api): 增加不查库的 GET /api/health（ADR-0009）

EOF
)"
```

---

### Task 4: `logBusinessEvent`

**Files:**
- Create: `apps/api/src/common/log-business-event.ts`
- Create: `apps/api/src/common/log-business-event.spec.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BusinessEvent } from "@activity/shared";
import { logBusinessEvent } from "./log-business-event";

describe("logBusinessEvent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs JSON with event, actorId, at; omits empty targetId", () => {
    const spy = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    logBusinessEvent({ event: BusinessEvent.UserLogin, actorId: "u1" });
    expect(spy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(spy.mock.calls[0]?.[0]));
    expect(payload).toMatchObject({ event: "user.login", actorId: "u1" });
    expect(payload.targetId).toBeUndefined();
    expect(payload.at).toBe(new Date(payload.at).toISOString());
  });

  it("includes targetId when provided", () => {
    const spy = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    logBusinessEvent({
      event: BusinessEvent.RegistrationCreate,
      actorId: "u1",
      targetId: "r1",
    });
    const payload = JSON.parse(String(spy.mock.calls[0]?.[0]));
    expect(payload.targetId).toBe("r1");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @activity/api exec vitest run src/common/log-business-event.spec.ts`

Expected: FAIL（`logBusinessEvent` 不存在）

- [ ] **Step 3: 实现**

```ts
import { Logger } from "@nestjs/common";
import type { BusinessEvent } from "@activity/shared";

const logger = new Logger("BusinessEvent");

export function logBusinessEvent(input: {
  event: BusinessEvent;
  actorId: string;
  targetId?: string;
}): void {
  logger.log(
    JSON.stringify({
      event: input.event,
      actorId: input.actorId,
      ...(input.targetId ? { targetId: input.targetId } : {}),
      at: new Date().toISOString(),
    }),
  );
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @activity/api exec vitest run src/common/log-business-event.spec.ts`

Expected: PASS（2 tests）

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common/log-business-event.ts apps/api/src/common/log-business-event.spec.ts
git commit -m "$(cat <<'EOF'
feat(api): 增加业务事件 JSON 日志助手（ADR-0009）

EOF
)"
```

---

### Task 5: 登录成功打 `user.login`

**Files:**
- Modify: `apps/api/src/auth/auth.service.ts`
- Modify: `apps/api/src/auth/auth.service.spec.ts`

- [ ] **Step 1: 在现有成功登录用例里加失败断言**

在 `auth.service.spec.ts` 增加：

```ts
import { Logger } from "@nestjs/common";
import { BusinessEvent } from "@activity/shared";
```

在 `"dev bypass issues token for mock code"` 里，`login` 之后：

```ts
    const spy = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const result = await service.login({ code: "dev" });
    expect(spy).toHaveBeenCalled();
    const payload = JSON.parse(String(spy.mock.calls.at(-1)?.[0]));
    expect(payload.event).toBe(BusinessEvent.UserLogin);
    expect(payload.actorId).toBe("user-dev-1");
```

注意：spy 必须在 `login` **之前**创建。把现有 `const result = await service.login(...)` 换成上面顺序。`afterEach` 已有 `vi.clearAllMocks()`；再在该 it 结尾 `spy.mockRestore()`，或在 `beforeEach` 里不要 restore 全局 Logger。推荐每个 it 内 `try/finally { spy.mockRestore(); }`。

`getMe` 用例不应触发该日志。

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @activity/api exec vitest run src/auth/auth.service.spec.ts`

Expected: FAIL（没有 `user.login` 日志）

- [ ] **Step 3: 在 `issueToken` 成功返回前打点**

`auth.service.ts` 增加：

```ts
import { BusinessEvent } from "@activity/shared";
import { logBusinessEvent } from "../common/log-business-event";
```

`issueToken` 在 `return` 前：

```ts
    logBusinessEvent({ event: BusinessEvent.UserLogin, actorId: user.id });
    return {
      accessToken,
      user: {
        id: user.id,
        nickname: user.nickname,
        avatarUrl: user.avatarUrl,
      },
    };
```

dev bypass 与微信登录都走 `issueToken`，只打一次。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @activity/api exec vitest run src/auth/auth.service.spec.ts`

Expected: PASS（现有 3 + 日志断言）

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/auth/auth.service.ts apps/api/src/auth/auth.service.spec.ts
git commit -m "$(cat <<'EOF'
feat(api): 用户登录成功记录 user.login（ADR-0009）

EOF
)"
```

---

### Task 6: 发布成功打 `activity.publish`

**Files:**
- Modify: `apps/api/src/activities/activities.service.ts`
- Modify: `apps/api/src/activities/activities.service.spec.ts`

- [ ] **Step 1: 新增失败测试**

在 `activities.service.spec.ts` 增加（完整可发布草稿）：

```ts
import { Logger } from "@nestjs/common";
import { BusinessEvent } from "@activity/shared";

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
```

分类必须是 `观赛`（`ACTIVITY_CATEGORIES` 当前只有这一项）。`create` 仅保存草稿、不调用 `publish` 时不应打此事件。

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @activity/api exec vitest run src/activities/activities.service.spec.ts`

Expected: FAIL（没有 `activity.publish` 日志）

- [ ] **Step 3: 在 `publish` 更新成功后打点**

```ts
import { BusinessEvent } from "@activity/shared";
import { logBusinessEvent } from "../common/log-business-event";
```

`publish` 末尾改为：

```ts
    const published = await this.prisma.activity.update({
      where: { id },
      data: {
        ...defaults,
        lifecycle: ActivityLifecycle.published,
        publishedAt: new Date(),
      },
    });
    logBusinessEvent({
      event: BusinessEvent.ActivityPublish,
      actorId: userId,
      targetId: published.id,
    });
    return published;
```

`create(..., { publish: true })` 与 `update(..., { publish: true })` 都走 `publish()`，只打一次。已 published 再 publish 会抛 Conflict，不会打点。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @activity/api exec vitest run src/activities/activities.service.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/activities/activities.service.ts apps/api/src/activities/activities.service.spec.ts
git commit -m "$(cat <<'EOF'
feat(api): 活动首次发布记录 activity.publish（ADR-0009）

EOF
)"
```

---

### Task 7: 新报名打 `registration.create`

**Files:**
- Modify: `apps/api/src/registrations/registrations.service.ts`
- Modify: `apps/api/src/registrations/registrations.service.spec.ts`

- [ ] **Step 1: 在「create confirms」加断言，并给幂等用例加反断言**

`registrations.service.spec.ts` 增加 `Logger` / `BusinessEvent` import。

`create confirms when capacity available` 在 `create` 前 spy，成功后：

```ts
    expect(JSON.parse(String(spy.mock.calls.at(-1)?.[0])).event).toBe(
      BusinessEvent.RegistrationCreate,
    );
    expect(JSON.parse(String(spy.mock.calls.at(-1)?.[0])).targetId).toBe("r1");
```

`create is idempotent when already confirmed` 与 `create reactivates cancelled registration`：

```ts
    const spy = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    // ...existing create...
    const events = spy.mock.calls
      .map((c) => {
        try {
          return JSON.parse(String(c[0])).event;
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    expect(events).not.toContain(BusinessEvent.RegistrationCreate);
    spy.mockRestore();
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @activity/api exec vitest run src/registrations/registrations.service.spec.ts`

Expected: FAIL（新创建路径没有事件；或先红在 confirms 用例）

- [ ] **Step 3: 仅在 `registration.create` 成功后打点**

`registrations.service.ts`：

```ts
import { BusinessEvent, RegistrationErrorCode } from "@activity/shared";
import { logBusinessEvent } from "../common/log-business-event";
```

在 `tx.registration.create` 之后、`return toRegistrationDto(created)` 之前（仍在 transaction 回调内即可）：

```ts
      logBusinessEvent({
        event: BusinessEvent.RegistrationCreate,
        actorId: userId,
        targetId: created.id,
      });
      return toRegistrationDto(created);
```

不要写在 `existing?.status === confirmed` 的提前返回，也不要写在 cancelled → confirmed 的 `update` 分支。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @activity/api exec vitest run src/registrations/registrations.service.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/registrations/registrations.service.ts apps/api/src/registrations/registrations.service.spec.ts
git commit -m "$(cat <<'EOF'
feat(api): 新报名成功记录 registration.create（ADR-0009）

EOF
)"
```

---

### Task 8: 三端 `.env.example`

**Files:**
- Modify: `apps/api/.env.example`
- Modify: `apps/mp/.env.example`
- Create: `apps/admin/.env.example`

- [ ] **Step 1: 对齐规格 §4**

`apps/api/.env.example` 保持现有键，确认含：

```
DATABASE_URL=
JWT_USER_SECRET=
JWT_ADMIN_SECRET=
JWT_EXPIRES_IN=7d
WEIXIN_APPID=
WEIXIN_SECRET=
AUTH_DEV_BYPASS=true
ADMIN_BOOTSTRAP_EMAIL=admin@example.com
ADMIN_BOOTSTRAP_PASSWORD=ChangeMeNow!
PORT=3000
HOST=0.0.0.0
PUBLIC_API_BASE=http://127.0.0.1:3000/api
```

`apps/mp/.env.example` 保持：

```
VITE_API_BASE=http://192.168.x.x:3000/api
VITE_AUTH_DEV_BYPASS=true
```

新建 `apps/admin/.env.example`：

```
# 可选；不设则默认 http://127.0.0.1:3000/api
VITE_API_BASE=http://127.0.0.1:3000/api
```

不要提交真实 `.env`。

- [ ] **Step 2: Commit**

```bash
git add apps/api/.env.example apps/mp/.env.example apps/admin/.env.example
git commit -m "$(cat <<'EOF'
docs: 对齐 P0-6 三端环境变量示例（ADR-0009）

EOF
)"
```

---

### Task 9: API 冒烟脚本

**Files:**
- Create: `apps/api/scripts/p0-smoke.mjs`
- Modify: `apps/api/package.json`

- [ ] **Step 1: 增加 npm script**

`apps/api/package.json` 的 `scripts` 增加：

```json
"smoke": "node scripts/p0-smoke.mjs"
```

- [ ] **Step 2: 写脚本（完整）**

```js
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(import.meta.dirname, "../.env");
try {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
} catch {
  // 允许调用方自行 export 环境变量
}

const base = (process.env.API_BASE ?? "http://127.0.0.1:3000/api").replace(
  /\/$/,
  "",
);

async function call(step, method, path, { token, body } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    console.error(`FAIL ${step}: ${res.status}`, data);
    process.exit(1);
  }
  console.log(`OK ${step}: ${res.status}`);
  return data;
}

const now = Date.now();
const startAt = new Date(now + 24 * 3600 * 1000).toISOString();
const endAt = new Date(now + 26 * 3600 * 1000).toISOString();

const health = await call("health", "GET", "/health");
if (health.status !== "ok") {
  console.error("FAIL health: unexpected body", health);
  process.exit(1);
}

const userLogin = await call("user-login", "POST", "/auth/weixin/login", {
  body: { code: "dev" },
});
const userToken = userLogin.accessToken;
const userId = userLogin.user?.id;
if (!userToken || !userId) {
  console.error("FAIL user-login: missing token/user");
  process.exit(1);
}

const activity = await call("publish", "POST", "/me/activities", {
  token: userToken,
  body: {
    title: `P06-smoke-${now}`,
    coverUrl: "https://example.com/p0-6-smoke.jpg",
    category: "观赛",
    rules: "P0-6 冒烟须知",
    place: "P0-6 冒烟地点",
    startAt,
    endAt,
    capacity: 10,
    feeType: "free",
    feeCents: 0,
    publish: true,
  },
});
if (activity.lifecycle !== "published" || !activity.id) {
  console.error("FAIL publish: not published", activity);
  process.exit(1);
}

const registration = await call("register", "POST", "/registrations", {
  token: userToken,
  body: {
    activityId: activity.id,
    name: "冒烟用户",
    phone: "13800138000",
  },
});
if (registration.status !== "confirmed" || !registration.id) {
  console.error("FAIL register: not confirmed", registration);
  process.exit(1);
}

const adminEmail = process.env.ADMIN_BOOTSTRAP_EMAIL ?? "admin@example.com";
const adminPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD ?? "ChangeMeNow!";
const adminLogin = await call("admin-login", "POST", "/admin/auth/login", {
  body: { email: adminEmail, password: adminPassword },
});
const adminToken = adminLogin.accessToken;
if (!adminToken) {
  console.error("FAIL admin-login: missing token");
  process.exit(1);
}

await call("freeze", "POST", `/admin/users/${userId}/freeze-publish`, {
  token: adminToken,
  body: { reason: "p0-6-smoke" },
});

const logs = await call(
  "audit",
  "GET",
  `/admin/audit-logs?action=freeze_publish&targetId=${encodeURIComponent(userId)}`,
  { token: adminToken },
);
if (!logs.total || logs.total < 1) {
  console.error("FAIL audit: expected freeze log", logs);
  process.exit(1);
}

await call("unfreeze", "POST", `/admin/users/${userId}/unfreeze-publish`, {
  token: adminToken,
  body: { reason: "p0-6-smoke-restore" },
});

console.log("P0-6 smoke passed");
```

- [ ] **Step 3: 对已启动 API 跑冒烟**

前置：`AUTH_DEV_BYPASS=true` 的 API 在 3000 端口监听。

Run: `pnpm --filter @activity/api smoke`

Expected: 每步 `OK ...`，最后 `P0-6 smoke passed`，退出码 0。若 API 未启动，脚本因 `fetch` 失败非 0 退出——先启动再跑，不要为此改脚本去拉起 Nest。

- [ ] **Step 4: Commit**

```bash
git add apps/api/scripts/p0-smoke.mjs apps/api/package.json
git commit -m "$(cat <<'EOF'
feat(api): 增加 P0-6 API 冒烟脚本（ADR-0009）

EOF
)"
```

---

### Task 10: 文档收尾 Implemented

**Files:**
- Modify: `docs/adr/0009-e2e-acceptance-and-observability.md`
- Modify: `docs/superpowers/specs/2026-10-21-p0-6-e2e-acceptance-design.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/adr/README.md`（若状态栏仍写 Accepted，改为 Implemented）

- [ ] **Step 1: 跑全量 API 测试**

Run: `pnpm --filter @activity/api test`

Expected: 全绿（原 64 + 本计划新增用例）

- [ ] **Step 2: 更新文档**

ADR-0009：`状态` 改为 `Implemented`；后果补「已落地：health、env 校验、三个 event、`pnpm --filter @activity/api smoke`」。实现计划链接：`docs/superpowers/plans/2026-10-21-p0-6-e2e-acceptance.md`。

规格：`状态` 改为 `Implemented`，增加实现计划链接。

roadmap P0-6 三项打勾。

`docs/adr/README.md` 中 0009 状态改为 Implemented。

- [ ] **Step 3: Commit**

```bash
git add docs/adr/0009-e2e-acceptance-and-observability.md docs/adr/README.md docs/roadmap.md docs/superpowers/specs/2026-10-21-p0-6-e2e-acceptance-design.md
git commit -m "$(cat <<'EOF'
docs: ADR-0009 Implemented，P0-6 验收基线已落地

EOF
)"
```

---

## 手测（实现后由人执行，不写自动化）

见规格 §8：mp 发现/报名/取消/下架分享链；Admin 审计入口与 operator 403。

---

## Self-review

| 规格章节 | 对应任务 |
| --- | --- |
| §3 错误码只收口 | Task 1（沿用 activity 导出，不新造） |
| §4 环境变量 + 启动校验 | Task 2、Task 8 |
| §5 health | Task 3 |
| §6 三个 event | Task 4–7 |
| §7 smoke | Task 9 |
| §8 手测清单 | 规格已写；Task 10 不改清单正文 |
| §9–10 文档/验收 | Task 10 |

无 TBD。事件名全程用 `BusinessEvent.*`。`publish` 只在首次 draft→published 打点；报名只在 `create` 行打点。

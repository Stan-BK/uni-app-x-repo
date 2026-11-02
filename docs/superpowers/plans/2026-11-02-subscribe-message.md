# 报名成功与活动开始订阅消息 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 报名变为 `confirmed` 后入队并发送微信一次性订阅：报名成功、开始前 1 小时提醒；点报名时一次授权两个模板，失败不挡报名。

**Architecture:** `SubscribeMessageJob` 做本地队列。`confirmed` 同一事务 upsert 两条任务。进程内扫描器每分钟发送，同一 openId 每轮一条。微信发送走端口（测试 fake）。小程序授权收口在 `adapters/subscribe.ts`。无 Redis/MQ，Admin 不改。

**Tech Stack:** NestJS 11、Prisma 6、PostgreSQL、Vitest、uni-app Vue3、`@activity/shared`

**前置文档：** [ADR-0015](../../adr/0015-subscribe-message.md)、[规格](../specs/2026-11-02-subscribe-message-design.md)

---

## 文件结构

```text
packages/shared/src/subscribe-message.ts
packages/shared/src/index.ts

apps/api/prisma/schema.prisma
apps/api/prisma/migrations/20261102120000_subscribe_message_jobs/migration.sql

apps/api/src/subscribe-messages/subscribe-message.constants.ts
apps/api/src/subscribe-messages/subscribe-message.schedule.ts
apps/api/src/subscribe-messages/subscribe-message.schedule.spec.ts
apps/api/src/subscribe-messages/subscribe-message.payload.ts
apps/api/src/subscribe-messages/subscribe-message.payload.spec.ts
apps/api/src/subscribe-messages/subscribe-message.port.ts
apps/api/src/subscribe-messages/fake-weixin-subscribe.ts
apps/api/src/subscribe-messages/weixin-subscribe.client.ts
apps/api/src/subscribe-messages/subscribe-message.jobs.ts
apps/api/src/subscribe-messages/subscribe-message.jobs.spec.ts
apps/api/src/subscribe-messages/subscribe-message.service.ts
apps/api/src/subscribe-messages/subscribe-message.service.spec.ts
apps/api/src/subscribe-messages/subscribe-message.scanner.ts
apps/api/src/subscribe-messages/subscribe-messages.module.ts

apps/api/src/app.module.ts
apps/api/src/registrations/registrations.module.ts
apps/api/src/registrations/registrations.service.ts
apps/api/src/registrations/registrations.service.spec.ts
apps/api/src/registrations/prisma-registration-cancel.hook.ts
apps/api/src/registrations/prisma-registration-cancel.hook.spec.ts
apps/api/src/payments/payments.module.ts
apps/api/src/payments/payments.service.ts
apps/api/src/payments/payments.service.spec.ts
apps/api/src/activities/activities.module.ts
apps/api/.env.example

apps/mp/src/adapters/subscribe.ts
apps/mp/src/pages/register/index.vue
apps/mp/.env.example

docs/roadmap.md
```

不改 Admin。微信公众平台选模板发生在上线配置，不进本计划代码（关键词名集中在 `subscribe-message.payload.ts` 顶部常量，选完模板只改这一处）。

---

### Task 1: shared 枚举与 Prisma 表

**Files:**
- Create: `packages/shared/src/subscribe-message.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20261102120000_subscribe_message_jobs/migration.sql`

- [ ] **Step 1: 新增 shared 常量**

`packages/shared/src/subscribe-message.ts`:

```ts
export const SubscribeMessageKind = {
  RegistrationConfirmed: "registration_confirmed",
  ActivityStarting: "activity_starting",
} as const;
export type SubscribeMessageKind =
  (typeof SubscribeMessageKind)[keyof typeof SubscribeMessageKind];

export const SubscribeMessageJobStatus = {
  Pending: "pending",
  Sent: "sent",
  Skipped: "skipped",
  Cancelled: "cancelled",
} as const;
export type SubscribeMessageJobStatus =
  (typeof SubscribeMessageJobStatus)[keyof typeof SubscribeMessageJobStatus];
```

`packages/shared/src/index.ts` 追加：

```ts
export * from "./subscribe-message";
```

- [ ] **Step 2: 跑 shared 类型检查**

Run: `pnpm --filter @activity/shared type-check`

Expected: 退出码 0

- [ ] **Step 3: Prisma schema**

在 `schema.prisma` 的 `LedgerEntryType` 枚举后追加：

```prisma
enum SubscribeMessageKind {
  registration_confirmed
  activity_starting
}

enum SubscribeMessageJobStatus {
  pending
  sent
  skipped
  cancelled
}
```

`model Registration` 增加关系：

```prisma
  subscribeMessageJobs SubscribeMessageJob[]
```

在 `Registration` 模型后新增：

```prisma
model SubscribeMessageJob {
  id             String                     @id @default(cuid())
  registrationId String
  kind           SubscribeMessageKind
  dueAt          DateTime
  status         SubscribeMessageJobStatus  @default(pending)
  attemptCount   Int                        @default(0)
  lastError      String?
  sentAt         DateTime?
  createdAt      DateTime                   @default(now())
  updatedAt      DateTime                   @updatedAt
  registration   Registration               @relation(fields: [registrationId], references: [id])

  @@unique([registrationId, kind])
  @@index([status, dueAt])
}
```

- [ ] **Step 4: 手写 migration SQL**

`apps/api/prisma/migrations/20261102120000_subscribe_message_jobs/migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "SubscribeMessageKind" AS ENUM ('registration_confirmed', 'activity_starting');

-- CreateEnum
CREATE TYPE "SubscribeMessageJobStatus" AS ENUM ('pending', 'sent', 'skipped', 'cancelled');

-- CreateTable
CREATE TABLE "SubscribeMessageJob" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "kind" "SubscribeMessageKind" NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "SubscribeMessageJobStatus" NOT NULL DEFAULT 'pending',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscribeMessageJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubscribeMessageJob_registrationId_kind_key" ON "SubscribeMessageJob"("registrationId", "kind");

-- CreateIndex
CREATE INDEX "SubscribeMessageJob_status_dueAt_idx" ON "SubscribeMessageJob"("status", "dueAt");

-- AddForeignKey
ALTER TABLE "SubscribeMessageJob" ADD CONSTRAINT "SubscribeMessageJob_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

- [ ] **Step 5: 生成 Prisma Client**

Run: `pnpm --filter @activity/api prisma:generate`

Expected: 生成成功，无 error

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/subscribe-message.ts packages/shared/src/index.ts \
  apps/api/prisma/schema.prisma \
  apps/api/prisma/migrations/20261102120000_subscribe_message_jobs/migration.sql
git commit -m "$(cat <<'EOF'
feat(api): 增加订阅消息任务表与 shared kind 枚举

为 P1-4 一次性订阅落地队列存储，发送与报名确认解耦。
EOF
)"
```

---

### Task 2: 到期时间与模板字段纯函数

**Files:**
- Create: `apps/api/src/subscribe-messages/subscribe-message.constants.ts`
- Create: `apps/api/src/subscribe-messages/subscribe-message.schedule.ts`
- Create: `apps/api/src/subscribe-messages/subscribe-message.schedule.spec.ts`
- Create: `apps/api/src/subscribe-messages/subscribe-message.payload.ts`
- Create: `apps/api/src/subscribe-messages/subscribe-message.payload.spec.ts`

- [ ] **Step 1: 写到期时间失败测试**

`subscribe-message.constants.ts`:

```ts
export const SUBSCRIBE_SCAN_INTERVAL_MS = 60_000;
export const SUBSCRIBE_SCAN_BATCH_SIZE = 50;
export const SUBSCRIBE_MAX_ATTEMPTS = 3;
export const SUBSCRIBE_REMINDER_LEAD_MS = 60 * 60 * 1000;
export const SUBSCRIBE_STAGGER_MS = 60_000;
export const LAST_ERROR_MAX_LENGTH = 120;
```

`subscribe-message.schedule.spec.ts`:

```ts
import { SubscribeMessageKind } from "@activity/shared";
import { describe, expect, it } from "vitest";
import { computeJobDueAt } from "./subscribe-message.schedule";

describe("computeJobDueAt", () => {
  const now = new Date("2030-06-01T12:00:00.000Z");

  it("sets registration_confirmed to now", () => {
    expect(
      computeJobDueAt({
        kind: SubscribeMessageKind.RegistrationConfirmed,
        now,
        startAt: new Date("2030-06-02T12:00:00.000Z"),
      }).toISOString(),
    ).toBe(now.toISOString());
  });

  it("sets activity_starting to startAt minus 1h", () => {
    const startAt = new Date("2030-06-02T12:00:00.000Z");
    expect(
      computeJobDueAt({
        kind: SubscribeMessageKind.ActivityStarting,
        now,
        startAt,
      }).toISOString(),
    ).toBe("2030-06-02T11:00:00.000Z");
  });

  it("staggers activity_starting at least 60s after confirmed when start is soon", () => {
    const startAt = new Date("2030-06-01T12:30:00.000Z");
    expect(
      computeJobDueAt({
        kind: SubscribeMessageKind.ActivityStarting,
        now,
        startAt,
      }).toISOString(),
    ).toBe("2030-06-01T12:01:00.000Z");
  });

  it("returns null activity_starting without startAt", () => {
    expect(
      computeJobDueAt({
        kind: SubscribeMessageKind.ActivityStarting,
        now,
        startAt: null,
      }),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @activity/api test src/subscribe-messages/subscribe-message.schedule.spec.ts`

Expected: FAIL，找不到 `./subscribe-message.schedule`

- [ ] **Step 3: 实现到期时间**

`subscribe-message.schedule.ts`:

```ts
import { SubscribeMessageKind } from "@activity/shared";
import {
  SUBSCRIBE_REMINDER_LEAD_MS,
  SUBSCRIBE_STAGGER_MS,
} from "./subscribe-message.constants";

export function computeJobDueAt(input: {
  kind: (typeof SubscribeMessageKind)[keyof typeof SubscribeMessageKind];
  now: Date;
  startAt: Date | null;
}): Date | null {
  if (input.kind === SubscribeMessageKind.RegistrationConfirmed) {
    return input.now;
  }
  if (!input.startAt) {
    return null;
  }
  const reminderAt = new Date(
    input.startAt.getTime() - SUBSCRIBE_REMINDER_LEAD_MS,
  );
  const minDue = new Date(input.now.getTime() + SUBSCRIBE_STAGGER_MS);
  return reminderAt > input.now ? reminderAt : minDue;
}
```

- [ ] **Step 4: 再跑到期测试**

Run: `pnpm --filter @activity/api test src/subscribe-messages/subscribe-message.schedule.spec.ts`

Expected: PASS

- [ ] **Step 5: 写 payload 失败测试**

`subscribe-message.payload.spec.ts`:

```ts
import { SubscribeMessageKind } from "@activity/shared";
import { describe, expect, it } from "vitest";
import { buildSubscribeData } from "./subscribe-message.payload";

describe("buildSubscribeData", () => {
  it("truncates title and place to 20 code units and maps status", () => {
    const data = buildSubscribeData({
      kind: SubscribeMessageKind.RegistrationConfirmed,
      title: "一二三四五六七八九十abcdefghijk",
      startAt: new Date("2030-06-01T04:05:00.000Z"),
      place: "",
    });
    expect(data.thing1.value).toHaveLength(20);
    expect(data.thing3.value).toBe("地点待定");
    expect(data.phrase4.value).toBe("报名成功");
    expect(data.time2.value).toContain("年");
  });

  it("uses 即将开始 for activity_starting", () => {
    const data = buildSubscribeData({
      kind: SubscribeMessageKind.ActivityStarting,
      title: "夜跑",
      startAt: null,
      place: "滨江",
    });
    expect(data.phrase4.value).toBe("即将开始");
    expect(data.time2.value).toBe("时间待定");
    expect(data.thing3.value).toBe("滨江");
  });
});
```

- [ ] **Step 6: 跑 payload 测试确认失败**

Run: `pnpm --filter @activity/api test src/subscribe-messages/subscribe-message.payload.spec.ts`

Expected: FAIL，找不到模块

- [ ] **Step 7: 实现 payload**

`subscribe-message.payload.ts`（选完微信模板后只改 `SUBSCRIBE_DATA_KEYS`）：

```ts
import { SubscribeMessageKind } from "@activity/shared";

export const SUBSCRIBE_DATA_KEYS = {
  title: "thing1",
  startAt: "time2",
  place: "thing3",
  status: "phrase4",
} as const;

const TITLE_MAX = 20;
const PLACE_MAX = 20;

export type SubscribeDataFields = Record<string, { value: string }>;

function clip(value: string, max: number): string {
  return Array.from(value).slice(0, max).join("");
}

function formatStartAt(startAt: Date | null): string {
  if (!startAt) {
    return "时间待定";
  }
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(startAt);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${pick("year")}年${pick("month")}月${pick("day")}日 ${pick("hour")}:${pick("minute")}`;
}

export function buildSubscribeData(input: {
  kind: (typeof SubscribeMessageKind)[keyof typeof SubscribeMessageKind];
  title: string;
  startAt: Date | null;
  place: string | null;
}): SubscribeDataFields {
  const status =
    input.kind === SubscribeMessageKind.RegistrationConfirmed
      ? "报名成功"
      : "即将开始";
  const place = input.place?.trim() ? input.place.trim() : "地点待定";
  return {
    [SUBSCRIBE_DATA_KEYS.title]: { value: clip(input.title.trim() || "活动", TITLE_MAX) },
    [SUBSCRIBE_DATA_KEYS.startAt]: { value: formatStartAt(input.startAt) },
    [SUBSCRIBE_DATA_KEYS.place]: { value: clip(place, PLACE_MAX) },
    [SUBSCRIBE_DATA_KEYS.status]: { value: status },
  };
}

export function subscribePage(activityId: string): string {
  return `pages/activity/detail?id=${encodeURIComponent(activityId)}`;
}
```

- [ ] **Step 8: 再跑 payload 测试**

Run: `pnpm --filter @activity/api test src/subscribe-messages/subscribe-message.payload.spec.ts`

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/subscribe-messages
git commit -m "$(cat <<'EOF'
feat(api): 锁定订阅消息到期时间与模板字段语义

开场提醒相对报名成功错开至少一分钟，避免 43108；字段按微信长度截断。
EOF
)"
```

---

### Task 3: 入队 upsert

**Files:**
- Create: `apps/api/src/subscribe-messages/subscribe-message.jobs.ts`
- Create: `apps/api/src/subscribe-messages/subscribe-message.jobs.spec.ts`

- [ ] **Step 1: 写入队失败测试**

`subscribe-message.jobs.spec.ts`:

```ts
import { SubscribeMessageKind } from "@activity/shared";
import { SubscribeMessageJobStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SubscribeMessageJobs } from "./subscribe-message.jobs";

describe("SubscribeMessageJobs", () => {
  const tx = {
    subscribeMessageJob: {
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  const jobs = new SubscribeMessageJobs();
  const now = new Date("2030-06-01T12:00:00.000Z");

  beforeEach(() => {
    vi.clearAllMocks();
    tx.subscribeMessageJob.upsert.mockResolvedValue({});
    tx.subscribeMessageJob.updateMany.mockResolvedValue({ count: 1 });
  });

  it("enqueues confirmed and starting when startAt exists", async () => {
    await jobs.enqueueForConfirmed(tx as never, {
      registrationId: "r1",
      startAt: new Date("2030-06-02T12:00:00.000Z"),
      now,
    });
    expect(tx.subscribeMessageJob.upsert).toHaveBeenCalledTimes(2);
    const kinds = tx.subscribeMessageJob.upsert.mock.calls.map(
      (call) => (call[0] as { create: { kind: string } }).create.kind,
    );
    expect(kinds).toEqual([
      SubscribeMessageKind.RegistrationConfirmed,
      SubscribeMessageKind.ActivityStarting,
    ]);
  });

  it("skips activity_starting without startAt", async () => {
    await jobs.enqueueForConfirmed(tx as never, {
      registrationId: "r1",
      startAt: null,
      now,
    });
    expect(tx.subscribeMessageJob.upsert).toHaveBeenCalledTimes(1);
    expect(
      (tx.subscribeMessageJob.upsert.mock.calls[0][0] as { create: { kind: string } })
        .create.kind,
    ).toBe(SubscribeMessageKind.RegistrationConfirmed);
  });

  it("cancels pending jobs for a registration", async () => {
    await jobs.cancelPendingForRegistration(tx as never, "r1");
    expect(tx.subscribeMessageJob.updateMany).toHaveBeenCalledWith({
      where: {
        registrationId: "r1",
        status: SubscribeMessageJobStatus.pending,
      },
      data: { status: SubscribeMessageJobStatus.cancelled },
    });
  });

  it("cancels pending jobs for an activity", async () => {
    await jobs.cancelPendingForActivity(tx as never, "act1");
    expect(tx.subscribeMessageJob.updateMany).toHaveBeenCalledWith({
      where: {
        status: SubscribeMessageJobStatus.pending,
        registration: { activityId: "act1" },
      },
      data: { status: SubscribeMessageJobStatus.cancelled },
    });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @activity/api test src/subscribe-messages/subscribe-message.jobs.spec.ts`

Expected: FAIL，找不到 `SubscribeMessageJobs`

- [ ] **Step 3: 实现 Jobs**

`subscribe-message.jobs.ts`:

```ts
import { Injectable } from "@nestjs/common";
import { SubscribeMessageKind } from "@activity/shared";
import {
  Prisma,
  SubscribeMessageJobStatus,
  SubscribeMessageKind as PrismaSubscribeKind,
} from "@prisma/client";
import { computeJobDueAt } from "./subscribe-message.schedule";

@Injectable()
export class SubscribeMessageJobs {
  async enqueueForConfirmed(
    tx: Prisma.TransactionClient,
    input: { registrationId: string; startAt: Date | null; now: Date },
  ): Promise<void> {
    await this.upsertKind(tx, {
      registrationId: input.registrationId,
      kind: SubscribeMessageKind.RegistrationConfirmed,
      dueAt: computeJobDueAt({
        kind: SubscribeMessageKind.RegistrationConfirmed,
        now: input.now,
        startAt: input.startAt,
      }),
    });
    const reminderDue = computeJobDueAt({
      kind: SubscribeMessageKind.ActivityStarting,
      now: input.now,
      startAt: input.startAt,
    });
    if (!reminderDue) {
      return;
    }
    await this.upsertKind(tx, {
      registrationId: input.registrationId,
      kind: SubscribeMessageKind.ActivityStarting,
      dueAt: reminderDue,
    });
  }

  async cancelPendingForRegistration(
    tx: Prisma.TransactionClient,
    registrationId: string,
  ): Promise<void> {
    await tx.subscribeMessageJob.updateMany({
      where: {
        registrationId,
        status: SubscribeMessageJobStatus.pending,
      },
      data: { status: SubscribeMessageJobStatus.cancelled },
    });
  }

  async cancelPendingForActivity(
    tx: Prisma.TransactionClient,
    activityId: string,
  ): Promise<void> {
    await tx.subscribeMessageJob.updateMany({
      where: {
        status: SubscribeMessageJobStatus.pending,
        registration: { activityId },
      },
      data: { status: SubscribeMessageJobStatus.cancelled },
    });
  }

  private async upsertKind(
    tx: Prisma.TransactionClient,
    input: {
      registrationId: string;
      kind: (typeof SubscribeMessageKind)[keyof typeof SubscribeMessageKind];
      dueAt: Date | null;
    },
  ): Promise<void> {
    if (!input.dueAt) {
      return;
    }
    await tx.subscribeMessageJob.upsert({
      where: {
        registrationId_kind: {
          registrationId: input.registrationId,
          kind: input.kind as PrismaSubscribeKind,
        },
      },
      create: {
        registrationId: input.registrationId,
        kind: input.kind as PrismaSubscribeKind,
        dueAt: input.dueAt,
        status: SubscribeMessageJobStatus.pending,
        attemptCount: 0,
        lastError: null,
        sentAt: null,
      },
      update: {
        dueAt: input.dueAt,
        status: SubscribeMessageJobStatus.pending,
        attemptCount: 0,
        lastError: null,
        sentAt: null,
      },
    });
  }
}
```

若 Prisma 客户端把 shared 字符串枚举和 Prisma 枚举视为同一值，可去掉 `as PrismaSubscribeKind`。以 `prisma generate` 后的类型为准。

- [ ] **Step 4: 再跑入队测试**

Run: `pnpm --filter @activity/api test src/subscribe-messages/subscribe-message.jobs.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/subscribe-messages/subscribe-message.jobs.ts \
  apps/api/src/subscribe-messages/subscribe-message.jobs.spec.ts
git commit -m "$(cat <<'EOF'
feat(api): 报名确认时 upsert 订阅任务并可作废未发队列

取消后再次确认会刷新 dueAt，避免同一报名行唯一约束挡住重发。
EOF
)"
```

---

### Task 4: 发送端口与扫描服务

**Files:**
- Create: `apps/api/src/subscribe-messages/subscribe-message.port.ts`
- Create: `apps/api/src/subscribe-messages/fake-weixin-subscribe.ts`
- Create: `apps/api/src/subscribe-messages/weixin-subscribe.client.ts`
- Create: `apps/api/src/subscribe-messages/subscribe-message.service.ts`
- Create: `apps/api/src/subscribe-messages/subscribe-message.service.spec.ts`
- Create: `apps/api/src/subscribe-messages/subscribe-message.scanner.ts`
- Create: `apps/api/src/subscribe-messages/subscribe-messages.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/.env.example`

- [ ] **Step 1: 端口、fake、真实客户端**

`subscribe-message.port.ts`:

```ts
export const WEIXIN_SUBSCRIBE_PORT = Symbol("WEIXIN_SUBSCRIBE_PORT");

export class WeixinSubscribeSendError extends Error {
  constructor(
    public readonly errcode: number,
    message: string,
  ) {
    super(message);
  }
}

export type WeixinSubscribeSendInput = {
  openId: string;
  templateId: string;
  page: string;
  data: Record<string, { value: string }>;
  miniprogramState: string;
};

export interface WeixinSubscribePort {
  send(input: WeixinSubscribeSendInput): Promise<void>;
}
```

`fake-weixin-subscribe.ts`:

```ts
import {
  WeixinSubscribeSendError,
  type WeixinSubscribePort,
  type WeixinSubscribeSendInput,
} from "./subscribe-message.port";

export class FakeWeixinSubscribe implements WeixinSubscribePort {
  readonly sent: WeixinSubscribeSendInput[] = [];
  nextError: WeixinSubscribeSendError | Error | null = null;

  async send(input: WeixinSubscribeSendInput): Promise<void> {
    if (this.nextError) {
      const err = this.nextError;
      this.nextError = null;
      throw err;
    }
    this.sent.push(input);
  }
}
```

`weixin-subscribe.client.ts`:

```ts
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  WeixinSubscribeSendError,
  type WeixinSubscribePort,
  type WeixinSubscribeSendInput,
} from "./subscribe-message.port";

type TokenBody = {
  access_token?: string;
  expires_in?: number;
  errcode?: number;
  errmsg?: string;
};

type SendBody = { errcode?: number; errmsg?: string };

@Injectable()
export class WeixinSubscribeClient implements WeixinSubscribePort {
  private readonly logger = new Logger(WeixinSubscribeClient.name);
  private token: { value: string; expireAt: number } | null = null;

  constructor(private readonly config: ConfigService) {}

  async send(input: WeixinSubscribeSendInput): Promise<void> {
    const token = await this.getAccessToken();
    const url = `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${encodeURIComponent(token)}`;
    let body: SendBody;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          touser: input.openId,
          template_id: input.templateId,
          page: input.page,
          data: input.data,
          miniprogram_state: input.miniprogramState,
          lang: "zh_CN",
        }),
      });
      if (!res.ok) {
        throw new WeixinSubscribeSendError(res.status, `http ${res.status}`);
      }
      body = (await res.json()) as SendBody;
    } catch (error) {
      if (error instanceof WeixinSubscribeSendError) {
        throw error;
      }
      throw new WeixinSubscribeSendError(-1, "network");
    }
    if (body.errcode && body.errcode !== 0) {
      throw new WeixinSubscribeSendError(
        body.errcode,
        body.errmsg ?? "send failed",
      );
    }
  }

  private async getAccessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expireAt) {
      return this.token.value;
    }
    const appid = this.config.get<string>("WEIXIN_APPID") ?? "";
    const secret = this.config.get<string>("WEIXIN_SECRET") ?? "";
    const url = new URL("https://api.weixin.qq.com/cgi-bin/token");
    url.searchParams.set("grant_type", "client_credential");
    url.searchParams.set("appid", appid);
    url.searchParams.set("secret", secret);
    const res = await fetch(url);
    const body = (await res.json()) as TokenBody;
    if (!body.access_token) {
      this.logger.warn(`token ${body.errcode ?? "missing"}`);
      throw new WeixinSubscribeSendError(
        body.errcode ?? -1,
        "access_token missing",
      );
    }
    const ttlMs = Math.max((body.expires_in ?? 7200) - 120, 60) * 1000;
    this.token = { value: body.access_token, expireAt: Date.now() + ttlMs };
    return body.access_token;
  }
}
```

- [ ] **Step 2: 写扫描服务失败测试**

`subscribe-message.service.spec.ts` 覆盖规格 §8 的发送路径：成功 → `sent`；43101 → `skipped`；5xx 三次 → `skipped`；条件不满足 → `cancelled`；同一 openId 一轮只发一条。

```ts
import { SubscribeMessageKind } from "@activity/shared";
import {
  ActivityLifecycle,
  IdentityProvider,
  RegistrationStatus,
  SubscribeMessageJobStatus,
  SubscribeMessageKind as PrismaKind,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { FakeWeixinSubscribe } from "./fake-weixin-subscribe";
import { SubscribeMessageService } from "./subscribe-message.service";
import { WeixinSubscribeSendError } from "./subscribe-message.port";

function jobRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "job1",
    registrationId: "r1",
    kind: PrismaKind.registration_confirmed,
    dueAt: new Date("2030-06-01T12:00:00.000Z"),
    status: SubscribeMessageJobStatus.pending,
    attemptCount: 0,
    lastError: null,
    sentAt: null,
    registration: {
      id: "r1",
      status: RegistrationStatus.confirmed,
      userId: "u1",
      activityId: "act1",
      activity: {
        id: "act1",
        title: "夜跑",
        place: "滨江",
        startAt: new Date("2030-06-02T12:00:00.000Z"),
        endAt: new Date("2030-06-02T14:00:00.000Z"),
        lifecycle: ActivityLifecycle.published,
      },
      user: {
        identities: [{ provider: IdentityProvider.weixin, openId: "oid-1" }],
      },
    },
    ...overrides,
  };
}

describe("SubscribeMessageService", () => {
  const prisma = {
    subscribeMessageJob: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  };
  const weixin = new FakeWeixinSubscribe();
  const config = {
    get: (key: string) => {
      if (key === "WEIXIN_SUBSCRIBE_TMPL_REGISTRATION_CONFIRMED") return "tmpl-a";
      if (key === "WEIXIN_SUBSCRIBE_TMPL_ACTIVITY_STARTING") return "tmpl-b";
      if (key === "WEIXIN_SUBSCRIBE_MINIPROGRAM_STATE") return "developer";
      return undefined;
    },
  };
  let service: SubscribeMessageService;

  beforeEach(() => {
    vi.clearAllMocks();
    weixin.sent.length = 0;
    weixin.nextError = null;
    prisma.subscribeMessageJob.update.mockResolvedValue({});
    service = new SubscribeMessageService(
      prisma as unknown as PrismaService,
      weixin,
      config as never,
    );
  });

  it("marks sent on success", async () => {
    prisma.subscribeMessageJob.findMany.mockResolvedValue([jobRow()]);
    await service.scan(new Date("2030-06-01T12:00:00.000Z"));
    expect(weixin.sent).toHaveLength(1);
    expect(prisma.subscribeMessageJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: SubscribeMessageJobStatus.sent,
        }),
      }),
    );
  });

  it("skips 43101 without retry", async () => {
    prisma.subscribeMessageJob.findMany.mockResolvedValue([jobRow()]);
    weixin.nextError = new WeixinSubscribeSendError(43101, "not subscribed");
    await service.scan(new Date("2030-06-01T12:00:00.000Z"));
    expect(prisma.subscribeMessageJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: SubscribeMessageJobStatus.skipped,
        }),
      }),
    );
  });

  it("skips after 3 retryable failures", async () => {
    prisma.subscribeMessageJob.findMany.mockResolvedValue([
      jobRow({ attemptCount: 2 }),
    ]);
    weixin.nextError = new WeixinSubscribeSendError(43108, "busy");
    await service.scan(new Date("2030-06-01T12:00:00.000Z"));
    expect(prisma.subscribeMessageJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: SubscribeMessageJobStatus.skipped,
          attemptCount: 3,
        }),
      }),
    );
  });

  it("cancels when registration is not confirmed", async () => {
    prisma.subscribeMessageJob.findMany.mockResolvedValue([
      jobRow({
        registration: {
          ...jobRow().registration,
          status: RegistrationStatus.cancelled,
        },
      }),
    ]);
    await service.scan(new Date("2030-06-01T12:00:00.000Z"));
    expect(weixin.sent).toHaveLength(0);
    expect(prisma.subscribeMessageJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: SubscribeMessageJobStatus.cancelled,
        }),
      }),
    );
  });

  it("sends only one job per openId per tick", async () => {
    const first = jobRow({ id: "job1", kind: PrismaKind.registration_confirmed });
    const second = jobRow({
      id: "job2",
      kind: PrismaKind.activity_starting,
      registrationId: "r2",
      registration: {
        ...jobRow().registration,
        id: "r2",
      },
    });
    prisma.subscribeMessageJob.findMany.mockResolvedValue([first, second]);
    await service.scan(new Date("2030-06-01T12:00:00.000Z"));
    expect(weixin.sent).toHaveLength(1);
  });
});
```

- [ ] **Step 3: 跑扫描测试确认失败**

Run: `pnpm --filter @activity/api test src/subscribe-messages/subscribe-message.service.spec.ts`

Expected: FAIL，找不到 `SubscribeMessageService`

- [ ] **Step 4: 实现 Service + Scanner + Module**

`subscribe-message.service.ts` 要点：

- `scan(now)`：`findMany` where `status=pending` 且 `dueAt <= now`，`orderBy: { dueAt: "asc" }`，`take: SUBSCRIBE_SCAN_BATCH_SIZE`，include registration.activity、registration.user.identities。
- 无微信身份或对应模板 ID 空 → `skipped`。
- 报名非 `confirmed`，或活动非 `published`，或 `endAt` 存在且 `now >= endAt` → `cancelled`。
- `Set<string>` 记录本轮已发送的 openId。
- `send` 抛 `WeixinSubscribeSendError`：43101 / 40037 / 47003 → `skipped`；其余 `attemptCount+1`，`>= SUBSCRIBE_MAX_ATTEMPTS` 则 `skipped`，否则保持 `pending` 并写 `lastError`（截断 `LAST_ERROR_MAX_LENGTH`）。
- 模板 ID：`registration_confirmed` 用 `WEIXIN_SUBSCRIBE_TMPL_REGISTRATION_CONFIRMED`，另一用 `WEIXIN_SUBSCRIBE_TMPL_ACTIVITY_STARTING`。
- `miniprogram_state` 默认 `formal`。
- `page` 用 `subscribePage(activityId)`。

`subscribe-message.scanner.ts` 复制 `PaymentExpiryScanner` 结构，interval 用 `SUBSCRIBE_SCAN_INTERVAL_MS`，调用 `service.scan()`。test / VITEST 不启动。

`subscribe-messages.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { PrismaModule } from "../prisma/prisma.module";
import { FakeWeixinSubscribe } from "./fake-weixin-subscribe";
import { SubscribeMessageJobs } from "./subscribe-message.jobs";
import { SubscribeMessageScanner } from "./subscribe-message.scanner";
import { SubscribeMessageService } from "./subscribe-message.service";
import {
  WEIXIN_SUBSCRIBE_PORT,
  type WeixinSubscribePort,
} from "./subscribe-message.port";
import { WeixinSubscribeClient } from "./weixin-subscribe.client";

@Module({
  imports: [PrismaModule, ConfigModule],
  providers: [
    SubscribeMessageJobs,
    {
      provide: WEIXIN_SUBSCRIBE_PORT,
      useFactory: (config: ConfigService): WeixinSubscribePort => {
        const appid = config.get<string>("WEIXIN_APPID");
        const secret = config.get<string>("WEIXIN_SECRET");
        if (appid && secret) {
          return new WeixinSubscribeClient(config);
        }
        return new FakeWeixinSubscribe();
      },
      inject: [ConfigService],
    },
    SubscribeMessageService,
    SubscribeMessageScanner,
  ],
  exports: [SubscribeMessageJobs],
})
export class SubscribeMessagesModule {}
```

`SubscribeMessageService` 构造注入 `PrismaService`、`@Inject(WEIXIN_SUBSCRIBE_PORT)`、`ConfigService`。

`app.module.ts` 的 `imports` 加入 `SubscribeMessagesModule`（放在 `PaymentsModule` 旁即可）。

`.env.example` 追加：

```
WEIXIN_SUBSCRIBE_TMPL_REGISTRATION_CONFIRMED=
WEIXIN_SUBSCRIBE_TMPL_ACTIVITY_STARTING=
WEIXIN_SUBSCRIBE_MINIPROGRAM_STATE=developer
```

实现 `scan` 时，测试里「同一 openId 两条」第二条不要 `update` 成 sent/skipped，直接 `continue`。

- [ ] **Step 5: 再跑扫描测试**

Run: `pnpm --filter @activity/api test src/subscribe-messages/subscribe-message.service.spec.ts`

Expected: PASS。若失败，按断言补 `findMany` include 形状或 `update` 参数。

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/subscribe-messages apps/api/src/app.module.ts apps/api/.env.example
git commit -m "$(cat <<'EOF'
feat(api): 进程内扫描发送微信一次性订阅消息

发送失败不挡业务；43101 直接跳过，43108 与网络错误有限重试。
EOF
)"
```

---

### Task 5: 免费报名确认时入队

**Files:**
- Modify: `apps/api/src/registrations/registrations.module.ts`
- Modify: `apps/api/src/registrations/registrations.service.ts`
- Modify: `apps/api/src/registrations/registrations.service.spec.ts`

- [ ] **Step 1: 给 RegistrationsService 测试加上 Jobs mock，先写失败断言**

在 `registrations.service.spec.ts` 增加：

```ts
const subscribeMessageJobs = {
  enqueueForConfirmed: vi.fn(),
  cancelPendingForRegistration: vi.fn(),
  cancelPendingForActivity: vi.fn(),
};
```

`Test.createTestingModule` 的 providers 增加 `{ provide: SubscribeMessageJobs, useValue: subscribeMessageJobs }`。

给 `tx` 增加 `subscribeMessageJob` 不是必须（service 应调 Jobs 而不是直接写表）。

在现有 `"create confirms when capacity available"` 测试末尾追加：

```ts
expect(subscribeMessageJobs.enqueueForConfirmed).toHaveBeenCalledWith(
  tx,
  expect.objectContaining({
    registrationId: "r1",
    startAt: publishedFree.startAt,
  }),
);
```

在 `"returns alreadyRegistered when confirmed exists"`（或等价用例，断言 `alreadyRegistered === true` 的那条）追加：

```ts
expect(subscribeMessageJobs.enqueueForConfirmed).not.toHaveBeenCalled();
```

`RegistrationsService` 构造函数增加 `private readonly subscribeMessageJobs: SubscribeMessageJobs`。

- [ ] **Step 2: 跑报名测试确认新断言失败**

Run: `pnpm --filter @activity/api test src/registrations/registrations.service.spec.ts`

Expected: Nest 注入失败或 `enqueueForConfirmed` 未被调用

- [ ] **Step 3: 实现入队**

`registrations.module.ts`：`imports` 加 `SubscribeMessagesModule`。

给 `confirmFreeRegistration` 增加参数 `startAt: Date | null`，由 `create` 传入 `activity.startAt`。在 `create` / `update` 为 `confirmed` 之后、return 之前：

```ts
await this.subscribeMessageJobs.enqueueForConfirmed(tx, {
  registrationId: created.id,
  startAt,
  now: new Date(),
});
```

`update` 那条分支用 `updated.id`。

`alreadyRegistered: true` 的提前 return 不要调用 enqueue。

`cancel` 的免费事务里，在把报名改为 `cancelled` 之后：

```ts
await this.subscribeMessageJobs.cancelPendingForRegistration(tx, id);
```

- [ ] **Step 4: 补 cancel 测试**

在 `registrations.service.spec.ts` 已有的免费取消成功用例末尾：

```ts
expect(subscribeMessageJobs.cancelPendingForRegistration).toHaveBeenCalledWith(
  tx,
  expect.any(String),
);
```

若该用例没有走 `$transaction`，按实际调用参数改。

收费 `pending_payment` 创建用例确认 **没有** `enqueueForConfirmed`。

- [ ] **Step 5: 跑报名测试**

Run: `pnpm --filter @activity/api test src/registrations/registrations.service.spec.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/registrations
git commit -m "$(cat <<'EOF'
feat(api): 免费报名确认后入队订阅任务，取消则作废未发

收费待支付不入队；已确认幂等返回也不重复入队。
EOF
)"
```

---

### Task 6: 支付确认入队，退款/关活动作废

**Files:**
- Modify: `apps/api/src/payments/payments.module.ts`
- Modify: `apps/api/src/payments/payments.service.ts`
- Modify: `apps/api/src/payments/payments.service.spec.ts`
- Modify: `apps/api/src/activities/activities.module.ts`
- Modify: `apps/api/src/registrations/prisma-registration-cancel.hook.ts`
- Modify: `apps/api/src/registrations/prisma-registration-cancel.hook.spec.ts`

- [ ] **Step 1: PaymentsService 注入 Jobs，测试里 mock**

`payments.service.spec.ts` 增加 `subscribeMessageJobs` mock，providers 提供 `SubscribeMessageJobs`。

找到「支付成功把报名改为 confirmed」的用例，断言 `enqueueForConfirmed` 被调用。找到「已是 paid 直接返回」的用例，断言 **没有** enqueue。

- [ ] **Step 2: 跑支付测试确认失败**

Run: `pnpm --filter @activity/api test src/payments/payments.service.spec.ts`

Expected: 注入失败或 enqueue 未被调用

- [ ] **Step 3: 在确认支付的事务里入队**

`payments.module.ts` `imports` 加 `SubscribeMessagesModule`；`PaymentsService` 工厂 `inject` 增加 `SubscribeMessageJobs` 并传入构造函数。

在 `confirmPaid` 的 `$transaction` 里，报名 `update` 为 `confirmed` 之后：

```ts
const activity = await tx.activity.findUnique({
  where: { id: order.registration.activityId },
  select: { startAt: true },
});
await this.subscribeMessageJobs.enqueueForConfirmed(tx, {
  registrationId: order.registrationId,
  startAt: activity?.startAt ?? null,
  now,
});
```

`confirmPaid` 里 `include: { registration: true }` 已有 `activityId`。若 `order.registration` 在该路径存在，用它。`existing?.status === paid` 的早期 return 不要 enqueue。

`confirmPaidInTransaction` 同样在报名改为 `confirmed` 且 `confirmed = true` 的分支入队。需要在事务内读 `activity.startAt`：用 `tx.registration.findUnique({ where: { id: order.registrationId }, select: { activity: { select: { startAt: true } } } })`。

`refundPaid` 成功事务里，报名改为 `cancelled` 之后：

```ts
await this.subscribeMessageJobs.cancelPendingForRegistration(
  tx,
  order.registrationId,
);
```

- [ ] **Step 4: 关活动 hook 作废队列**

`PrismaRegistrationCancelHook` 注入 `SubscribeMessageJobs`。`ActivitiesModule` `imports` 加 `SubscribeMessagesModule`。

`cancelAllForActivity` 与 `closeActivity` 在取消报名之后：

```ts
await this.prisma.$transaction(async (tx) => {
  await this.subscribeMessageJobs.cancelPendingForActivity(tx, activityId);
});
```

若不想另开事务，把 `cancelPendingForActivity` 做成同时接受 `PrismaService`：给 Jobs 增加

```ts
async cancelPendingForActivityId(activityId: string): Promise<void> {
  await this.prisma.subscribeMessageJob.updateMany({
    where: {
      status: SubscribeMessageJobStatus.pending,
      registration: { activityId },
    },
    data: { status: SubscribeMessageJobStatus.cancelled },
  });
}
```

需要给 `SubscribeMessageJobs` 注入 `PrismaService`，`cancelPendingForActivityId` 走 `this.prisma`，事务版仍走 `tx`。测试里 hook 的 mock 增加 `cancelPendingForActivityId`。

hook spec：`cancelAllForActivity` / `closeActivity` 结束时 `expect(subscribeMessageJobs.cancelPendingForActivityId).toHaveBeenCalledWith("act-1")`。

- [ ] **Step 5: 跑支付与 hook 测试**

Run:

```
pnpm --filter @activity/api test src/payments/payments.service.spec.ts src/registrations/prisma-registration-cancel.hook.spec.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/payments apps/api/src/activities/activities.module.ts \
  apps/api/src/registrations/prisma-registration-cancel.hook.ts \
  apps/api/src/registrations/prisma-registration-cancel.hook.spec.ts \
  apps/api/src/subscribe-messages/subscribe-message.jobs.ts
git commit -m "$(cat <<'EOF'
feat(api): 支付确认后入队订阅，退款和下架作废未发任务

收费报名与免费报名共用同一队列语义，关闭活动不会再发开场提醒。
EOF
)"
```

---

### Task 7: 小程序授权适配

**Files:**
- Create: `apps/mp/src/adapters/subscribe.ts`
- Modify: `apps/mp/src/pages/register/index.vue`
- Modify: `apps/mp/.env.example`

- [ ] **Step 1: 适配层**

`apps/mp/src/adapters/subscribe.ts`:

```ts
function configuredTmplIds(): string[] {
  const ids = [
    import.meta.env.VITE_WEIXIN_SUBSCRIBE_TMPL_REGISTRATION_CONFIRMED,
    import.meta.env.VITE_WEIXIN_SUBSCRIBE_TMPL_ACTIVITY_STARTING,
  ];
  return ids
    .map((id) => (typeof id === "string" ? id.trim() : ""))
    .filter((id) => id.length > 0);
}

export async function requestRegistrationSubscribe(): Promise<void> {
  const tmplIds = configuredTmplIds();
  if (tmplIds.length === 0) {
    return;
  }
  // #ifdef MP-WEIXIN
  await new Promise<void>((resolve) => {
    uni.requestSubscribeMessage({
      tmplIds,
      complete: () => resolve(),
    });
  });
  // #endif
}
```

H5 无 `MP-WEIXIN` 分支，函数在 `tmplIds` 非空时也会直接返回（ifndef 后无 await）。为避免 H5 在配了 ID 时卡住：把 `uni.requestSubscribeMessage` 整段包在 `#ifdef MP-WEIXIN`，H5 在检查 tmplIds 后直接 `return`。

- [ ] **Step 2: 报名页点击**

`onSubmit` 在 `validate()` 成功、`promptLogin` 成功之后、`createRegistration` 之前：

```ts
  try {
    await requestRegistrationSubscribe();
  } catch {
    // 授权失败不挡报名
  }

  submitting.value = true;
  try {
    const result = await createRegistration({
```

`requestSubscribeMessage` 必须发生在用户点击调用栈里。因此 **不要** 先 `submitting.value = true` 再 `await` 其它会让出点击上下文的 UI。顺序固定为：校验 → 登录（若已登录则同步返回）→ `requestRegistrationSubscribe` → 再设 `submitting` → API。

若 `promptLogin` 可能弹窗，授权会不在「提交」点击之后。规格要求跟在报名按钮点击后。已登录用户 `promptLogin` 应立即 true。未登录会先登录再回来，用户需再次点提交才会授权——这可接受：第二次点击才订阅。保持「授权紧贴本次提交点击」：`promptLogin` 失败则 return；只有 `user.isLoggedIn` 已为 true 时才在本次点击里调订阅。

实现：

```ts
async function onSubmit() {
  if (!activity.value || !activityId.value || submitting.value) return;
  const err = validate();
  if (err) {
    uni.showToast({ title: err, icon: "none" });
    return;
  }
  if (!user.isLoggedIn) {
    await user.promptLogin("登录后才能报名");
    return;
  }
  const submitted = { name: name.value.trim(), phone: phone.value.trim() };
  try {
    await requestRegistrationSubscribe();
  } catch {
    /* ignore */
  }
  submitting.value = true;
  try {
    const result = await createRegistration({
      activityId: activityId.value,
      ...submitted,
    });
    // ... 其余保持原逻辑
```

文件顶部增加：`import { requestRegistrationSubscribe } from "@/adapters/subscribe";`

- [ ] **Step 3: env example**

`apps/mp/.env.example` 追加：

```
VITE_WEIXIN_SUBSCRIBE_TMPL_REGISTRATION_CONFIRMED=
VITE_WEIXIN_SUBSCRIBE_TMPL_ACTIVITY_STARTING=
```

- [ ] **Step 4: mp 类型检查（若有）**

Run: `pnpm --filter @activity/mp exec vue-tsc --noEmit` 或仓库里现成的 mp type-check 脚本。

Expected: 无因 subscribe 适配层产生的错误。若包没有该脚本，改为 `pnpm --filter @activity/api type-check` 确认 API 仍过。

- [ ] **Step 5: Commit**

```bash
git add apps/mp/src/adapters/subscribe.ts apps/mp/src/pages/register/index.vue apps/mp/.env.example
git commit -m "$(cat <<'EOF'
feat(mp): 报名点击时申请报名成功与开场提醒授权

授权失败继续提交；H5 与未配置模板时不调微信。
EOF
)"
```

---

### Task 8: 回归与文档勾选

**Files:**
- Modify: `docs/roadmap.md`
- Modify: `docs/adr/0015-subscribe-message.md`（实现完成后改 Implemented，本 task 若代码已齐再改）

- [ ] **Step 1: 跑 API 全量单测**

Run: `pnpm --filter @activity/api test`

Expected: 全部 PASS

- [ ] **Step 2: API type-check**

Run: `pnpm --filter @activity/api type-check`

Expected: 退出码 0

- [ ] **Step 3: 手测清单（真机 / 开发者工具）**

1. 微信：配置两个 tmplId，点报名，弹窗同意两个，免费报名后服务通知出现报名成功（扫描约 1 分钟内）。
2. 只开「开场提醒」：报名成功，无报名成功通知，不报错。
3. 全拒：报名成功。
4. 收费：待支付不通知；支付成功后才入队。
5. H5：无授权弹窗，报名成功。
6. 取消报名后，开场提醒不再发送。
7. 模板 ID 留空：报名成功，job 扫描后 `skipped`。

- [ ] **Step 4: 勾选 roadmap，ADR → Implemented**

`docs/roadmap.md` P1-4 两项改为 `[x]`。

`docs/adr/0015-subscribe-message.md` 状态改为 `Implemented`，实现备注补入口路径。`docs/adr/README.md` 同步状态。规格文首状态改为 Implemented。

- [ ] **Step 5: Commit**

```bash
git add docs/roadmap.md docs/adr/0015-subscribe-message.md docs/adr/README.md \
  docs/superpowers/specs/2026-11-02-subscribe-message-design.md
git commit -m "$(cat <<'EOF'
docs: 将 P1-4 订阅消息标记为已实现

ADR-0015 与 roadmap 勾选对齐已落地的入队、扫描与报名授权。
EOF
)"
```

---

## 规格覆盖

| 规格 | Task |
| --- | --- |
| §3 Job 表与 upsert | 1, 3 |
| §3.3 入队时机（免费 / 支付 / 幂等 / 无 startAt） | 5, 6 |
| §3.4 作废 | 5, 6 |
| §4 扫描、同一 openId、条件再判 | 4 |
| §5 字段与环境变量 | 2, 4, 7 |
| §6 失败分级 | 4 |
| §7 小程序授权 | 7 |
| §8 测试清单 | 2–6, 8 |
| 无 Redis/MQ、Admin 不改 | 全程 |

选微信模板、把真实 `template_id` 填进环境变量，属于发布配置，不阻塞本计划合并。

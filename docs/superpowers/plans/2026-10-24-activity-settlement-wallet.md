# 活动结算入账 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 活动结束、取消或下架且退款都完成后，把扣完抽成的净额记入发布者可用余额；个人页只展示待结算和可用余额。

**Architecture:** 待结算是查询时按未结算活动的支付单和退款单加总，不写钱包。结算扫描在单进程定时执行，每个活动一条 `ActivitySettlement`。净额大于 0 时追加一条 `settlement_credit`。没有提现，也没有冻结余额。

**Tech Stack:** NestJS 11、Prisma 6、PostgreSQL、Vitest、`@activity/shared`、uni-app

**前置文档：** [设计规格](../specs/2026-10-24-paid-registration-and-settlement-design.md)、[支付计划](./2026-10-24-paid-registration-payment.md)、ADR-0014。支付单和退款单必须已经存在。

**本计划不做：** 提现接口、微信商家转账、支付宝、Admin 改余额、调账入口。

---

## 文件结构

```text
apps/api/prisma/schema.prisma
apps/api/prisma/migrations/20261024140000_activity_settlement_wallet/migration.sql

apps/api/src/settlement/fee.ts
apps/api/src/settlement/fee.spec.ts
apps/api/src/settlement/settlement.service.ts
apps/api/src/settlement/settlement.service.spec.ts
apps/api/src/settlement/settlement.scanner.ts
apps/api/src/settlement/wallet.controller.ts
apps/api/src/settlement/settlement.module.ts

apps/api/src/payments/payments.service.ts     # 已有结算单则拒绝退款
apps/api/src/app.module.ts

apps/mp/src/api/wallet.ts
apps/mp/src/pages/mine/profile.vue            # 或 mine 首页，展示两个金额，无提现按钮
```

---

### Task 1: 抽成纯函数（TDD）

**Files:**
- Create: `apps/api/src/settlement/fee.ts`
- Create: `apps/api/src/settlement/fee.spec.ts`

- [ ] **Step 1: 失败测试**

```ts
import { describe, expect, it } from "vitest";
import { settlementAmounts } from "./fee";

describe("settlementAmounts", () => {
  it("rounds half up to cents", () => {
    expect(settlementAmounts(1001, 0, 150)).toEqual({
      collectedCents: 1001,
      feeCents: 15,
      netCents: 986,
    });
  });

  it("treats null and negative bps as 0", () => {
    expect(settlementAmounts(500, 100, null).feeCents).toBe(0);
    expect(settlementAmounts(500, 0, -1).netCents).toBe(500);
  });

  it("caps bps at 10000 and never returns a negative net", () => {
    expect(settlementAmounts(200, 50, 20000)).toEqual({
      collectedCents: 150,
      feeCents: 150,
      netCents: 0,
    });
  });
});
```

`1001 * 150 / 10000 = 15.015`，四舍五入为 15。`20000` bps 先收成 10000，抽成等于实收。

- [ ] **Step 2: RED**

Run: `pnpm --filter @activity/api exec vitest run src/settlement/fee.spec.ts`  
Expected: FAIL，找不到模块。

- [ ] **Step 3: 实现**

```ts
export function settlementAmounts(
  grossCents: number,
  refundedCents: number,
  platformFeeBps: number | null,
) {
  const collectedCents = grossCents - refundedCents;
  const bps = Math.min(10000, Math.max(0, platformFeeBps ?? 0));
  const rawFee = Math.round((collectedCents * bps) / 10000);
  const feeCents = Math.min(collectedCents, Math.max(0, rawFee));
  return {
    collectedCents,
    feeCents,
    netCents: collectedCents - feeCents,
  };
}
```

- [ ] **Step 4: GREEN**

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/settlement/fee.ts apps/api/src/settlement/fee.spec.ts
git commit -m "feat(api): 结算抽成按分四舍五入"
```

---

### Task 2: 钱包与结算表

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20261024140000_activity_settlement_wallet/migration.sql`

- [ ] **Step 1: schema**

```prisma
enum LedgerEntryType {
  settlement_credit
}

model WalletAccount {
  id              String        @id @default(cuid())
  userId          String        @unique
  availableCents  Int           @default(0)
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  user            User          @relation(fields: [userId], references: [id])
  entries         LedgerEntry[]
}

model LedgerEntry {
  id                   String          @id @default(cuid())
  accountId            String
  type                 LedgerEntryType
  availableDeltaCents  Int
  availableAfterCents  Int
  idempotencyKey       String          @unique
  refType              String
  refId                String
  createdAt            DateTime        @default(now())
  account              WalletAccount   @relation(fields: [accountId], references: [id])
}

model ActivitySettlement {
  id              String   @id @default(cuid())
  activityId      String   @unique
  ownerUserId     String
  grossCents      Int
  refundedCents   Int
  platformFeeBps  Int
  feeCents        Int
  netCents        Int
  ledgerEntryId   String?  @unique
  createdAt       DateTime @default(now())
  activity        Activity @relation(fields: [activityId], references: [id])
  owner           User     @relation(fields: [ownerUserId], references: [id])
}
```

`User` 增加 `wallet WalletAccount?` 与 `settlements ActivitySettlement[]`。`Activity` 增加 `settlement ActivitySettlement?`。

`availableCents` 在数据库用检查约束 `>= 0`。迁移里写 `CHECK ("availableCents" >= 0)`。

- [ ] **Step 2: 生成客户端**

Run: `pnpm --filter @activity/api prisma:generate`

- [ ] **Step 3: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20261024140000_activity_settlement_wallet
git commit -m "feat(api): 增加发布者现金账户与活动结算单"
```

---

### Task 3: 结算扫描（TDD）

**Files:**
- Create: `apps/api/src/settlement/settlement.service.ts`
- Create: `apps/api/src/settlement/settlement.service.spec.ts`
- Create: `apps/api/src/settlement/settlement.scanner.ts`
- Create: `apps/api/src/settlement/settlement.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/payments/payments.service.ts`

- [ ] **Step 1: 失败测试**

| 测试 | 断言 |
| --- | --- |
| 已结束、两笔 paid 共 1000、无退款、bps 1000 | `feeCents=100`，`netCents=900`，可用余额 900，流水一条 |
| 再跑一次 | 仍一条结算单，余额不变 |
| 全部退款 | 结算单 `netCents=0`，`ledgerEntryId` 为空，不创建钱包 |
| `platformFeeBps` 为 null | 按 0，净额等于实收 |
| 仍有 `pending` 支付单 | 不写结算单；先调用 `closeIfExpired` 或活动关闭关单 |
| 仍有 `failed` 退款 | 不写结算单 |
| `lifecycle=draft` 且 `endAt` 未到 | 不写结算单 |
| `lifecycle=removed` 且退款已成功 | 净额 0 的结算单 |
| `endAt` 已过之后 `refundPaid` | 抛 `REFUND_NOT_ALLOWED` |
| 已有结算单之后 `refundPaid` | 抛 `REFUND_NOT_ALLOWED` |

`grossCents` 统计状态为 `paid` 或 `refunded` 的支付单。`refundedCents` 只统计 `succeeded` 退款。

- [ ] **Step 2: RED**

Run: `pnpm --filter @activity/api exec vitest run src/settlement/settlement.service.spec.ts src/payments/payments.service.spec.ts`

- [ ] **Step 3: 实现 `settleActivity(activityId)`**

在一个事务里锁活动行。不满足规格 §6 的条件则返回 `{ settled: false }`。满足则插入结算单。`netCents > 0` 时 `INSERT WalletAccount ... ON CONFLICT DO NOTHING`，再 `SELECT ... FOR UPDATE`，插入 `idempotencyKey = settlement:${activityId}` 的流水，并把 `availableCents` 加上净额。唯一约束冲突时整笔事务回滚到「已有结算单」的结果，不第二次加余额。

`SettlementScanner` 使用 `@Interval(60_000)`，找出收费且没有结算单、并且（`endAt <= now` 或生命周期为 `cancelled`/`removed`）的活动，逐个 `settleActivity`。单场失败只记 `activityId`。

`PaymentsService.refundPaid` 开头：活动已有 `ActivitySettlement`，或 `now >= endAt` 且原因是 `user_cancel`，抛 `RefundNotAllowed`。`activity_closed` 在 `endAt` 之后仍允许，直到结算单写上；结算单写上后两种原因都拒绝。

- [ ] **Step 4: GREEN**

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/settlement apps/api/src/payments/payments.service.ts apps/api/src/app.module.ts
git commit -m "feat(api): 活动结束将净额记入发布者可用余额"
```

---

### Task 4: 余额查询

**Files:**
- Create: `apps/api/src/settlement/wallet.controller.ts`
- Modify: `apps/api/src/settlement/settlement.service.ts`
- Modify: `apps/api/src/settlement/settlement.service.spec.ts`

- [ ] **Step 1: 失败测试**

`getWallet(userId)`：

- 没有钱包：`availableCents` 为 0。
- 有钱包：返回 `availableCents`。
- `pendingCents` 等于该用户名下、`feeType=paid`、没有结算单的活动的预估之和。预估使用 `settlementAmounts` 和活动当前 `platformFeeBps`。
- 已有结算单的活动不计入 `pendingCents`。
- 响应只有这两个数字，没有提现字段。

- [ ] **Step 2: 实现**

`GET /me/wallet`，`UserJwtGuard`。控制器放在 `WalletController`，路径 `me/wallet`。注意不要与 `AuthController` 的 `GET /me` 冲突：在模块里把该控制器注册清楚，Nest 以完整路径区分 `me` 与 `me/wallet`。若路由冲突，把方法放到 `AuthController` 的 `@Get("wallet")`，但计算仍调用 `SettlementService.getWallet`。

- [ ] **Step 3: GREEN 并 Commit**

```bash
git add apps/api/src/settlement
git commit -m "feat(api): 发布者可查询待结算预估与可用余额"
```

---

### Task 5: 小程序展示

**Files:**
- Create: `apps/mp/src/api/wallet.ts`
- Modify: `apps/mp/src/pages/mine/profile.vue`

- [ ] **Step 1: 请求**

```ts
export type WalletView = {
  availableCents: number;
  pendingCents: number;
};

export function getWallet() {
  return request<WalletView>({ url: "/me/wallet" });
}
```

沿用 `apps/mp/src/api` 里现有的 `request` 封装，不要新写 HTTP 客户端。

- [ ] **Step 2: 个人页**

`onShow` 拉取钱包。把分格式化为元，保留两位小数。展示「待结算」和「可用余额」。不放提现按钮，不放金额输入框。请求失败时两项显示 `--`，不把失败当成 0 元。

- [ ] **Step 3: Commit**

```bash
git add apps/mp/src/api/wallet.ts apps/mp/src/pages/mine/profile.vue
git commit -m "feat(mp): 个人页展示待结算与可用余额"
```

---

### Task 6: 文档收口

**Files:**
- Modify: `docs/adr/0014-paid-registration-and-settlement.md`
- Modify: `docs/roadmap.md`

- [ ] **Step 1: 实现完成后**

两份计划的测试都通过后，把 ADR-0014 状态改为 `Implemented`，并在实现备注里指向 `apps/api/src/payments` 与 `apps/api/src/settlement`。roadmap P1-3 两项勾选。规格文首状态改为 Implemented。

- [ ] **Step 2: Commit**

```bash
git add docs/adr/0014-paid-registration-and-settlement.md docs/adr/README.md docs/roadmap.md docs/superpowers/specs/2026-10-24-paid-registration-and-settlement-design.md
git commit -m "docs: 收费报名与结算入账标记为已实现"
```

---

## 计划自检

| 规格 | 任务 |
| --- | --- |
| §2 抽成与快照 | Task 1、Task 3 把当时的 bps 写入结算单 |
| §4.4–4.6 | Task 2、Task 3 |
| §6 结束才结算、草稿不结算、退款未完成不结算 | Task 3 |
| 结算后拒绝退款 | Task 3 修改 `refundPaid` |
| `GET /me/wallet` | Task 4 |
| 小程序无提现 | Task 5 |
| 提现、支付宝、Admin | 无任务 |

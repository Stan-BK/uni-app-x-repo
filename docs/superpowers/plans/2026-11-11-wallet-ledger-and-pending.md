# 钱包余额明细与待结算列表 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 小程序从「我的」双金额入口进入同一钱包页，只读查看余额流水与待结算活动列表（不含提现）。

**Architecture:** 沿用 `SettlementService` / `WalletController`。抽取「未结算收费活动预估净额」为内部可复用计算，供 `getWallet` 合计与 `listPending` 列表共用。`listLedger` 读本人 `LedgerEntry` 并解析活动标题。小程序新增 `pages/mine/wallet`（顶栏双金额 + Tab）。

**Tech Stack:** NestJS 11、Prisma 6、Vitest、`@activity/shared`、uni-app Vue3

**前置文档：** [设计规格](../specs/2026-11-11-wallet-ledger-and-pending-design.md)、[ADR-0014](../../adr/0014-paid-registration-and-settlement.md) 决策 8、[结算入账计划](./2026-10-24-activity-settlement-wallet.md)

**本计划不做：** 提现、新出账 `LedgerEntryType`、Admin 改余额、改结算公式。

---

## 文件结构

```text
packages/shared/src/wallet.ts                          # 新建：流水类型与展示文案
packages/shared/src/index.ts                           # 导出 wallet

apps/api/src/settlement/settlement.service.ts           # listLedger / listPending；抽 pending 行计算
apps/api/src/settlement/settlement.service.spec.ts      # 扩测
apps/api/src/settlement/dto/list-wallet-page.query.ts   # page/pageSize
apps/api/src/settlement/wallet.controller.ts            # GET ledger / pending

apps/mp/src/api/wallet.ts                              # 三个请求与类型
apps/mp/src/pages/mine/wallet.vue                      # 新建钱包页
apps/mp/src/pages.json                                 # 注册页面
apps/mp/src/pages/mine/registrations.vue               # 双入口 navigateTo

docs/roadmap.md                                        # checklist
docs/adr/0014-paid-registration-and-settlement.md      # 修订标 Implemented
docs/superpowers/specs/2026-11-11-wallet-ledger-and-pending-design.md
```

---

### Task 1: shared 钱包类型与文案

**Files:**
- Create: `packages/shared/src/wallet.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: 新增类型文件**

```ts
/** 与 Prisma LedgerEntryType 对齐；本阶段仅 settlement_credit */
export const LedgerEntryType = {
  SettlementCredit: "settlement_credit",
} as const;
export type LedgerEntryType =
  (typeof LedgerEntryType)[keyof typeof LedgerEntryType];

export const LEDGER_ENTRY_TYPE_LABEL: Record<LedgerEntryType, string> = {
  settlement_credit: "结算入账",
};

export type WalletView = {
  availableCents: number;
  pendingCents: number;
};

export type WalletLedgerItem = {
  id: string;
  type: LedgerEntryType;
  availableDeltaCents: number;
  availableAfterCents: number;
  createdAt: string;
  title: string;
  activityId: string | null;
};

export type WalletPendingItem = {
  activityId: string;
  title: string;
  pendingCents: number;
  endAt: string;
  lifecycle: string;
};

export type WalletPaged<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};
```

- [ ] **Step 2: 导出**

在 `packages/shared/src/index.ts` 增加：`export * from "./wallet";`

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/wallet.ts packages/shared/src/index.ts
git commit -m "feat(shared): 钱包流水与待结算列表共享类型"
```

---

### Task 2: 抽取 pending 行计算并实现 listPending / listLedger（TDD）

**Files:**
- Modify: `apps/api/src/settlement/settlement.service.ts`
- Modify: `apps/api/src/settlement/settlement.service.spec.ts`

- [ ] **Step 1: 在 `getWallet` describe 旁增加失败测试**

在 `settlement.service.spec.ts` 追加（复用文件内已有 `createOwner` / `createPaidActivity` / `createPaidOrder` / `now` 等 helper）：

```ts
describe("listLedger", () => {
  it("returns empty page when user has no wallet account", async () => {
    const owner = await createOwner();
    const result = await settlementService.listLedger(owner.id, {});
    expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
  });

  it("returns settlement_credit row with activityId and title after settle", async () => {
    const owner = await createOwner();
    const guest = await createParticipant();
    const activity = await createPaidActivity(owner.id, {
      platformFeeBps: 1000,
      title: "周末徒步",
    });
    await createPaidOrder(activity.id, guest.id, 1000);
    await settlementService.settleActivity(activity.id, now);

    const result = await settlementService.listLedger(owner.id, {});
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      type: LedgerEntryType.settlement_credit,
      availableDeltaCents: 900,
      activityId: activity.id,
      title: "周末徒步",
    });
    expect(result.items[0].createdAt).toBeTruthy();
  });

  it("uses placeholder title when activity is missing", async () => {
    const owner = await createOwner();
    const account = await prisma.walletAccount.create({
      data: { userId: owner.id, availableCents: 100 },
    });
    await prisma.ledgerEntry.create({
      data: {
        accountId: account.id,
        type: LedgerEntryType.settlement_credit,
        availableDeltaCents: 100,
        availableAfterCents: 100,
        idempotencyKey: `settlement:orphan-${owner.id}`,
        refType: "activity",
        refId: "activity_does_not_exist",
      },
    });

    const result = await settlementService.listLedger(owner.id, {});
    expect(result.items[0].title).toBe("活动已删除");
    expect(result.items[0].activityId).toBe("activity_does_not_exist");
  });
});

describe("listPending", () => {
  it("lists unsettled paid activities with pendingCents matching getWallet sum", async () => {
    const owner = await createOwner();
    const guest = await createParticipant();
    const a1 = await createPaidActivity(owner.id, {
      platformFeeBps: 1000,
      title: "先结束",
      endAt: new Date("2030-07-10T12:00:00.000Z"),
    });
    const a2 = await createPaidActivity(owner.id, {
      platformFeeBps: 1000,
      title: "后结束",
      endAt: new Date("2030-07-20T12:00:00.000Z"),
    });
    await createPaidOrder(a1.id, guest.id, 400);
    await createPaidOrder(a2.id, guest.id, 600);

    const wallet = await settlementService.getWallet(owner.id);
    const pending = await settlementService.listPending(owner.id, {});
    expect(pending.items.map((i) => i.activityId)).toEqual([a1.id, a2.id]);
    expect(pending.items.reduce((s, i) => s + i.pendingCents, 0)).toBe(
      wallet.pendingCents,
    );
    expect(pending.items[0].title).toBe("先结束");
    expect(pending.items[0].pendingCents).toBe(360);
    expect(pending.items[1].pendingCents).toBe(540);
  });

  it("excludes settled activities from pending list", async () => {
    const owner = await createOwner();
    const guest = await createParticipant();
    const settled = await createPaidActivity(owner.id, {
      platformFeeBps: 1000,
    });
    await createPaidOrder(settled.id, guest.id, 1000);
    await settlementService.settleActivity(settled.id, now);

    const unsettled = await createPaidActivity(owner.id, {
      platformFeeBps: 1000,
    });
    await createPaidOrder(unsettled.id, guest.id, 200);

    const pending = await settlementService.listPending(owner.id, {});
    expect(pending.items.map((i) => i.activityId)).toEqual([unsettled.id]);
    expect(pending.items[0].pendingCents).toBe(180);
  });
});
```

若 `createPaidActivity` 尚不接受 `title` / 自定义 `endAt`，在 helper 上增加可选参数（与现有 options 合并），不要新造第二套建活动函数。

- [ ] **Step 2: RED**

Run: `pnpm --filter @activity/api exec vitest run src/settlement/settlement.service.spec.ts`  
Expected: FAIL（`listLedger` / `listPending` 不存在）。

- [ ] **Step 3: 实现服务方法**

在 `settlement.service.ts`：

1. 将 `getWallet` 里「查未结算 paid 活动 → 算净额」抽成私有方法，例如：

```ts
private async loadPendingRows(userId: string): Promise<
  Array<{
    activityId: string;
    title: string;
    endAt: Date;
    lifecycle: ActivityLifecycle;
    pendingCents: number;
  }>
> {
  const unsettledActivities = await this.prisma.activity.findMany({
    where: {
      ownerUserId: userId,
      feeType: FeeType.paid,
      settlement: { is: null },
    },
    select: {
      id: true,
      title: true,
      endAt: true,
      lifecycle: true,
      platformFeeBps: true,
    },
    orderBy: { endAt: "asc" },
  });

  const rows = [];
  for (const activity of unsettledActivities) {
    // 与现 getWallet 相同的 paidOrders / succeededRefunds 聚合
    const { netCents } = settlementAmounts(
      grossCents,
      refundedCents,
      activity.platformFeeBps,
    );
    rows.push({
      activityId: activity.id,
      title: activity.title,
      endAt: activity.endAt,
      lifecycle: activity.lifecycle,
      pendingCents: netCents,
    });
  }
  return rows;
}
```

2. `getWallet` 改为：`availableCents` 同前；`pendingCents = sum(rows.pendingCents)`。

3. 本地分页（与社区一致：默认 pageSize 20，最大 50）：

```ts
function normalizeWalletPaging(input: { page?: number; pageSize?: number }) {
  const page = Math.max(1, Number(input.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(input.pageSize) || 20));
  return { page, pageSize };
}
```

4. `listPending(userId, query)`：`loadPendingRows` → slice → 返回 ISO 字符串的 `endAt`。

5. `listLedger(userId, query)`：
   - 无 `WalletAccount` → 空页；
   - `count` + `findMany` orderBy `createdAt desc`，skip/take；
   - 对 `refType === "activity"` 的 `refId` 批量查 `Activity.title`；
   - `activityId = refType === "activity" ? refId : null`；
   - `title = 活动标题 ?? (activityId ? "活动已删除" : "余额变动")`；
   - `createdAt` 用 `toISOString()`。

导出类型可与 shared 对齐（服务层返回 plain object，控制器透传即可）。

- [ ] **Step 4: GREEN**

Run: `pnpm --filter @activity/api exec vitest run src/settlement/settlement.service.spec.ts`  
Expected: PASS（含原有 getWallet / settle 用例）。

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/settlement/settlement.service.ts apps/api/src/settlement/settlement.service.spec.ts
git commit -m "feat(api): 钱包流水与待结算活动只读查询"
```

---

### Task 3: WalletController 路由

**Files:**
- Create: `apps/api/src/settlement/dto/list-wallet-page.query.ts`
- Modify: `apps/api/src/settlement/wallet.controller.ts`

- [ ] **Step 1: Query DTO**

```ts
import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

export class ListWalletPageQuery {
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

- [ ] **Step 2: 控制器**

```ts
@Get("wallet/ledger")
@UseGuards(UserJwtGuard)
listLedger(
  @CurrentUser() user: CurrentUserPayload,
  @Query() query: ListWalletPageQuery,
) {
  return this.settlementService.listLedger(user.userId, query);
}

@Get("wallet/pending")
@UseGuards(UserJwtGuard)
listPending(
  @CurrentUser() user: CurrentUserPayload,
  @Query() query: ListWalletPageQuery,
) {
  return this.settlementService.listPending(user.userId, query);
}
```

注意：`@Get("wallet")` 已存在；新增路径必须是 `wallet/ledger`、`wallet/pending`，不要写成会盖住 `wallet` 的模糊路由。`SettlementModule` 已注册 `WalletController` 则无需改 module。

- [ ] **Step 3: 手动冒烟（可选）**  
本地 API 登录后 `GET /api/me/wallet/ledger`、`/api/me/wallet/pending` → 200；无 token → 401。

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/settlement/dto/list-wallet-page.query.ts apps/api/src/settlement/wallet.controller.ts
git commit -m "feat(api): 暴露 me/wallet/ledger 与 me/wallet/pending"
```

---

### Task 4: 小程序 API 客户端

**Files:**
- Modify: `apps/mp/src/api/wallet.ts`

- [ ] **Step 1: 改为使用 shared 类型并增加两个方法**

```ts
import type {
  WalletLedgerItem,
  WalletPaged,
  WalletPendingItem,
  WalletView,
} from "@activity/shared";
import { request } from "@/utils/request";

export type { WalletView, WalletLedgerItem, WalletPendingItem, WalletPaged };

function toQuery(params: { page?: number; pageSize?: number }) {
  const q = new URLSearchParams();
  if (params.page != null) q.set("page", String(params.page));
  if (params.pageSize != null) q.set("pageSize", String(params.pageSize));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function getWallet() {
  return request<WalletView>("/me/wallet");
}

export function getWalletLedger(params: { page?: number; pageSize?: number } = {}) {
  return request<WalletPaged<WalletLedgerItem>>(
    `/me/wallet/ledger${toQuery(params)}`,
  );
}

export function getWalletPending(params: { page?: number; pageSize?: number } = {}) {
  return request<WalletPaged<WalletPendingItem>>(
    `/me/wallet/pending${toQuery(params)}`,
  );
}
```

（若项目里已有 `toQuery` 工具，复用它，不要复制第三份。）

- [ ] **Step 2: Commit**

```bash
git add apps/mp/src/api/wallet.ts
git commit -m "feat(mp): 钱包流水与待结算 API 客户端"
```

---

### Task 5: 钱包页 + 入口

**Files:**
- Create: `apps/mp/src/pages/mine/wallet.vue`
- Modify: `apps/mp/src/pages.json`
- Modify: `apps/mp/src/pages/mine/registrations.vue`

- [ ] **Step 1: `pages.json` 注册**

在 `pages/mine/profile` 条目附近增加：

```json
{
  "path": "pages/mine/wallet",
  "style": {
    "navigationBarTitleText": "我的钱包"
  }
}
```

- [ ] **Step 2: 实现 `wallet.vue`（结构要求）**

- `onLoad`：读 `tab`；仅当 `tab === "pending"` 时选中待结算，否则 `ledger`。
- 顶栏：可用余额 / 待结算（`getWallet`）；失败显示 `--`；点击切换 `activeTab`。
- Tab 文案：「余额明细」「待结算」。
- `ledger`：调用 `getWalletLedger`；空态「暂无流水」；失败可重试；行展示标题、`LEDGER_ENTRY_TYPE_LABEL[type]` 或回退 `type`、格式化 `availableDeltaCents`（正数带 `+`）、日期；`activityId` 有值则可点 → `/pages/activity/detail?id=`。
- `pending`：调用 `getWalletPending`；空态「暂无待结算活动」；行展示标题、预估金额、`endAt`；点击进活动详情。
- 切换 Tab 时若该侧尚未成功加载过则请求；已有数据可保留（规格：一侧失败不影响另一侧已加载数据）。
- **无提现按钮。**
- 样式对齐「我的」页已有 token（`$ed-color-*`），列表简洁即可，勿新造设计体系。

金额格式与 `registrations.vue` 相同：`(cents / 100).toFixed(2)`。

- [ ] **Step 3: 改造 `registrations.vue` 钱包区**

模板改为两块可点区域，并 `@click.stop`，避免触发头像登录：

```html
<view v-if="user.isLoggedIn" class="wallet">
  <view class="wallet-main" hover-class="none" @click.stop="goWallet('ledger')">
    <text class="wallet-label">可用余额</text>
    <view class="wallet-amount">
      <text class="wallet-currency">¥</text>
      <text class="wallet-figure">{{ availableDisplay }}</text>
    </view>
  </view>
  <view class="wallet-side" hover-class="none" @click.stop="goWallet('pending')">
    <text class="wallet-label">待结算</text>
    <text class="wallet-pending">{{ pendingDisplay }}</text>
  </view>
</view>
```

```ts
function goWallet(tab: "ledger" | "pending") {
  uni.navigateTo({
    url: `/pages/mine/wallet?tab=${encodeURIComponent(tab)}`,
  });
}
```

- [ ] **Step 4: 微信开发者工具冒烟**

登录后：金额为 0 可进页；两入口默认 Tab 正确；有结算数据时明细可跳活动；待结算列表与摘要一致。

- [ ] **Step 5: Commit**

```bash
git add apps/mp/src/pages/mine/wallet.vue apps/mp/src/pages.json apps/mp/src/pages/mine/registrations.vue
git commit -m "feat(mp): 钱包页双 Tab 明细与待结算入口"
```

---

### Task 6: 文档回写

**Files:**
- Modify: `docs/roadmap.md`
- Modify: `docs/adr/0014-paid-registration-and-settlement.md`
- Modify: `docs/superpowers/specs/2026-11-11-wallet-ledger-and-pending-design.md`

- [ ] **Step 1: roadmap P1-3 下增加已完成项**

在结算入账 checklist 附近增加：

```markdown
- [x] 钱包只读明细与待结算活动列表（同页 Tab；**不含提现**）
```

并在「计划」行补上本计划链接。

- [ ] **Step 2: ADR-0014**

- 状态改为：`Implemented`（含 2026-11-11 钱包只读明细修订）
- 实现计划行补上本文件链接
- 实现备注确认 ledger/pending 入口已写明

- [ ] **Step 3: 规格状态**

`2026-11-11-wallet-ledger-and-pending-design.md` 状态改为 `Implemented`。

- [ ] **Step 4: Commit**

```bash
git add docs/roadmap.md docs/adr/0014-paid-registration-and-settlement.md docs/superpowers/specs/2026-11-11-wallet-ledger-and-pending-design.md
git commit -m "docs: 回写钱包只读明细已落地"
```

---

## Spec 覆盖自检

| 规格要求 | 任务 |
| --- | --- |
| 双入口同页 Tab、默认 tab | Task 5 |
| 顶栏双金额可切 Tab | Task 5 |
| 金额 0 可进、空态文案 | Task 5 |
| ledger / pending API + 分页 | Task 2–3 |
| pending 合计 = getWallet | Task 2（复用 loadPendingRows） |
| 活动行可跳详情 | Task 5 |
| shared 类型 | Task 1 |
| 不提现 | Task 5 明确无按钮；非目标 |
| 文档 / ADR | Task 6 |

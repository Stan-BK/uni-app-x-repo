# 收费报名支付与退款 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 收费活动用微信支付报名：拉起时占名额，15 分钟内复用同一支付单，支付成功才 `confirmed`，结束前按规则全额退款。

**Architecture:** `WechatPayPort` 隔离微信。`PaymentsService` 负责支付单、回调确认、关单和退款。`RegistrationsService` 在 `feeType=paid` 时走支付分支，免费路径保持直接 `confirmed`。名额统计改为 `confirmed` + `pending_payment`。不建钱包、不结算、不提现。

**Tech Stack:** NestJS 11、Prisma 6、PostgreSQL 部分唯一索引、Vitest、Node `crypto`、`@activity/shared`、uni-app `uni.requestPayment`

**前置文档：** [设计规格](../specs/2026-10-24-paid-registration-and-settlement-design.md)。本计划先写 ADR-0014 并标 Accepted，再改代码。后继计划：[结算入账](./2026-10-24-activity-settlement-wallet.md)。

**本计划不做：** `WalletAccount`、`LedgerEntry`、`ActivitySettlement`、提现、Admin 页面。活动结束退款拦截里「已有结算单」的判断由后继计划补上；本计划退款只判断活动未结束，以及取消/下架/退回草稿。

---

## 文件结构

```text
docs/adr/0014-paid-registration-and-settlement.md
docs/adr/README.md
docs/roadmap.md
docs/product/prd-summary.md
docs/adr/0007-registration-idempotency-and-capacity.md   # 文首注明 paid 拒绝已被 0014 替换

packages/shared/src/activity.ts
  RegistrationStatus.PendingPayment
  RegistrationErrorCode 追加 PaymentMismatch / RefundNotAllowed

apps/api/prisma/schema.prisma
apps/api/prisma/migrations/20261024120000_paid_registration_payment/migration.sql

apps/api/src/payments/wechat-pay.port.ts
apps/api/src/payments/wechat-pay-client-params.ts
apps/api/src/payments/wechat-pay-client-params.spec.ts
apps/api/src/payments/fake-wechat-pay.ts
apps/api/src/payments/wechat-pay-v3.client.ts
apps/api/src/payments/payment.constants.ts          # PAYMENT_HOLD_MS = 15 * 60 * 1000
apps/api/src/payments/payments.service.ts
apps/api/src/payments/payments.service.spec.ts
apps/api/src/payments/payments.controller.ts        # 回调无 JWT；同步支付需 JWT
apps/api/src/payments/payment-expiry.scanner.ts
apps/api/src/payments/payments.module.ts

apps/api/src/registrations/registrations.service.ts
apps/api/src/registrations/registrations.service.spec.ts
apps/api/src/registrations/prisma-registration-cancel.hook.ts
apps/api/src/public-activities/public-activities.service.ts

apps/mp/src/api/registrations.ts
apps/mp/src/pages/register/index.vue
apps/mp/src/pages/activity/detail.vue
apps/mp/src/pages/mine/registrations.vue
```

环境变量（只在服务端）：`WECHAT_PAY_MCH_ID`、`WECHAT_PAY_APP_ID`、`WECHAT_PAY_MCH_SERIAL`、`WECHAT_PAY_PRIVATE_KEY`（PEM）、`WECHAT_PAY_API_V3_KEY`、`WECHAT_PAY_NOTIFY_URL`、`WECHAT_PAY_PLATFORM_CERT`（验签用平台证书 PEM）。缺任一则 API 仍能启动，收费报名返回 503「支付未配置」。测试注入 `FakeWechatPay`。

---

### Task 1: ADR-0014 与路线图

**Files:**
- Create: `docs/adr/0014-paid-registration-and-settlement.md`
- Modify: `docs/adr/README.md`
- Modify: `docs/adr/0007-registration-idempotency-and-capacity.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/product/prd-summary.md`

- [ ] **Step 1: 写 ADR，状态 Accepted**

决策正文必须包含：

1. 收费报名走微信小程序 JSAPI。金额只取 `feeCents`。拉起支付时写入 `pending_payment` 并占名额。15 分钟未支付则关单并取消报名。
2. 未过期的重复拉起复用同一 `PaymentOrder`。已有 `prepayId` 时不换 `outTradeNo`。
3. 支付成功把报名改为 `confirmed`。不实现「付成功但名额已满再退款」。
4. 用户退款仅当未结束且 `allowUserCancel` 且 `refundable`。活动取消、下架、退回草稿对已支付报名全额退款。退回草稿不在本 ADR 的结算范围内。
5. 结算入账见后继计划：活动结束或取消/下架完成后，净额进发布者可用余额。本阶段不做提现。
6. 替换 ADR-0007 决策 1 的「`feeType=paid` 拒绝报名」。免费报名规则不变。占名额改为 `confirmed` + `pending_payment`。
7. 不引入 Redis。回调幂等靠支付单状态与唯一约束。

- [ ] **Step 2: 索引与 ADR-0007**

`docs/adr/README.md` 增加一行：0014 收费报名支付与结算入账，Accepted。

ADR-0007 文首加修订：2026-10-24 起 `paid` 拒绝报名由 [ADR-0014](./0014-paid-registration-and-settlement.md) 替换；免费报名决策仍有效。

- [ ] **Step 3: roadmap 与 PRD**

`docs/roadmap.md` 在 P1-2 之后增加 **P1-3 收费报名与结算入账**，链到 ADR-0014 与两份计划。清单：支付与退款、结算入账。勾选留到实现完成。写明提现仍属 P2。

`docs/product/prd-summary.md`：本阶段开放报名微信支付与活动结束入账；提现、支付宝、结束后退款仍不做。D-05 改为与 ADR-0014 一致。

- [ ] **Step 4: Commit**

```bash
git add docs/adr/0014-paid-registration-and-settlement.md docs/adr/README.md docs/adr/0007-registration-idempotency-and-capacity.md docs/roadmap.md docs/product/prd-summary.md docs/superpowers/specs/2026-10-24-paid-registration-and-settlement-design.md
git commit -m "$(cat <<'EOF'
docs: 接受收费报名与结算入账 ADR-0014

免费报名仍按 ADR-0007。提现留在 P2，本阶段只收款和入账。

EOF
)"
```

---

### Task 2: shared 状态与错误码

**Files:**
- Modify: `packages/shared/src/activity.ts`

- [ ] **Step 1: 扩展枚举**

`RegistrationStatus` 增加 `PendingPayment: "pending_payment"`。

`RegistrationErrorCode` 增加：

```ts
PaymentMismatch: "PAYMENT_MISMATCH",
RefundNotAllowed: "REFUND_NOT_ALLOWED",
PaymentUnavailable: "PAYMENT_UNAVAILABLE",
```

保留 `PaidNotSupported`，免费以外的旧客户端仍可能收到它，但收费报名成功路径不再抛它。

- [ ] **Step 2: 构建**

Run: `pnpm --filter @activity/shared build`  
Expected: 成功。

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/activity.ts
git commit -m "feat(shared): 增加待支付报名状态与支付错误码"
```

---

### Task 3: Prisma 支付单与退款单

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20261024120000_paid_registration_payment/migration.sql`

- [ ] **Step 1: schema**

`enum RegistrationStatus` 增加 `pending_payment`。

新增：

```prisma
enum PaymentOrderStatus {
  pending
  paid
  closed
  refunded
}

enum RefundStatus {
  processing
  succeeded
  failed
}

enum RefundReason {
  user_cancel
  activity_closed
}

model PaymentOrder {
  id             String             @id @default(cuid())
  registrationId String
  outTradeNo     String             @unique
  amountCents    Int
  status         PaymentOrderStatus @default(pending)
  prepayId       String?
  transactionId  String?
  expireAt       DateTime
  paidAt         DateTime?
  closedAt       DateTime?
  createdAt      DateTime           @default(now())
  updatedAt      DateTime           @updatedAt
  registration   Registration       @relation(fields: [registrationId], references: [id])
  refund         Refund?

  @@index([registrationId, status])
  @@index([status, expireAt])
}

model Refund {
  id             String       @id @default(cuid())
  paymentOrderId String       @unique
  outRefundNo    String       @unique
  amountCents    Int
  status         RefundStatus
  reason         RefundReason
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  paymentOrder   PaymentOrder @relation(fields: [paymentOrderId], references: [id])
}
```

`Registration` 增加 `paymentOrders PaymentOrder[]`。

- [ ] **Step 2: 迁移 SQL**

除 Prisma 常规建表外，必须有：

```sql
CREATE UNIQUE INDEX "PaymentOrder_one_pending_per_registration"
  ON "PaymentOrder" ("registrationId") WHERE status = 'pending';
CREATE UNIQUE INDEX "PaymentOrder_one_paid_per_registration"
  ON "PaymentOrder" ("registrationId") WHERE status = 'paid';
```

- [ ] **Step 3: 生成客户端**

Run: `pnpm --filter @activity/api prisma:generate`  
Expected: 成功。

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20261024120000_paid_registration_payment
git commit -m "feat(api): 增加报名支付单与退款单"
```

---

### Task 4: 微信端口与调起参数

**Files:**
- Create: `apps/api/src/payments/wechat-pay.port.ts`
- Create: `apps/api/src/payments/wechat-pay-client-params.ts`
- Create: `apps/api/src/payments/wechat-pay-client-params.spec.ts`
- Create: `apps/api/src/payments/fake-wechat-pay.ts`
- Create: `apps/api/src/payments/payment.constants.ts`

- [ ] **Step 1: 端口**

```ts
export const WECHAT_PAY_PORT = Symbol("WECHAT_PAY_PORT");

export type WechatTradeState = "NOTPAY" | "SUCCESS" | "CLOSED";

export class WechatOutTradeNoUsedError extends Error {
  constructor() {
    super("WECHAT_OUT_TRADE_NO_USED");
  }
}

export type ClientPayParams = {
  timeStamp: string;
  nonceStr: string;
  package: string;
  signType: "RSA";
  paySign: string;
};

export interface WechatPayPort {
  createJsapi(input: {
    outTradeNo: string;
    amountCents: number;
    description: string;
    payerOpenId: string;
    expireAt: Date;
  }): Promise<{ prepayId: string }>;
  query(outTradeNo: string): Promise<{
    tradeState: WechatTradeState;
    transactionId: string | null;
    amountCents: number | null;
  }>;
  close(outTradeNo: string): Promise<"closed" | "paid">;
  refund(input: {
    outRefundNo: string;
    outTradeNo: string;
    amountCents: number;
  }): Promise<"succeeded" | "processing" | "failed">;
  clientParams(prepayId: string): ClientPayParams;
}
```

`payment.constants.ts`：`export const PAYMENT_HOLD_MS = 15 * 60 * 1000;`

- [ ] **Step 2: 失败测试**

`clientParams` 用固定 `sign` 函数注入。断言 `package` 为 `prepay_id=wx123`，`signType` 为 `RSA`，两次调用的 `nonceStr` 不同，`paySign` 由注入函数返回。

Run: `pnpm --filter @activity/api exec vitest run src/payments/wechat-pay-client-params.spec.ts`  
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现**

`buildClientPayParams(prepayId, sign)`：`timeStamp` 为当前秒字符串，`nonceStr` 为 32 位随机，`package` 为 `prepay_id=${prepayId}`。`FakeWechatPay` 在内存里按 `outTradeNo` 记录状态，`createJsapi` 对已存在单号抛 `WechatOutTradeNoUsedError`，`clientParams` 的 `paySign` 固定为 `fake`。

- [ ] **Step 4: 再跑测试，预期 PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/payments
git commit -m "feat(api): 定义微信支付端口与调起参数"
```

---

### Task 5: 支付单状态机（TDD）

**Files:**
- Create: `apps/api/src/payments/payments.service.ts`
- Create: `apps/api/src/payments/payments.service.spec.ts`

用现有报名测试的方式 mock `PrismaService.$transaction`。端口用 `FakeWechatPay`。不要请求微信。

- [ ] **Step 1: 先写失败测试**

覆盖规格 §9 里属于支付的条目：

| 测试 | 断言 |
| --- | --- |
| 未过期且已有 prepayId | `createJsapi` 调用次数仍为 0；`outTradeNo` 不变；返回新的 `nonceStr` |
| 无 prepayId | 用当前 `outTradeNo` 下单并先保存 `prepayId` |
| 商户单号已占用且本地无 prepayId，查单 NOTPAY | `close` 后更换 `outTradeNo` 再下单 |
| 查单 SUCCESS | 支付单 `paid`，报名 `confirmed`，不再下单 |
| 回调金额或商户号不一致 | 抛 `PAYMENT_MISMATCH`，报名仍是 `pending_payment` |
| 重复确认 | 第二次不改 `paidAt` |
| 过期且查单 NOTPAY | 支付单 `closed`，报名 `cancelled` |
| 关单返回 paid | 改为 `confirmed`，不释放名额 |
| 关单抛错 | 报名保持 `pending_payment` |

- [ ] **Step 2: 跑测试确认 RED**

Run: `pnpm --filter @activity/api exec vitest run src/payments/payments.service.spec.ts`

- [ ] **Step 3: 实现 `PaymentsService`**

公开方法：

```ts
prepare(registrationId: string, input: {
  amountCents: number;
  description: string;
  payerOpenId: string;
  now?: Date;
}): Promise<{ status: "pending" | "paid"; pay: ClientPayParams | null }>;

confirmPaid(input: {
  outTradeNo: string;
  amountCents: number;
  transactionId: string;
  appId: string;
  mchId: string;
}): Promise<void>;

closeIfExpired(paymentOrderId: string, now?: Date): Promise<void>;

closeUnpaidForActivity(activityId: string): Promise<void>;

refundPaid(paymentOrderId: string, reason: "user_cancel" | "activity_closed"): Promise<void>;
```

`prepare` 只处理已存在的 `pending` 支付单。创建报名行和支付单放在 Task 6 的事务里。`confirmPaid` 在事务中把 `pending` 改为 `paid` 且报名改为 `confirmed`。本地已是 `paid` 则返回。`appId`/`mchId` 与配置不一致时抛 `PAYMENT_MISMATCH`。

`refundPaid`：没有退款单则创建 `processing` 与新 `outRefundNo`；已有 `failed` 或 `processing` 则沿用 `outRefundNo`。微信返回 `succeeded` 时同一事务写 `refunded`、报名 `cancelled`。返回 `failed` 时退款单改 `failed`，报名保持 `confirmed`。

- [ ] **Step 4: 测试 GREEN**

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/payments/payments.service.ts apps/api/src/payments/payments.service.spec.ts
git commit -m "feat(api): 支付单复用、确认与退款状态机"
```

---

### Task 6: 收费报名创建

**Files:**
- Modify: `apps/api/src/registrations/registrations.service.ts`
- Modify: `apps/api/src/registrations/registrations.service.spec.ts`
- Modify: `apps/api/src/registrations/registration.mapper.ts`
- Modify: `apps/api/src/registrations/registrations.module.ts`
- Create: `apps/api/src/payments/payments.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: 失败测试**

在现有 `registrations.service.spec.ts` 增加：

- `feeType=free` 仍直接 `confirmed`，`paymentOrder.create` 未被调用。
- `feeType=paid` 在容量内创建 `pending_payment`，并创建 `amountCents === feeCents`、`expireAt = now + 15min` 的支付单。
- 已有未过期 `pending_payment` 时不新建报名行，调用 `prepare`。
- 已 `confirmed` 返回 `alreadyRegistered: true`，无调起参数。
- `pending_payment` + `confirmed` 人数达到 `capacity` 时抛 `ACTIVITY_FULL`。
- 过期后再次报名更新同一行，新建另一张支付单。

响应在 `CreateRegistrationDto` 上增加可选 `pay`（`ClientPayParams | null`）和 `paymentStatus: "pending" | "paid" | null`。免费报名 `pay` 为 `null`。

- [ ] **Step 2: RED**

Run: `pnpm --filter @activity/api exec vitest run src/registrations/registrations.service.spec.ts`

- [ ] **Step 3: 实现**

`assertActivityOpenable` 不再因为 `paid` 抛 `PAID_NOT_SUPPORTED`。

占名额计数：

```ts
where: {
  activityId,
  status: { in: [RegistrationStatus.confirmed, RegistrationStatus.pending_payment] },
}
```

收费分支在同一把活动行锁里写报名和支付单，事务提交后再调用 `PaymentsService.prepare`。付款人 `openId` 取 `UserIdentity` 中 `provider = weixin`。没有微信身份则 400「请使用微信登录后再支付」。支付未配置时 503，`code` 为 `PAYMENT_UNAVAILABLE`，并关闭刚创建的 pending（报名回到 `cancelled`），避免永久占名额。

`RegistrationsModule` 导入 `PaymentsModule`。`AppModule` 导入 `PaymentsModule`。

- [ ] **Step 4: GREEN**

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/registrations apps/api/src/payments/payments.module.ts apps/api/src/app.module.ts
git commit -m "feat(api): 收费报名拉起时占名额并复用支付单"
```

---

### Task 7: 回调与同步

**Files:**
- Create: `apps/api/src/payments/payments.controller.ts`
- Modify: `apps/api/src/payments/wechat-pay-v3.client.ts`
- Modify: `apps/api/src/payments/payments.module.ts`

- [ ] **Step 1: 真实客户端的验签入口**

`WechatPayV3Client.parseNotification(headers, rawBody)` 校验 `Wechatpay-Signature`，用 `WECHAT_PAY_API_V3_KEY` 解密 `resource`。成功时返回 `{ outTradeNo, amountCents, transactionId, appId, mchId, tradeState }`。验签失败抛 401，不调用 `confirmPaid`。

下单请求 `POST /v3/pay/transactions/jsapi`，body 含 `mchid`、`appid`、`description`、`out_trade_no`、`time_expire`（RFC3339，等于 `expireAt`）、`notify_url`、`amount.total`、`payer.openid`。响应 `prepay_id`。商户单号重复时微信返回 `OUT_TRADE_NO_USED` 或订单已存在的错误码，客户端转成 `WechatOutTradeNoUsedError`。

查单 `GET /v3/pay/transactions/out-trade-no/{outTradeNo}?mchid=`。关单 `POST .../close`。退款 `POST /v3/refund/domestic/refunds`，`amount.refund` 与 `amount.total` 都等于支付单金额。

请求签名：`WECHATPAY2-SHA256-RSA2048`，待签字符串为 `` `${method}\n${urlPath}\n${timestamp}\n${nonce}\n${body}\n` ``。

- [ ] **Step 2: 路由**

`POST /payments/wechat/notify` 不加 `UserJwtGuard`，读原始 body。解析后仅当 `tradeState === "SUCCESS"` 调用 `confirmPaid`。应答 `{ code: "SUCCESS" }`。

`POST /registrations/:id/payment-sync` 放在 `RegistrationsController`，需用户 JWT，且报名属于当前用户。内部 `query` 后走与回调相同的确认或保持 pending。

- [ ] **Step 3: 日志**

记录 `outTradeNo` 与 `transactionId`。不记录回调原文、私钥、姓名、手机号。

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/payments apps/api/src/registrations/registrations.controller.ts
git commit -m "feat(api): 接入微信支付回调与报名同步"
```

---

### Task 8: 用户取消与活动关闭退款

**Files:**
- Modify: `apps/api/src/registrations/registrations.service.ts`
- Modify: `apps/api/src/registrations/prisma-registration-cancel.hook.ts`
- Modify: `apps/api/src/registrations/prisma-registration-cancel.hook.spec.ts`
- Modify: `apps/api/src/activities/registration-cancel.hook.ts`

- [ ] **Step 1: 失败测试**

- 收费且 `refundable=false`：取消抛 `REFUND_NOT_ALLOWED`，报名仍为 `confirmed`。
- 收费且 `allowUserCancel=false`：同样拒绝。
- 收费且两项都为 true、未结束：调用 `refundPaid(..., "user_cancel")`。
- 免费取消仍只改 `cancelled`，不调用退款。
- 活动已结束：收费与免费都拒绝。
- 钩子：`pending_payment` 被关闭；`paid` 支付单进入退款；`confirmed` 的免费报名直接 `cancelled`。

- [ ] **Step 2: RED 后实现**

`RegistrationCancelHook` 增加 `closeActivity(activityId: string): Promise<void>`。`ActivitiesService` 与 `AdminActivitiesService` 在退回草稿、取消、下架时调用它，不再只调用 `cancelAllForActivity`。

`closeActivity`：先 `closeUnpaidForActivity`，再对每张 `paid` 且没有成功退款的支付单 `refundPaid(..., "activity_closed")`。免费的 `confirmed` 仍直接 `cancelled`。

用户取消收费报名时走 `refundPaid(..., "user_cancel")`，条件为报名属于本人、`confirmed`、活动 `published` 且 `now < endAt`、`allowUserCancel`、`refundable`。

- [ ] **Step 3: GREEN 并 Commit**

```bash
git add apps/api/src/registrations apps/api/src/activities
git commit -m "feat(api): 收费报名按规则退款，活动关闭时退已支付报名"
```

---

### Task 9: 超时扫描与满员口径

**Files:**
- Create: `apps/api/src/payments/payment-expiry.scanner.ts`
- Modify: `apps/api/src/public-activities/public-activities.service.ts`
- Modify: `apps/api/src/public-activities/public-activities.service.spec.ts`
- Modify: `apps/api/src/registrations/registrations.service.ts`

- [ ] **Step 1: 扫描器**

`@Interval(60_000)` 查询 `status=pending AND expireAt <= now`，对每张单 `closeIfExpired`。单张失败只记 `outTradeNo`，不中断其余单。

再次读取报名（`GET /registrations/me`、创建报名命中已有 pending）时，若 `expireAt` 已过，先 `closeIfExpired`。

- [ ] **Step 2: 公开名额**

`public-activities.service.ts` 里统计满员的 `count` 改为 `status in (confirmed, pending_payment)`。出席头像列表仍只含 `confirmed`。

更新「满员」测试：1 个 `pending_payment` 且 `capacity=1` 时 `displayStatus` 为 `full`。免费活动没有 `pending_payment` 的现有测试保持通过。

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/payments/payment-expiry.scanner.ts apps/api/src/public-activities apps/api/src/registrations
git commit -m "feat(api): 超时释放待支付名额，满员计入待支付"
```

---

### Task 10: 小程序拉起支付

**Files:**
- Modify: `apps/mp/src/api/registrations.ts`
- Modify: `apps/mp/src/pages/register/index.vue`
- Modify: `apps/mp/src/pages/activity/detail.vue`
- Modify: `apps/mp/src/pages/mine/registrations.vue`

- [ ] **Step 1: 客户端**

`createRegistration` 的返回类型增加 `pay` 与 `paymentStatus`。新增 `syncRegistrationPayment(id)` → `POST /registrations/:id/payment-sync`。

报名页：响应里有 `pay` 时调用 `uni.requestPayment`。成功或用户完成后调用同步接口。`paymentStatus === "paid"` 或同步后为 `confirmed` 时进入原成功路径。用户取消微信支付不把报名当成失败删除，停留在待支付。

活动详情：去掉 `feeType=paid` 时「暂不支持线上报名」的禁用。满员、已结束、已截止仍不可报。

我的报名：`pending_payment` 显示「待支付」，按钮再次调用创建报名接口以复用支付单，再 `requestPayment`。

- [ ] **Step 2: 类型检查**

Run: `pnpm --filter @activity/mp type-check`（若脚本不存在，用该包已有的 `vue-tsc` 脚本，以 `package.json` 为准）  
Expected: 无新增类型错误。

- [ ] **Step 3: Commit**

```bash
git add apps/mp/src/api/registrations.ts apps/mp/src/pages/register/index.vue apps/mp/src/pages/activity/detail.vue apps/mp/src/pages/mine/registrations.vue
git commit -m "feat(mp): 收费活动拉起微信支付并支持待支付再次支付"
```

---

## 计划自检

| 规格 | 任务 |
| --- | --- |
| §4.1–4.3 支付/退款表 | Task 3 |
| §5.1 占名额创建 | Task 6 |
| §5.1 不在回调里补占名额 | Task 5 `confirmPaid` 只改状态 |
| §5.2 复用与恢复换号 | Task 5 |
| §5.3 回调 | Task 7 |
| §5.4 超时与活动离开 published | Task 8、Task 9 |
| §5.5 用户退款与活动关闭退款 | Task 8 |
| §7 小程序支付 | Task 10 |
| §8 端口 | Task 4、Task 7 |
| §6 结算、§4.4–4.6 钱包 | 后继计划 |
| 结束后退款拒绝 | 后继计划在退款入口检查结算单 |

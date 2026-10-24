# ADR-0014: 收费报名支付与结算入账

- **状态：** Accepted
- **日期：** 2026-10-24
- **关联：** roadmap P1-3、PRD D-05 / D-06、[ADR-0005](./0005-activity-lifecycle-and-model.md)、[ADR-0007](./0007-registration-idempotency-and-capacity.md)、[ADR-0010](./0010-backend-ops-stack.md)
- **设计规格：** [docs/superpowers/specs/2026-10-24-paid-registration-and-settlement-design.md](../superpowers/specs/2026-10-24-paid-registration-and-settlement-design.md)
- **实现计划：** [支付与退款](../superpowers/plans/2026-10-24-paid-registration-payment.md)、[结算入账](../superpowers/plans/2026-10-24-activity-settlement-wallet.md)

## 背景

P0-4 与 ADR-0007 已落地免费报名闭环，并对 `feeType=paid` **拒绝报名**，支付链路后置 P2。产品现需在 MVP 之后开放收费活动：微信小程序 JSAPI 收款、支付成功确认报名、活动结束前按规则退款、活动结束后将净额记入发布者可用余额。约束：不引入 Redis / MQ；回调幂等靠支付单状态与数据库唯一约束；本阶段不做发布者提现、支付宝、结束后退款。

## 决策

1. **收费报名走微信小程序 JSAPI。** 金额只取活动 `feeCents`（下单时快照到支付单，之后不随改价变化）。用户拉起支付时：在同一事务（锁活动行）内将报名写入 `pending_payment` 并创建 `pending` 支付单，**占名额**。支付单 `expireAt` 为创建时间加 15 分钟。15 分钟未支付则关单并将报名改为 `cancelled`，释放名额。免费报名仍直接 `confirmed`，不产生支付单；规则不变（ADR-0007）。

2. **未过期重复拉起复用同一 `PaymentOrder`。** 支付单仍为 `pending` 且未过 `expireAt` 时，不新建支付单。已有 `prepayId` 时不更换 `outTradeNo`，仅用该 `prepayId` 重新生成小程序调起参数。尚无 `prepayId` 时用当前 `outTradeNo` 向微信下单。预支付标识丢失的恢复路径（查单、换号重下）见设计规格 §5.2。已过期的支付单不复用；关闭后用户再次报名才创建新支付单（同一用户对同一活动仍仅一行报名，更新该行）。

3. **支付成功将报名改为 `confirmed`。** 微信回调验签解密后，商户号、应用号、`outTradeNo`、金额与本地一致且交易成功时，由 `pending` 改为 `paid` 的同一事务内把报名改为 `confirmed`，写入 `transactionId` / `paidAt`。本地已是 `paid` 时幂等返回成功。**不实现**「付成功但名额已满再退款」：名额在拉起支付时已占，回调确认时不应再遇满员。

4. **用户退款与活动关单退款。** 用户主动退款：须报名为本人 `confirmed`、活动未结束、`allowUserCancel === true`、`refundable === true`；全额退款并取消报名。活动取消、运营下架、退回草稿：对该活动全部已支付且未退款的报名全额退款（不论 `refundable`）。**退回草稿**触发 `activity_closed` 退款，但**不在本 ADR 的结算入账范围内**（不写结算单；活动可再发布，净额留待后续真正结算时与后续支付抵消）。取消与下架在退款完成后走结算（净额可为 0）。活动已写出 `ActivitySettlement` 后，任何退款拒绝。

5. **结算入账（后继实现，本 ADR 锁定语义）。** 活动 `endAt` 已到，或生命周期为 `cancelled` / `removed`（且满足规格中的关单与退款完成条件）时，写 `ActivitySettlement`；净额 = 实收 − 已退 − 平台抽成（`platformFeeBps` 快照，四舍五入到分）。`netCents > 0` 时记入发布者（活动所有者）`WalletAccount` 可用余额并写 `LedgerEntry`。待结算预估不写钱包，按未结算活动实时加总。**本阶段不做提现**（无 `Withdrawal`、无商家转账入口）。

6. **替换 ADR-0007 决策 1 中「`feeType=paid` 拒绝报名」。** 自本 ADR Accepted 起，收费活动可提交报名并走支付链路；ADR-0007 其余决策对**免费**报名仍有效。**占名额**口径改为：`confirmed` 与 `pending_payment` 均计入有效占名额数；`cancelled` 不计。公开 `displayStatus=full` 与并发行锁 + `@@unique([userId, activityId])` 语义延续 ADR-0007，扩展至待支付态。

7. **不引入 Redis。** 名额并发仍用 Postgres 行锁；支付回调幂等靠支付单状态迁移与唯一约束（同一报名最多一张 `pending`、最多一张 `paid` 支付单；退款单与结算单 `activityId` / 幂等键唯一）。超时关单与结算扫描在 API 单进程内定时执行，并在读取相关报名/活动时顺带执行。

## 备选方案

| 方案 | 优点 | 缺点 |
| --- | --- | --- |
| 拉起支付占名额 + JSAPI + 库内幂等（本决策） | 与 MVP 无 Redis 一致；避免付成功再因满员退款 | 待支付占坑；需关单与扫描 |
| 仅支付成功占名额 | 不占坑 | 并发双付、回调满员需退款，本阶段明确不做 |
| Redis 锁 / 消息队列处理回调 | 吞吐与解耦更好 | 违反 ADR-0010 / backend-ops MVP 边界 |
| P2 才开放收费 | 实现更晚 | 与当前产品阶段不符 |

## 后果

- 正面：收费闭环与免费规则边界清晰；支付 ADR 先于代码；提现、支付宝、分账仍后置 P2。
- 负面 / 跟进：须实现 `Registration.pending_payment`、`PaymentOrder` / `Refund` / 钱包与结算表；同步 mp 调起支付与个人页余额展示；更新 roadmap P1-3 与 PRD D-05。实现完成后将本 ADR 标为 `Implemented`。
- Admin 不增加改余额或提现页面。

## 实现备注

- 涉及：`packages/shared`（状态与错误码）；`apps/api`（报名分支、微信支付适配、关单扫描、退款、结算）；`apps/mp`（收费 CTA、待支付、钱包展示）。细节见设计规格与两份实现计划。
- 验收要点：规格 §9 单元测试清单；免费行为不变；15 分钟内不换 `outTradeNo`；重复回调只确认一次；下架全额退与结算净额 0；活动结束后拒绝退款。

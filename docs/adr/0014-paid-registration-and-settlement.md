# ADR-0014: 收费报名支付与结算入账

- **状态：** Implemented（含 2026-11-11 钱包只读明细修订）
- **日期：** 2026-10-24（修订 2026-11-11）
- **关联：** roadmap P1-3、PRD D-05 / D-06、[ADR-0005](./0005-activity-lifecycle-and-model.md)、[ADR-0007](./0007-registration-idempotency-and-capacity.md)、[ADR-0010](./0010-backend-ops-stack.md)
- **设计规格：** [收费报名与结算](../superpowers/specs/2026-10-24-paid-registration-and-settlement-design.md)、[钱包明细与待结算](../superpowers/specs/2026-11-11-wallet-ledger-and-pending-design.md)
- **实现计划：** [支付与退款](../superpowers/plans/2026-10-24-paid-registration-payment.md)、[结算入账](../superpowers/plans/2026-10-24-activity-settlement-wallet.md)、[钱包明细与待结算](../superpowers/plans/2026-11-11-wallet-ledger-and-pending.md)

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

8. **钱包只读明细（2026-11-11 修订）。** 在已有 `GET /me/wallet` 摘要之外，提供本人只读分页接口：`GET /me/wallet/ledger`（`LedgerEntry` 全量流水，正负向均按流水展示；本阶段仅有 `settlement_credit`）与 `GET /me/wallet/pending`（未结算收费活动及单活动预估净额，算法与摘要 `pendingCents` 一致）。小程序「我的」点可用余额 / 待结算进入同一钱包页（顶栏双金额 + Tab）；金额为 0 仍可进入。活动相关行可跳转活动详情。**仍不做提现**、不写新出账类型、Admin 不改余额。细节见 [钱包明细规格](../superpowers/specs/2026-11-11-wallet-ledger-and-pending-design.md)。

## 备选方案

| 方案 | 优点 | 缺点 |
| --- | --- | --- |
| 拉起支付占名额 + JSAPI + 库内幂等（本决策） | 与 MVP 无 Redis 一致；避免付成功再因满员退款 | 待支付占坑；需关单与扫描 |
| 仅支付成功占名额 | 不占坑 | 并发双付、回调满员需退款，本阶段明确不做 |
| Redis 锁 / 消息队列处理回调 | 吞吐与解耦更好 | 违反 ADR-0010 / backend-ops MVP 边界 |
| P2 才开放收费 | 实现更晚 | 与当前产品阶段不符 |
| 摘要外再提供只读 ledger/pending 列表（决策 8） | 可核对入账与待结算构成，不引入提现 | 多两个接口与一页 UI |
| 不做明细、仅摘要 | 实现更少 | 余额为 0 时无法回顾历史；待结算无法拆到活动 |
| 钱包页内嵌提现入口 | 一次做完资金出口 | 超出本阶段与 P2 边界 |

## 后果

- 正面：收费闭环与免费规则边界清晰；支付 ADR 先于代码；提现、支付宝、分账仍后置 P2；只读明细不改变入账公式。
- 负面 / 跟进：支付结算与钱包只读明细（决策 8）均已 Implemented。提现、支付宝、活动结束后退款仍后置。
- Admin 不增加改余额或提现页面。

## 实现备注

- **代码入口：** `apps/api/src/payments`（JSAPI 下单/回调/关单/退款）、`apps/api/src/settlement`（活动关窗结算与发布者钱包入账）。钱包只读：`apps/api/src/settlement/wallet.controller.ts` 的 `GET /me/wallet`、`GET /me/wallet/ledger`、`GET /me/wallet/pending`（`SettlementService.listLedger` / `listPending`）。小程序从 `apps/mp/src/pages/mine/registrations.vue` 点可用余额或待结算进入 `apps/mp/src/pages/mine/wallet.vue`（同页 Tab），请求在 `apps/mp/src/api/wallet.ts`。发布者提现、支付宝、Admin 改余额未实现。
- 涉及：`packages/shared`（状态与错误码、流水/待结算类型）；`apps/api`（报名分支、微信支付适配、关单扫描、退款、结算、ledger/pending 查询）；`apps/mp`（收费 CTA、待支付、钱包摘要与明细 Tab）。细节见设计规格与实现计划。
- 验收要点：规格 §9 单元测试清单；免费行为不变；15 分钟内不换 `outTradeNo`；重复回调只确认一次；下架全额退与结算净额 0；活动结束后拒绝退款；钱包明细规格 §6（流水分页、pending 合计一致、空账户、401）。

# 收费报名与活动结算入账设计规格

- **日期：** 2026-10-24
- **状态：** 已评审（2026-10-24）。写代码前先落 ADR-0014 为 Accepted。
- **实现计划：** [支付与退款](../plans/2026-10-24-paid-registration-payment.md)、[结算入账](../plans/2026-10-24-activity-settlement-wallet.md)
- **关联：** roadmap 本阶段新增；PRD 收费报名与活动结束后抽成；[ADR-0005](../../adr/0005-activity-lifecycle-and-model.md)、[ADR-0007](../../adr/0007-registration-idempotency-and-capacity.md)、[ADR-0010](../../adr/0010-backend-ops-stack.md)
- **范围：** 收费活动的微信支付、支付成功后确认报名、结束前按规则退款、活动结束将净额记入发布者现金账户。发布者可看待结算预估和可用余额。
- **不在本阶段：** 发布者提现、微信商家转账、支付宝、冻结余额、`Withdrawal`、`PayoutAttempt`、后台调账、分账、结束后退款、Redis、消息队列。

实现拆成两份计划，按顺序做：先支付与退款，再钱包与结算入账。结算只读支付单和退款单。

## 1. 目标

收费活动可以收款。报名者拉起支付时先占住名额，15 分钟内支付成功则保留名额，超时未支付则释放。活动结束时关闭退款，按实收扣除平台抽成，把净额记入发布者的可用余额。提现入口不出现。

成功标准：

- `feeType=free` 的报名行为与现在一致。
- `feeType=paid` 在支付成功前不是 `confirmed`；成功后才是。待支付期间已经占名额。
- 同一笔未过期报名重复拉起支付，不产生第二张微信订单。
- 支付回调重复到达只确认一次。
- 每场活动最多一条结算单；净额大于 0 时可用余额只增加一次。
- 小程序能看到待结算预估和可用余额，不能发起提现。

## 2. 已确认决策

| 项 | 结论 |
| --- | --- |
| 入金 | 报名微信支付（小程序 JSAPI）。金额只取活动 `feeCents` |
| 账户 | 每个用户一个现金账户。多场活动净额累加 |
| 待结算 | 不写钱包。未结算活动的「已支付 − 已退款 − 按当前费率估算的抽成」实时加总 |
| 入账时机 | 活动结束当时关窗。结束前退款只减少待结算。结束时写结算单，净额转入可用余额 |
| 结束后 | 不再退款 |
| 结束前用户退款 | 同时满足未结束、`allowUserCancel`、`refundable` 才全额退款并取消报名 |
| 结束前取消或下架 | 不论 `refundable`，已支付报名全额退款，结算净额为 0，仍写结算单 |
| 抽成 | `(已收 − 已退) × platformFeeBps / 10000`，四舍五入到分。费率打进结算单。空或小于 0 按 0，大于 10000 按 10000 |
| 支付单复用 | 15 分钟内同一报名复用同一支付单。已有 `prepayId` 时不换商户单号，只重签。更换商户单号只发生在预支付标识丢失的恢复路径 |
| 名额 | `pending_payment` 与 `confirmed` 都占名额。超时未支付则释放 |
| 幂等存储 | 数据库唯一约束与行锁。不引入 Redis |
| 提现 | 不做 |
| Admin | 不改 |

## 3. 与现有报名规则的关系

[ADR-0007](../../adr/0007-registration-idempotency-and-capacity.md) 仍约束免费报名：直接 `confirmed`，有效报名只计 `confirmed`，`@@unique([userId, activityId])` 保留。

收费报名是该 ADR「拒绝 paid」的后续替换，只在新 ADR Accepted 后生效。同一用户对同一活动仍只有一行报名。取消或超时后再次报名，更新这一行，不另插报名。

收费活动占名额的状态是 `confirmed` 与 `pending_payment`。`cancelled` 不占名额。公开满员使用同一口径。免费活动没有 `pending_payment`，满员结果与现在相同。

## 4. 数据

金额都是整数分，币种人民币。

### 4.1 `Registration.status`

在现有枚举上增加 `pending_payment`。免费报名不使用它。`pending_review` 与 `rejected` 仍不使用。

### 4.2 `PaymentOrder`

| 字段 | 规则 |
| --- | --- |
| `registrationId` | 所属报名 |
| `outTradeNo` | 全局唯一。创建支付单时生成，常规路径不更换 |
| `amountCents` | 等于当时的 `feeCents`，之后不随活动改价变化 |
| `status` | `pending`、`paid`、`closed`、`refunded` |
| `prepayId` | 微信预支付标识。未向微信下单成功前为空 |
| `transactionId` | 微信支付订单号。支付成功后写入 |
| `expireAt` | 创建时间加 15 分钟。同时作为微信 `time_expire` |
| `paidAt` / `closedAt` | 进入对应状态时写入 |

约束：同一报名最多一张 `pending` 支付单；最多一张 `paid` 支付单。

超时、用户未支付而活动被取消，状态变为 `closed`。全额退款成功后变为 `refunded`。

### 4.3 `Refund`

| 字段 | 规则 |
| --- | --- |
| `paymentOrderId` | 唯一。一笔支付单最多一次全额退款 |
| `outRefundNo` | 全局唯一 |
| `amountCents` | 等于支付单 `amountCents` |
| `status` | `processing`、`succeeded`、`failed` |
| `reason` | `user_cancel` 或 `activity_closed` |

### 4.4 `WalletAccount`

| 字段 | 规则 |
| --- | --- |
| `userId` | 唯一 |
| `availableCents` | 缓存，不能为负。没有提现，因此没有冻结余额 |

首次结算入账时创建。没有账户的用户，查询结果是可用余额 0。

### 4.5 `LedgerEntry`

只追加。本阶段类型只有 `settlement_credit`。

| 字段 | 规则 |
| --- | --- |
| `accountId` | 所属账户 |
| `availableDeltaCents` | 正数，等于结算净额 |
| `availableAfterCents` | 写入后的可用余额 |
| `idempotencyKey` | 唯一。结算入账使用 `settlement:{activityId}` |
| `refType` / `refId` | 指向 `ActivitySettlement` |

### 4.6 `ActivitySettlement`

`activityId` 唯一。

| 字段 | 规则 |
| --- | --- |
| `ownerUserId` | 入账用户，取活动所有者 |
| `grossCents` | 该活动状态曾为已支付的支付单金额合计（含后来退款的） |
| `refundedCents` | 退款成功金额合计 |
| `platformFeeBps` | 结算当时活动上的费率快照 |
| `feeCents` | 抽成 |
| `netCents` | `grossCents - refundedCents - feeCents`，不小于 0 |
| `ledgerEntryId` | 净额为 0 时为空 |

抽成计算：`collected = grossCents - refundedCents`，`feeCents = round(collected * platformFeeBps / 10000)`，舍入为对正数的四舍五入。若 `feeCents > collected`，取 `collected`。

## 5. 收费报名与支付

### 5.1 创建

用户 JWT。活动须 `published`、未结束、未过报名截止、`feeType=paid`、`feeCents > 0`。免费活动走原接口分支，不创建支付单。

在锁定活动行的同一事务里：

| 已有报名 | 结果 |
| --- | --- |
| `confirmed` | 返回已报名，不创建支付单 |
| `pending_payment` 且支付单未过期 | 不新建报名。进入 5.2 复用支付单 |
| `pending_payment` 且已过期 | 先按 5.4 关闭，再继续 |
| `cancelled` 或没有报名 | 校验占名额人数小于 `capacity` 后，写入 `pending_payment` 并创建 `pending` 支付单 |

占名额人数 = 该活动 `confirmed` + `pending_payment`。并发与免费报名相同，锁活动行。

名额在拉起支付时占住，不放到支付成功回调里再占。若只在拉起时检查、成功后才计数，两个人可以同时通过检查并都付完；后到达的回调会遇到名额已满，钱已经进入商户号，只能退款。本阶段不走「付成功但报名失败再退款」。回调确认时该报名仍应占着名额，因此支付成功即可改为 `confirmed`。

### 5.2 十五分钟内再次拉起

支付单仍是 `pending` 且未过 `expireAt` 时：

| 条件 | 行为 |
| --- | --- |
| 已有 `prepayId` | 不调用微信下单。用该 `prepayId` 重新生成小程序调起参数 |
| 尚无 `prepayId` | 用当前 `outTradeNo` 向微信下单，成功后先保存 `prepayId`，再返回调起参数 |
| 微信表示商户单号已存在，且本地没有 `prepayId` | 按商户单号查单。已支付则走 5.3。未支付则关闭微信订单，为这张本地支付单更换新的 `outTradeNo` 后重新下单。这只用于预支付标识丢失的恢复 |
| 查单已支付 | 支付单改为 `paid`，报名改为 `confirmed`，返回已支付，不再拉起 |

已过期的支付单不复用。关闭后用户再次报名才创建新支付单。

### 5.3 支付结果

微信回调先验签并解密。商户号、应用号、`outTradeNo`、金额必须与本地支付单一致，交易状态为支付成功。不一致则拒绝，不改报名。

本地已是 `paid` 时直接返回成功。由 `pending` 改为 `paid` 时，同一事务把报名改为 `confirmed`，写入 `transactionId` 与 `paidAt`。

回调晚于客户端时，客户端再次拉起或主动同步都先查单，不第二笔下单。

### 5.4 超时关闭

`expireAt` 已到且仍是 `pending`：先查微信。已支付则按 5.3 确认。未支付则关闭微信订单，本地支付单改为 `closed`，报名改为 `cancelled`。关单失败则保持 `pending_payment`，下次扫描再试，名额继续占着。

活动变为草稿、取消或下架时，未支付的 `pending` 单同样立即关闭，不等 15 分钟。已支付的单不在这里关闭，走 5.5 退款。

扫描在 API 单进程内定时执行，并在再次读取该报名时顺带执行。任务重复执行不得关闭已支付订单，不得释放已确认名额。

### 5.5 退款

全额，且一笔支付单一条退款。

| 场景 | 条件 | `reason` |
| --- | --- | --- |
| 用户取消 | 报名是本人的 `confirmed`；活动未结束；`allowUserCancel`；`refundable` | `user_cancel` |
| 活动取消、退回草稿或下架 | 该活动全部已支付且未退款的报名 | `activity_closed` |

不满足用户取消条件时拒绝，报名与余额都不变。活动已经写出结算单之后，两类退款都拒绝。

退回草稿会按 `activity_closed` 退款，但不写结算单。活动还可以再发布；之后的新支付与这次退款一起留到真正结算时抵消。取消和下架会退款，并在退款完成后结算。

退款单先写 `processing`，再调用微信。成功后同一事务：退款 `succeeded`，支付单 `refunded`，报名 `cancelled`。失败则退款为 `failed`，报名保持 `confirmed`，允许用同一 `outRefundNo` 再查或重试，不另开退款单。

## 6. 结算入账

单进程定时扫描，重复执行安全。

一场活动可以结算，当且仅当：

- `feeType=paid`
- 还没有 `ActivitySettlement`
- 没有 `pending` 支付单
- 没有尚未成功的退款单
- 活动 `endAt` 已到，或生命周期已是 `cancelled` 或 `removed`

`endAt` 已到，或活动离开 `published` 时，先对待支付的 `pending` 单执行 5.4。仍有未成功的退款，则本次跳过。草稿不结算。

然后写入结算单。`netCents > 0` 时锁定或创建所有者的 `WalletAccount`，插入 `settlement_credit`，增加 `availableCents`。`netCents = 0` 时只写结算单。

结算完成后，该活动不再接受退款。发布者此时起可以在可用余额中看到这笔净额，但不能提走。

待结算查询不读 `WalletAccount`。范围是该用户名下、`feeType=paid`、尚无结算单的活动，按第 2 节的公式加总。费率用活动当前的 `platformFeeBps`，所以入账前改费率会改变预估；入账后以结算单快照为准，预估不再包含该活动。

## 7. API 与小程序

错误形状沿用 HTTP 状态 + `message`。业务拒绝使用稳定 `code`。证书、回调原文、用户姓名和手机号不写日志。日志可以有 `outTradeNo` 与 `transactionId`。

| 能力 | 行为 |
| --- | --- |
| 创建收费报名 | 返回报名状态，以及未支付时的调起参数 |
| 同步支付结果 | 登录用户本人。查单并更新本地状态 |
| 取消报名 | 免费沿用原规则。收费走 5.5 |
| `GET /me/wallet` | `{ availableCents, pendingCents }`。无提现字段 |

小程序：收费活动的报名按钮拉起微信支付。支付完成前展示待支付。个人页展示待结算和可用余额，不提供提现。「我的报名」对 `pending_payment` 显示待支付，并可再次拉起。

Admin 不增加页面，也不增加改余额的接口。

## 8. 微信适配

业务服务只依赖下面四个动作，不在报名服务里拼签名细节：

| 动作 | 结果 |
| --- | --- |
| 下单 | 成功返回 `prepayId`；商户单号重复作为明确结果交给 5.2 |
| 查单 | 未支付、已支付、已关闭 |
| 关单 | 成功，或订单已支付 |
| 退款 | 成功、处理中、明确失败 |

调起参数中的时间戳和随机串每次现签，`prepayId` 沿用本地已保存的值。

## 9. 测试

单元测试覆盖，不调用真实微信：

- 免费报名仍直接确认，且不产生支付单
- 收费报名占名额；并发下不超过 `capacity`
- 15 分钟内第二次拉起不产生新的 `outTradeNo`
- 过期后再次报名使用新支付单，报名仍是同一行
- 回调金额不一致不确认；重复回调只确认一次
- 查单已支付但回调未到时，再次拉起不第二笔下单
- `refundable` 为 false 时用户不能取消收费报名
- 下架会退已支付报名；结算净额为 0
- 活动结束后退款被拒绝
- 抽成四舍五入、费率为空、净额为 0、结算重复执行不双入账
- 待结算不含已有结算单的活动

## 10. 文档顺序

写代码前：

1. 新增支付与结算 ADR，状态 Accepted。其中写明 ADR-0007 对 `feeType=paid`「拒绝报名」的替换范围，以及本阶段不做提现。
2. 更新 `docs/roadmap.md`：本阶段包含收费报名与结算入账，提现仍留在 P2。
3. 更新 `docs/product/prd-summary.md` 里「首期不开放在线收款」的表述，划清本阶段已做收款与入账、未做提现。

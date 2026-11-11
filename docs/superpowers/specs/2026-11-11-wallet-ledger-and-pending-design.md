# 钱包余额明细与待结算列表设计规格

- **日期：** 2026-11-11
- **状态：** Implemented
- **ADR：** [ADR-0014](../../adr/0014-paid-registration-and-settlement.md)（2026-11-11 修订）
- **前置：** [收费报名与结算](./2026-10-24-paid-registration-and-settlement-design.md)、[结算入账计划](../plans/2026-10-24-activity-settlement-wallet.md)
- **范围：** 小程序只读查看余额流水与待结算活动列表；从「我的」钱包双金额入口进入。
- **不在本阶段：** 提现、冻结余额、出账类型写入、Admin 改余额/调账、支付宝。

## 1. 目标

发布者除看到可用余额与待结算汇总外，还能分别查看：

1. **余额明细**：账户全部入账/出账流水（本阶段数据仅有结算入账；页面按全量流水设计，未来出账自然出现）。
2. **待结算活动**：构成「待结算」汇总的各未结算收费活动及单活动预估净额。

成功标准：

- 点「可用余额」或「待结算」均可进入同一钱包页（金额为 0 也可进；可用余额为 0 不代表无历史流水）。
- 默认 Tab 随入口：可用余额 → 余额明细；待结算 → 待结算。
- 顶栏保留双金额；点顶栏金额可切换 Tab。
- 活动相关流水行、待结算行可跳转活动详情。
- 待结算列表各行 `pendingCents` 之和等于 `GET /me/wallet` 的 `pendingCents`。
- 不出现提现入口或改余额能力。

## 2. 已确认决策

| 项 | 结论 |
| --- | --- |
| 页面组织 | 同一钱包页 + 两个 Tab（非两个独立页） |
| 顶栏 | 保留可用余额与待结算双摘要 |
| 流水语义 | 全量入账/出账明细；本阶段仅有 `settlement_credit` |
| 待结算行跳转 | 可进活动详情 |
| 流水手跳转 | 活动入账（有 `activityId`）可进活动详情 |
| 金额为 0 | 入口仍可点；空列表用空态文案 |
| API | 两个只读分页接口 + 沿用现有摘要接口 |
| ADR | 扩写 ADR-0014，不新开 ADR |
| 提现 | 不做 |

## 3. 小程序行为

### 3.1 入口（「我的」/ `registrations` 钱包卡）

- 将可用余额、待结算拆成两个可点子区域；点击不冒泡到头像/登录区域。
- `navigateTo` 钱包页，query：`tab=ledger` 或 `tab=pending`。
- 未登录不展示钱包区（与现行为一致）；登录后无论金额是否为 0 均可点。

### 3.2 钱包页（如 `pages/mine/wallet`）

- 顶栏：可用余额、待结算（数据来自 `GET /me/wallet`）；点击对应金额切换 Tab。
- Tab：「余额明细」|「待结算」。
- 打开时按 `tab` 选中对应面板；缺省或非法值按 `ledger`。
- 明细空态：「暂无流水」。
- 待结算空态：「暂无待结算活动」。
- 摘要失败：顶栏显示 `--`，不把失败当成 ¥0.00。
- 当前 Tab 列表失败：错误态 + 可重试；不影响另一 Tab 已加载数据（若有）。

### 3.3 行交互

| 列表 | 展示 | 点击 |
| --- | --- | --- |
| 余额明细 | 标题、类型文案（如「结算入账」）、`±¥`、日期 | 有 `activityId` → `/pages/activity/detail?id=`；无则不可跳或仅无跳转 |
| 待结算 | 标题、预估净额、结束时间/生命周期 | → 活动详情 |

活动详情打开失败（删除等）由详情页处理；列表行不因此隐藏。

## 4. API

均需登录用户本人（`UserJwtGuard`）。分页与社区等现有接口一致：`page` / `pageSize`，返回 `{ items, total, page, pageSize }`。

### 4.1 `GET /me/wallet`（已有）

`{ availableCents, pendingCents }`。钱包页顶栏继续使用。

### 4.2 `GET /me/wallet/ledger`

查询当前用户 `WalletAccount` 下 `LedgerEntry`，`createdAt` 倒序。无账户 → `items=[]`，`total=0`。

| 字段 | 说明 |
| --- | --- |
| `id` | 流水 id |
| `type` | 如 `settlement_credit`；前端映射文案 |
| `availableDeltaCents` | 正入账、负出账（本阶段无负值） |
| `availableAfterCents` | 入账后可用余额 |
| `createdAt` | 时间 |
| `title` | 展示标题；活动入账取活动标题（活动缺失时可用占位如「活动已删除」） |
| `activityId` | 可跳转时返回；否则 `null` |

本阶段：`type=settlement_credit` 且现写入 `refType=activity`、`refId=activityId`，故 `activityId` 取自 `refId`。

### 4.3 `GET /me/wallet/pending`

本人拥有、`feeType=paid`、尚无 `ActivitySettlement` 的活动。单行 `pendingCents` 算法与 `getWallet` 内单活动算法一致（已支付含曾退款单的 gross − 成功退款 − 当前 `platformFeeBps` 抽成）。排序：`endAt` 升序。

| 字段 | 说明 |
| --- | --- |
| `activityId` | 活动 id |
| `title` | 标题 |
| `pendingCents` | 该活动预估净额 |
| `endAt` | 结束时间 |
| `lifecycle` | 生命周期 |

全量（非仅当前页）各行 `pendingCents` 之和必须等于同一时刻 `GET /me/wallet.pendingCents`（实现上复用同一套计算，避免两套公式）。

## 5. 共享与文档

- `packages/shared`：流水/待结算列表 DTO 或类型、`LedgerEntryType` 展示文案映射（若 mp 需要集中常量）。
- ADR-0014 增加「钱包只读明细」决策；仍禁止提现与 Admin 改余额。
- 本规格实现后更新 roadmap checklist（若有对应条目）与 ADR 实现备注。

## 6. 测试要点

- 无钱包账户：ledger 空列表；pending 按未结算活动返回。
- 结算入账后：ledger 出现一行，`activityId` 正确，`availableDeltaCents` 等于净额。
- 已有 `ActivitySettlement` 的活动不出现在 pending。
- 多活动 pending 合计 = `getWallet().pendingCents`。
- 未认证 → 401。
- 分页边界：`page`/`pageSize` 规范化与现有 `normalizePaging` 一致。

## 7. 非目标回顾

- 不写入新的出账 `LedgerEntryType`（提现等仍属 P2）。
- 不在 Admin 增加流水或改余额页。
- 不改变结算入账与待结算计算公式（仅暴露只读列表）。

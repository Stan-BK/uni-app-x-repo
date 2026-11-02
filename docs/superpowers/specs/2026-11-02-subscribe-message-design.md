# 报名成功与活动开始订阅消息设计规格

- **日期：** 2026-11-02
- **状态：** Accepted（[ADR-0015](../../adr/0015-subscribe-message.md)）
- **关联 ADR：** [0015](../../adr/0015-subscribe-message.md)
- **关联：** roadmap P1-4；[ADR-0007](../../adr/0007-registration-idempotency-and-capacity.md)、[ADR-0010](../../adr/0010-backend-ops-stack.md)、[ADR-0014](../../adr/0014-paid-registration-and-settlement.md)
- **范围：** 微信一次性订阅：报名成功通知、活动开始前 1 小时提醒。授权在报名点击时一次要两个模板。
- **不在本阶段：** 支付结果通知、取消/退款/下架通知、长期订阅、新版支付订单号 Beta 卡片、分类筛选、举报、统计看板、提现、OSS、Redis、MQ、Admin 页面。

## 1. 目标

用户在微信里报上名之后能收到服务通知，并在开场前 1 小时再收到一条提醒。拒绝授权或非微信端不能挡报名。

成功标准：

- 免费报名变为 `confirmed` 时入队（有 `startAt` 则两条）；收费报名要到支付成功才入队。
- 微信端点提交会调起两个模板的授权；拒绝不影响报名。
- 开场提醒只发给仍为 `confirmed`、活动仍为未结束 `published` 的报名。
- 同一报名同一 `kind` 成功发送最多一次（取消后再次确认可再发）。
- 同一 `openId` 同一轮扫描最多发一条。
- H5 不调微信授权。Admin 无入口。

## 2. 已确认决策

| 项 | 结论 |
| --- | --- |
| 模板种类 | 仅 `registration_confirmed`、`activity_starting` |
| 支付结果 | 不做（与报名成功同时发会 43108） |
| 授权时机 | 报名按钮点击、表单校验通过后、提交 API 前；一次两个模板 |
| 自有确认框 | 授权前不弹。保存预填的弹窗仍在报名成功之后 |
| 入队时机 | 报名变为 `confirmed`；不以授权上报为准 |
| 开场提前量 | `startAt - 1 小时`；已不足 1 小时则尽快发，但与报名成功至少错开 1 分钟 |
| 取消 | 未发的开场提醒 `cancelled`；已发送不撤回 |
| 存储 | `SubscribeMessageJob`；进程内扫描；无 Redis/MQ |
| 模板 ID | 环境变量；公共模板稍后在微信公众平台选取 |
| 文案 | 只锁字段语义：名称、开始时间、地点、固定状态 |
| 接收人 | 仅报名者微信 `openId`。不通知主办 |
| Admin | 不改 |

## 3. 数据

### 3.1 `SubscribeMessageKind`

`registration_confirmed` | `activity_starting`

放 `packages/shared`。

### 3.2 `SubscribeMessageJob`

| 字段 | 规则 |
| --- | --- |
| `id` | cuid |
| `registrationId` | 所属报名 |
| `kind` | 见 3.1 |
| `dueAt` | 到期可发 |
| `status` | `pending` \| `sent` \| `skipped` \| `cancelled` |
| `attemptCount` | 默认 0；可重试失败时加 1 |
| `lastError` | 可选，截断短串；不含姓名、手机号、token |
| `sentAt` | 进入 `sent` 时写入 |
| `createdAt` / `updatedAt` | 常规 |

约束：`@@unique([registrationId, kind])`；`@@index([status, dueAt])`。`registrationId` 外键到 `Registration`。

同一用户取消后再报，仍是同一行 `Registration`。再次变为 `confirmed` 时 **upsert**：`status = pending`，刷新 `dueAt`，`attemptCount = 0`，清空 `lastError` / `sentAt`。

### 3.3 入队

在把报名写成 `confirmed` 的同一事务内：

| 条件 | 行为 |
| --- | --- |
| 免费报名新建或取消后重报 | 入队两条（开场提醒取决于 `startAt`） |
| 收费支付成功，`pending_payment` → `confirmed` | 同上 |
| 响应 `alreadyRegistered: true`（已是 `confirmed`） | 不入队、不 upsert |
| `pending_payment` | 不入队 |
| 活动无 `startAt` | 只入队 `registration_confirmed` |

`registration_confirmed.dueAt = now`。

`activity_starting.dueAt = startAt - 1h`。若该时间不晚于 `registration_confirmed.dueAt`，则改为 `registration_confirmed.dueAt + 60s`。

### 3.4 作废

把仍为 `pending` 的任务改为 `cancelled`（`sent` / `skipped` 不动）：

- 用户取消该报名：该报名下全部 `pending` job（含尚未发出的报名成功）
- 活动退回草稿、取消、运营下架：该活动下全部相关报名的 `pending` job

## 4. 扫描与发送

`SubscribeMessageScanner`：`OnModuleInit` 里 `setInterval` 60s，与关单/结算相同。`NODE_ENV=test` 或 `VITEST` 不启动。可在读相关报名时顺带尝试到期任务，但扫描是主路径。

每轮：

1. 取 `status=pending` 且 `dueAt <= now` 的任务，按 `dueAt` 升序，单轮最多 50 条。
2. 加载报名、活动、用户的 `provider=weixin` 身份。
3. 发送前再判：报名必须是 `confirmed`；活动必须是 `lifecycle=published` 且 `now < endAt`（无 `endAt` 则只要求 `published`）。否则该任务 `cancelled`，不调微信。
4. 同一 `openId` 本轮已成功或已发起一次发送，则其余任务留到下一轮。
5. 无微信身份、模板 ID 未配置：`skipped`。
6. 调用微信 `subscribeMessage.send`。成功：`sent`，写 `sentAt`。
7. 失败见 §6。

微信 `access_token` 进程内缓存到过期前，不写 Redis。

跳转 `page`：`pages/activity/detail?id={activityId}`。`miniprogram_state` 来自环境变量，缺省 `formal`；本地开发可设 `developer`。

## 5. 模板字段

公共模板稍后选取。实现按所选模板关键词名映射，语义固定：

| 语义 | 报名成功 | 开场提醒 | 微信类型约束 |
| --- | --- | --- | --- |
| 活动名称 | `title`，超长截断 | 同左 | `thing` ≤ 20 字符 |
| 开始时间 | `startAt`，格式 `yyyy年M月d日 HH:mm`；无则「时间待定」 | 同左 | `date` 或 `time`，按模板 |
| 地点 | `place` trim；空则「地点待定」 | 同左 | `thing` ≤ 20 字符 |
| 状态 | 固定「报名成功」 | 固定「即将开始」 | `phrase` ≤ 5 个汉字 |

截断按 Unicode 码元（`Array.from(s).slice(0, n).join("")`）。不含姓名、手机号。

环境变量：

| 端 | 变量 |
| --- | --- |
| API | `WEIXIN_SUBSCRIBE_TMPL_REGISTRATION_CONFIRMED`、`WEIXIN_SUBSCRIBE_TMPL_ACTIVITY_STARTING`、`WEIXIN_SUBSCRIBE_MINIPROGRAM_STATE` |
| mp | `VITE_WEIXIN_SUBSCRIBE_TMPL_REGISTRATION_CONFIRMED`、`VITE_WEIXIN_SUBSCRIBE_TMPL_ACTIVITY_STARTING` |

两端模板 ID 必须相同。未配置时：mp 不调授权接口；API 将到期任务 `skipped`。

## 6. 失败

| 情况 | 结果 |
| --- | --- |
| 43101 用户未订阅 / 次数用完 | `skipped`，不重试 |
| 40037 / 47003 模板或字段非法 | `skipped` |
| 无 openId、模板 ID 空 | `skipped` |
| 网络失败、微信 5xx、43108 | `attemptCount + 1`，保持 `pending`；`attemptCount >= 3` 则 `skipped` |
| 报名接口本身 | 不因订阅失败而失败 |

`lastError` 只记错误码或短英文/数字串。

## 7. 小程序

报名页提交按钮的点击处理：

1. 表单校验。
2. `requestRegistrationSubscribe()`（适配层）。微信：`wx.requestSubscribeMessage`，`tmplIds` 只包含已配置的模板 ID；一个都没有则不调用。必须在该点击同步调用栈里发起，等待弹窗结束再继续。
3. 再调报名 API；收费再拉起支付。

适配层：`apps/mp/src/adapters/subscribe.ts`。H5 / 非微信：立即成功返回，不调微信。业务页不写 `#ifdef`。

授权全拒、只开一个、主开关关闭、接口失败：不 toast 订阅错误，继续报名。授权结果不上报 API。

每次点提交都调一次（「总是保持以上选择」时不弹窗仍要调，才能加次数）。已报过的幂等成功不入队，多出的额度留在微信。

开发旁路无真实 openId：发送侧 `skipped`。保存预填弹窗仍在真正报名成功之后。

## 8. 测试

单元测试不打真实微信（端口 fake）：

- 免费 `confirmed` 入队两条；无 `startAt` 只入队报名成功
- 收费 `pending_payment` 不入队；支付确认后入队
- `alreadyRegistered` 不入队
- 取消报名、活动取消/下架 → 未发的 `activity_starting` 为 `cancelled`
- 发送成功 → `sent`；43101 → `skipped`；5xx 三次 → `skipped`
- 距开始不足 1 小时：两条 `dueAt` 至少差 60s
- 同一轮同一 openId 两条待发只发出一条
- 条件不满足（已取消、活动非 published）到期任务改为 `cancelled` 且不调微信
- 取消后再次 `confirmed` 会 upsert 为 `pending` 并刷新 `dueAt`

小程序：适配层可 mock。手测：同意两个、只开一个、全拒、H5。模板未配置时报名仍成功。

## 9. 文档顺序

写代码前：本规格审阅通过后，将 ADR-0015 改为 `Accepted`。roadmap P1-4 与 PRD D-13 已写入，实现完成后勾选。

分类筛选、举报、看板不在本期。

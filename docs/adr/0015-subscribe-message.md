# ADR-0015: 报名成功与活动开始订阅消息

- **状态：** Implemented
- **日期：** 2026-11-02
- **关联：** roadmap P1-4、[ADR-0007](./0007-registration-idempotency-and-capacity.md)、[ADR-0010](./0010-backend-ops-stack.md)、[ADR-0014](./0014-paid-registration-and-settlement.md)
- **设计规格：** [docs/superpowers/specs/2026-11-02-subscribe-message-design.md](../superpowers/specs/2026-11-02-subscribe-message-design.md)

## 背景

P1-3 已能收费报名、退款、结算入账，但用户收不到服务通知。roadmap P1 后置含订阅消息与活动开始提醒。微信一次性订阅：用户 accept 一次仅可发一条；账号日配额（开通支付后 3000 万条/日）对当前日活不是约束。长期订阅不对本产品类目开放。支付结果通知与报名成功在收费路径上几乎同时，会触发 43108（并发发给同一用户），本期不做支付结果。

约束：不上 Redis / MQ；发送失败不得回滚报名；H5 无订阅弹窗；Admin 不增加入口。

## 决策

1. **只发两类一次性订阅消息：** `registration_confirmed`（报名成功）与 `activity_starting`（活动开始前 1 小时）。不发支付结果、取消、退款、下架。
2. **授权在点报名时一次要齐两个模板。** 必须跟在点击后面，经 `apps/mp` `adapters/subscribe.ts` 调用 `wx.requestSubscribeMessage`。H5 / 非微信适配层空操作。拒绝、只开一个、接口失败都不挡报名。授权结果不上报 API。
3. **入队以报名为准，不以授权为准。** 报名变为 `confirmed` 时写入两条 `SubscribeMessageJob`（无 `startAt` 则不写开场提醒）。收费报名在支付成功确认后才入队；`pending_payment` 与幂等已报名不入队。微信额度以微信为准；本地只保证同一报名同一 `kind` 同时最多一条待发任务，发送成功最多一次（取消后再次确认可 upsert 再发）。
4. **进程内扫描发送。** 与关单/结算相同，约每分钟一轮。到期且报名仍为 `confirmed`、活动仍为未结束的 `published` 才发。同一 `openId` 同一轮最多发一条。距开始不足 1 小时的开场提醒与报名成功至少错开 1 分钟。
5. **取消作废未发任务。** 用户取消报名、退回草稿、取消活动、运营下架：相关报名下仍为 `pending` 的 job（含尚未发出的报名成功）改为 `cancelled`。已 `sent` 不撤回。
6. **模板 ID 为环境变量。** 公共模板在微信公众平台稍后选取；填入字段语义固定为活动名称、开始时间、地点、状态文案。未配置模板时发送记 `skipped`。
7. **失败分级。** 无微信身份、43101、非法模板：`skipped`，不重试。网络 / 5xx / 43108：保持 `pending`，最多 3 次后 `skipped`。不把失败传给报名 API。

## 备选方案

| 方案 | 优点 | 缺点 |
| --- | --- | --- |
| 本地队列 + 扫描（本决策） | 与现有扫描器一致；无 Redis/MQ；授权与报名解耦 | 未授权也会入队，发送时 43101 |
| 小程序上报授权再入队 | 队列更干净 | 「总是保持」静默加次与上报易不一致 |
| 打开小程序再补发 | 实现短 | 用户不打开则收不到开场提醒 |
| 支付结果与报名成功分开发 | 文案更细 | 同时发送 43108；多耗一次授权 |

## 后果

- 正面：报名闭环有服务通知；开场前可提醒；不碰支付状态机与提现。
- 负面 / 跟进：须在微信公众平台申请两个一次性模板；真机才能验弹窗；开发旁路无真实 openId 时只能 `skipped`。
- 实现已合入 `feat/p1-4-subscribe-message`；真机验收见实现备注清单。分类筛选、举报、看板仍后置。

## 实现备注

Admin 不改。验收标准见规格 §8。

### 入口

- shared（kind 枚举）：`packages/shared/src/subscribe-message.ts`
- job / 扫描 / 发送：`apps/api/src/subscribe-messages/`
- 免费报名确认入队：`apps/api/src/registrations/registrations.service.ts`
- 收费报名支付成功入队：`apps/api/src/payments/payments.service.ts`
- 关闭 / 取消作废 job：`apps/api/src/registrations/prisma-registration-cancel.hook.ts`；退款路径见 `apps/api/src/payments/payments.service.ts`
- mp：`apps/mp/src/adapters/subscribe.ts`、`apps/mp/src/pages/register/index.vue`
- 环境变量：`apps/api/.env.example` 中 `WEIXIN_SUBSCRIBE_TMPL_*`（及 `WEIXIN_SUBSCRIBE_MINIPROGRAM_STATE`）；`apps/mp/.env.example` 中 `VITE_WEIXIN_SUBSCRIBE_TMPL_*`

### 待真机/开发者工具验收

以下需在微信开发者工具或真机手测，自动化环境未执行：

1. 微信：配置两个 tmplId，点报名，弹窗同意两个，免费报名后服务通知出现报名成功（扫描约 1 分钟内）。
2. 只开「开场提醒」：报名成功，无报名成功通知，不报错。
3. 全拒：报名成功。
4. 收费：待支付不通知；支付成功后才入队。
5. H5：无授权弹窗，报名成功。
6. 取消报名后，开场提醒不再发送。
7. 模板 ID 留空：报名成功，job 扫描后 `skipped`。

# ADR-0013: 报名联系人资料与表单预填

- **状态：** Implemented
- **日期：** 2026-10-23
- **关联：** roadmap P1-2、PRD D-08 / D-10 / D-12、[ADR-0012](./0012-user-profile-display.md)、[ADR-0007](./0007-registration-idempotency-and-capacity.md)、[ADR-0006](./0006-activity-discovery-and-public-visibility.md)、[ADR-0009](./0009-e2e-acceptance-and-observability.md)
- **设计规格：** [docs/superpowers/specs/2026-10-23-registration-contact-prefill-design.md](../superpowers/specs/2026-10-23-registration-contact-prefill-design.md)

## 背景

免费报名表仍是姓名 + 手机号（D-08），但每次从空白开始填。P1-1 只开放展示昵称/头像；`User.phone` 空置，也没有报名用的真实姓名。展示昵称不能当报名真名。约束：不上微信 `getPhoneNumber`；不强制完善资料；公开接口不出手机号。

## 决策

1. **资料默认联系人与报名快照分离。** `User.realName` / `User.phone` 是下次预填的默认值。每次报名仍把 `name` / `phone` 写入 `Registration` 快照；主办名单读快照，不随后来改资料而变。
2. **新增 `User.realName`，开放已有 `User.phone`。** 与 `nickname` 独立。手机号不设唯一约束。
3. **`GET /me` 给本人返回 `realName`、`phone`。** 登录响应 `AuthUserView` 不加这两项。公开活动列表/详情仍不含手机号（ADR-0006）。
4. **`PATCH /me` 可部分更新 `realName` / `phone`。** 姓名 trim 后最长 32，空串为 `null`；手机号 `^1\d{10}$` 或 `null`/空串清空。非法手机号 400。至少改一项（含原有昵称/头像）。
5. **报名不静默回写资料。** 创建/恢复报名只写 `Registration` 快照。创建响带 `alreadyRegistered`：已 `confirmed` 幂等返回为 `true`，新建或取消后重报为 `false`。取消报名不改资料。
6. **有改动且报名成功后，用户确认才更新预填。** 小程序在真正报名成功（`alreadyRegistered === false`）后，若本次姓名/手机号与 `GET /me` 默认联系人不同，弹窗询问是否保存为下次预填；确认后 `PATCH /me`。相同则不问。当场改过的表单值不被预填覆盖；不强制完善资料。
7. **「我的信息」可编辑默认联系人。** 不改 L1 Tab。不做微信一键取号。日志不写姓名/手机号（ADR-0009）。

## 备选方案

| 方案 | 优点 | 缺点 |
| --- | --- | --- |
| 资料落库 + 用户确认后更新预填（本决策） | 第一次填完可复用；不静默改资料 | 多一个 `realName` 列；多一次确认 |
| 只读最近一次报名快照预填 | 不改 User | 多一次列表请求；资料页改不了 |
| 微信 `getPhoneNumber` | 少打字 | 要认证小程序 + 后端换号，超出本期 |

## 后果

- 正面：第二次及以后报名可预填；默认联系人需用户确认或在个人页维护，避免静默覆盖。
- 负面 / 跟进：本地/服务端同时持有明文手机号（仅本人 JWT 与主办名单快照）；一键取号仍后置。
- 不写 AuditLog；不新增业务事件。

## 实现备注

- 涉及：`packages/shared` 校验常量；Prisma `User.realName`；`apps/api` Auth + Registrations；`apps/mp` `GET /me`、报名页、个人页。Admin 不改。
- 验收：见规格 §9。

# ADR-0017: 活动签到（确认到场）

- **状态：** Implemented
- **日期：** 2026-11-15
- **关联：** roadmap P2 / 独立里程碑「签到」、[ADR-0005](./0005-activity-lifecycle-and-model.md)、[ADR-0007](./0007-registration-idempotency-and-capacity.md)
- **设计规格：** [docs/superpowers/specs/2026-11-15-activity-check-in-design.md](../superpowers/specs/2026-11-15-activity-check-in-design.md)
- **实现计划：** [docs/superpowers/plans/2026-11-15-activity-check-in.md](../superpowers/plans/2026-11-15-activity-check-in.md)

## 背景

组织者需要在活动现场确认「谁已到场」。人员关系已由 `Activity` 1—N `Registration` 表达（有效人员 = `confirmed`）。产品要求：参与者出示动态短时二维码、所有者扫码；名单区分已/未签到；所有者可手动标记（二次确认）；不可撤销；活动结束前可签到。约束：不上 Redis/MQ；不做 Admin/协管员/票务核销扩展。

## 决策

1. **挂在 `Registration` 上，不建独立 CheckIn 表（首期）。**  
   新增 `checkedInAt`、`checkedInByUserId`；已签到判定为 `checkedInAt != null`。

2. **操作者仅活动 `ownerUserId`。** 扫码与手动均如此；二次确认只在客户端。

3. **时间窗：** 须有 `endAt` 且 `now < endAt`；`lifecycle = published`；报名 `confirmed`。不要求已过 `startAt`。`endAt` 为空则拒绝签到与发码。

4. **动态短时码 = 无状态 JWT。** claims 含 `purpose: "checkin"`、`registrationId`、`activityId`、`sub`；默认 TTL 180s（`CHECK_IN_TOKEN_TTL_SEC`）。复用 `JWT_USER_SECRET`，校验必须断言 `purpose`。不落库、不强制一码一用。

5. **幂等、不可撤销。** 重复签到 HTTP 200 + `alreadyCheckedIn: true`。不提供撤销 API。已签到参与者发码返回 409 + `CHECK_IN_ALREADY_DONE`，端上不展示码。

6. **API 边界（摘要）：**  
   - `POST /registrations/:id/check-in-token`（本人发码）  
   - `POST /me/activities/:activityId/check-in`（所有者扫码，body.token）  
   - `POST /me/activities/:activityId/registrations/:registrationId/check-in`（所有者手动）  
   - 扩展 `GET /me/activities/:id/registrations`：`checkedIn` 筛选 + count  

7. **错误码** 进 `packages/shared`（`CheckInErrorCode`）。Admin 本阶段不改。

## 备选方案

| 方案 | 优点 | 缺点 |
| --- | --- | --- |
| Registration 字段 + 无状态 JWT（本决策） | 改动小、无 Redis、贴合一次性到场 | 审计流水弱；难扩展多次入场 |
| 独立 CheckIn 表 | 审计清晰 | 首期过重 |
| 短时 token 落库 | 可吊销、一码一用 | 多表与清理；收益有限 |

## 后果

- 正面：现场签到可落地；与现有报名/名单一致；符合 MVP 中间件约束。  
- 负面 / 跟进：roadmap 将签到自「明确不做」中拆为可交付的 P2 切片；若需协管员/撤销/多次入场另立 ADR。  
- 实现已完成，本 ADR 已标为 `Implemented`（2026-11-15）。

## 实现备注

- 涉及：`packages/shared`、`apps/api`（Prisma、registrations/activities）、`apps/mp`（签到码页、组织者签到工作台、扫码适配）  
- 验收：规格 AT-CI-01～09  
- **已签到后不可取消报名：** 用户取消时若 `checkedInAt` 非空，返回 409 `CHECK_IN_CANCEL_NOT_ALLOWED`（「已签到，无法取消报名」），不触发退款；核销写入条件含 `status = confirmed`，三条签到 POST 路由显式返回 200。  
- **落地情况（2026-11-15）：** shared `CheckInErrorCode`；Prisma `Registration.checkedInAt/checkedInByUserId`（迁移 `20261115111809_activity_check_in`）；`CheckInService` 发码/验签/幂等核销 + 三条 HTTP 路由；所有者名单 `checkedIn` 筛选与 count；mp 参与者签到码页、组织者签到工作台与扫码适配。API 全量测试 283 passed / 21 skipped，build tsc 通过；微信开发者工具手测待人工执行。

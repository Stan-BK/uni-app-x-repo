# ADR-0009: 联调、验收与观测基线

- **状态：** Implemented
- **日期：** 2026-10-21
- **关联：** roadmap P0-6、[ADR-0010](./0010-backend-ops-stack.md) 阶段 A/B 出口、[ADR-0007](./0007-registration-idempotency-and-capacity.md)、[ADR-0008](./0008-operational-governance-audit-logs.md)
- **设计规格：** [docs/superpowers/specs/2026-10-21-p0-6-e2e-acceptance-design.md](../superpowers/specs/2026-10-21-p0-6-e2e-acceptance-design.md)
- **实现计划：** [docs/superpowers/plans/2026-10-21-p0-6-e2e-acceptance.md](../superpowers/plans/2026-10-21-p0-6-e2e-acceptance.md)

## 背景

P0-1～P0-5 已形成「登录—发布—发现—免费报名—冻结/下架/审计」闭环，但缺少试运营验收基线：没有探活、没有约定环境变量、错误码只散落在 shared、没有可重复冒烟、也没有最小业务事件记录。

约束：MVP 不上 Redis / MQ / Sentry / pino / 支付；不上事件表；不改现有 HTTP 错误形状。

## 决策

1. **P0-6 范围（薄增量）**  
   - 环境变量与错误码约定（文档 + 补齐 `.env.example`）。  
   - `GET /api/health` 探活。  
   - 三个业务成功事件的结构化 JSON 日志。  
   - API 冒烟脚本 + mp / Admin 手测清单。  
   - 不做：统一 `{ code, message }` 信封、Sentry、OSS/CDN、CI 跑冒烟、Admin 登录埋点、事件表、Playwright。

2. **错误码只收口、不改契约**  
   沿用 `packages/shared` 已有 `PublicActivityErrorCode` / `RegistrationErrorCode`。Admin 冻结/下架/登录失败继续用 401/403/400 + `message`。

3. **环境变量**  
   三端 `.env.example` 与本文表格对齐。API 启动只校验 `DATABASE_URL`、`JWT_USER_SECRET`、`JWT_ADMIN_SECRET`，缺则退出。

4. **探活**  
   `GET /api/health` 公开、不查库，返回 `{ status: "ok", time }`。

5. **业务事件日志**  
   Nest `Logger` 打一行 JSON：`event`、`actorId`、`targetId`、`at`。  
   仅：`user.login`（签发用户 JWT）、`activity.publish`（首次进入 `published`）、`registration.create`（新创建有效报名）。  
   不写 token / 手机号 / openid / 姓名。

6. **冒烟**  
   `pnpm --filter @activity/api smoke`：health → 用户登录 → 发布免费活动 → 报名 → Admin 冻结 → 查审计 → 恢复发布权。  
   mp / Admin 用手测清单。不进 CI。

## 备选方案

| 方案 | 优点 | 缺点 |
| --- | --- | --- |
| 薄增量（本决策） | 立刻可试运营；改动面小 | 错误信封仍不统一；无第三方错误追踪 |
| 先统一错误信封 + JSON logger | 契约更干净 | P0-6 变成大重构 |
| 接 Sentry / Playwright | 对齐运维阶段 B 观测 | 超出最小集，尚未选型 |

## 后果

- 正面：P0 闭环有探活、约定、可重复 API 冒烟和可 grep 的漏斗事件。  
- 负面 / 跟进：统一错误信封、Sentry、OSS 仍属后续；冒烟依赖 `AUTH_DEV_BYPASS` 与本地/体验环境。  
- 已落地：`GET /api/health` 探活；启动校验环境变量；`user.login` / `activity.publish` / `registration.create` 三事件；`pnpm --filter @activity/api smoke`。

## 实现备注

- 涉及：`apps/api`（health、启动校验、`logBusinessEvent`、smoke 脚本）、`packages/shared`（错误码目录导出，如需）、三端 `.env.example`、本文档与 roadmap P0-6。  
- 验收：单测全绿；smoke 退出码 0 且恢复 dev 用户发布权；日志可 grep 三个 `event`；手测清单无阻断。

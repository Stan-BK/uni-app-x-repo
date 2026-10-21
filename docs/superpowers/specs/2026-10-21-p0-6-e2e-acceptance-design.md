# P0-6 端到端验收与观测基线设计规格

- **日期：** 2026-10-21  
- **状态：** Implemented  
- **关联 ADR：** [0009](../../adr/0009-e2e-acceptance-and-observability.md)（Implemented）  
- **实现计划：** [docs/superpowers/plans/2026-10-21-p0-6-e2e-acceptance.md](../plans/2026-10-21-p0-6-e2e-acceptance.md)  
- **关联：** ADR-0007（报名）、ADR-0008（审计）、ADR-0010（运维阶段 A/B，本期不上 Sentry / OSS）

## 1. 目标

给已落地的 P0 闭环补上试运营验收基线：环境变量与错误码约定、探活、三个业务事件的结构化日志、可重复的 API 冒烟，以及 mp / Admin 手测清单。

成功标准：`pnpm --filter @activity/api test` 全绿；对已启动 API 跑 `pnpm --filter @activity/api smoke` 退出码 0；服务端日志能 grep 到三个 `event`；手测清单无阻断缺陷。

## 2. 产品决策摘要（已确认）

| 项 | 结论 |
| --- | --- |
| 范围 | 验收 + 最小观测（roadmap P0-6 三项都做） |
| 埋点 | 服务端结构化 JSON 日志，不建表、不上第三方 |
| 冒烟 | API 脚本 + 三端手测清单 |
| 做法 | 薄增量：不统一错误信封，不接 pino / Sentry / Playwright |
| 非目标 | 支付、Redis、MQ、OSS/CDN、CI 跑冒烟、Admin 登录埋点、事件表 |

## 3. 错误码约定

不改现有 HTTP 状态码和 body 形状。目录以 `packages/shared` 为准，ADR / 本规格引用同一份常量。

### 3.1 公开活动

| 常量 | 值 | 何时 |
| --- | --- | --- |
| `PublicActivityErrorCode.Cancelled` | `ACTIVITY_CANCELLED` | 分享/详情遇到已取消 |
| `PublicActivityErrorCode.Removed` | `ACTIVITY_REMOVED` | 分享/详情遇到已下架 |

### 3.2 报名

| 常量 | 值 |
| --- | --- |
| `PaidNotSupported` | `PAID_NOT_SUPPORTED` |
| `ActivityFull` | `ACTIVITY_FULL` |
| `ActivityEnded` | `ACTIVITY_ENDED` |
| `ActivityNotOpenable` | `ACTIVITY_NOT_OPENABLE` |
| `AlreadyRegistered` | `ALREADY_REGISTERED` |
| `NotCancellable` | `REGISTRATION_NOT_CANCELLABLE` |
| `RegistrationClosed` | `REGISTRATION_CLOSED` |
| `CancelNotAllowed` | `CANCEL_NOT_ALLOWED` |

### 3.3 不在本期补 `code` 的路径

Admin 登录失败、冻结/恢复、下架、用户 JWT 401/403、校验 400：继续用现有 `message`。

## 4. 环境变量

补齐三端 `.env.example`（Admin 新增）。文档不写真实密钥。

| 端 | 必填 | 可选 |
| --- | --- | --- |
| API | `DATABASE_URL`、`JWT_USER_SECRET`、`JWT_ADMIN_SECRET` | `JWT_EXPIRES_IN`、`WEIXIN_APPID`、`WEIXIN_SECRET`、`AUTH_DEV_BYPASS`、`ADMIN_BOOTSTRAP_EMAIL`、`ADMIN_BOOTSTRAP_PASSWORD`、`PORT`、`HOST`、`PUBLIC_API_BASE` |
| mp | `VITE_API_BASE` | `VITE_AUTH_DEV_BYPASS` |
| Admin | 无（默认 `http://127.0.0.1:3000/api`） | `VITE_API_BASE` |

API 启动时只校验三个必填项：缺失则打原因并 `process.exit(1)`。不做完整 schema 库。

## 5. 探活

`GET /api/health`（已有全局前缀 `api`）。

- 公开，无鉴权。  
- 不访问数据库。  
- 响应：`{ "status": "ok", "time": "<ISO-8601>" }`。  
- 冒烟脚本第一步调用。

## 6. 业务事件日志

成功路径打一行 JSON，便于 `grep '"event":"registration.create"'`。

实现：`logBusinessEvent({ event, actorId, targetId? })`，内部 `Logger.log(JSON.stringify({ event, actorId, targetId, at }))`。`at` 为 ISO-8601。不写 token、手机号、openid、姓名。

| event | 触发点 | actorId | targetId |
| --- | --- | --- | --- |
| `user.login` | `AuthService` 签发用户 JWT 成功（微信或 `AUTH_DEV_BYPASS`） | 用户 id | 省略 |
| `activity.publish` | 活动**首次**进入 `published`（直接发布或草稿发布） | 发布者 id | 活动 id |
| `registration.create` | **新创建**的 `confirmed` 报名（不是幂等返回已有记录） | 报名人 id | 报名 id |

不打：Admin 登录、保存草稿、幂等命中、失败路径。

单测：三个成功路径 assert `Logger.log` 收到含对应 `event` 的 JSON。

## 7. API 冒烟脚本

- 路径：`apps/api/scripts/p0-smoke.mjs`  
- 命令：`pnpm --filter @activity/api smoke`  
- 前置：API 已启动；`AUTH_DEV_BYPASS=true`；Admin 引导账号可用。  
- 读 `API_BASE`（默认 `http://127.0.0.1:3000/api`）与 `ADMIN_BOOTSTRAP_*`。不启动 Nest、不写 Prisma。

顺序：

1. `GET /health` → `status=ok`  
2. `POST /auth/weixin/login` `{ "code": "dev" }` → user JWT  
3. `POST /me/activities` 直接发布免费活动（标题含时间戳）  
4. `POST /registrations`（允许主办人自报）→ 新报名 id  
5. Admin 登录 → `POST /admin/users/:userId/freeze-publish` 原因 `p0-6-smoke`  
6. `GET /admin/audit-logs?action=freeze_publish&targetId=:userId` → `total >= 1`  
7. `POST /admin/users/:userId/unfreeze-publish` 原因 `p0-6-smoke-restore`（必须执行，避免污染本地用户）

任一步非 2xx 或断言失败：打印步骤名与状态，退出码 1。脚本不解析服务端日志文件。

不进 CI。CI 仍只跑 `vitest`。

## 8. 手测清单

写在本规格，实现时同步进 ADR 验收段。不当自动脚本。

### 8.1 mp

- [ ] 首页能搜到冒烟发布的活动  
- [ ] 详情可报名、可取消；「我的报名」有记录  
- [ ] 对已下架 / 已取消活动的分享链：无正文错误态（沿用 ADR-0006）

### 8.2 Admin

- [ ] `admin` 顶栏有「审计日志」，能看到冻结/恢复原因含 `p0-6-smoke`  
- [ ] `operator` 无「审计日志」入口；打开 `/audit-logs` 回到用户页；`GET /admin/audit-logs` 为 403（沿用 ADR-0008）

## 9. 文档与 roadmap

- 本规格 + ADR-0009 Accepted（实现后改 Implemented）  
- `docs/adr/README.md` 索引指向 0009  
- `docs/roadmap.md` P0-6 三项实现完再勾  
- 三端 `.env.example` 与 §4 对齐  

## 10. 验收

- [ ] `pnpm --filter @activity/api test` 全绿（含 health 与三个 event）  
- [ ] `pnpm --filter @activity/api smoke` 退出码 0，且 dev 用户发布权已恢复  
- [ ] 服务端日志可 grep `user.login` / `activity.publish` / `registration.create`  
- [ ] §8 手测无阻断  
- [ ] 无事件表、无 Sentry/pino、无支付/Redis/MQ

# P0-4 免费报名闭环设计规格

- **日期：** 2026-10-19  
- **状态：** Implemented  
- **关联 ADR：** [0007](../../adr/0007-registration-idempotency-and-capacity.md)（Implemented）  
- **关联：** ADR-0005（生命周期钩子）、ADR-0006（公开详情 / `displayStatus`）；支付 → P2

## 1. 目标

在服务端落地免费活动报名：姓名+手机、幂等、名额不超卖、我的报名、**用户主动取消**、组织者名单；公开详情启用满员态 `full`；退回草稿/取消/下架时取消有效报名。使 AT-REG-01～06 可验收。

## 2. 产品决策摘要（已确认）

| 项 | 结论 |
| --- | --- |
| 费用 | 仅 `feeType=free` 可报；`paid` 拒绝 + 端上禁用 CTA |
| 成功态 | 直接 `confirmed`（D-03）；无审核流 |
| 表单 | 姓名 + 手机号（D-08）；须登录 |
| 名额 | 有效报名 = `status=confirmed` 计数（D-04） |
| 用户取消 | P0-4 支持；仅本人；未结束且活动 `allowUserCancel=true` 可将 `confirmed` → `cancelled` 并释放名额（修订 D-06） |
| 报名截止 | 活动字段 `registrationDeadlineAt`（默认=`startAt`）；`now >= deadline` 不可报 |
| 可退款 | 活动字段 `refundable`（默认 false）；P0 仅展示，无退款流水 |
| 系统取消 | 退回草稿 / 取消活动 / 运营下架 → 有效报名改 `cancelled` |
| 并发 | Postgres 事务 + 活动行 `FOR UPDATE`；无 Redis |
| 幂等 | `@@unique([userId, activityId])` |

## 3. 数据模型

### 3.1 Prisma `Registration`（新增）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | cuid | PK |
| `activityId` | string | FK → Activity |
| `userId` | string | FK → User |
| `name` | string | 报名人姓名 |
| `phone` | string | 手机号 |
| `status` | enum | 与 shared `RegistrationStatus` 对齐 |
| `cancelledAt` | DateTime? | 系统/后续用户取消时写入 |
| `createdAt` / `updatedAt` | DateTime | |

约束与索引：

- `@@unique([userId, activityId])`
- `@@index([activityId, status])`
- `@@index([userId, createdAt])`

Activity / User 侧增加 `registrations` 关系。

### 3.2 有效报名

仅 `status = confirmed` 占用名额、计入满员判断。`cancelled` / `rejected` / `pending_review` 不占名额（P0 不产生后两者业务路径）。

### 3.3 重复报名与已取消记录

唯一约束下同一 `(userId, activityId)` 仅一行：

| 已有状态 | 再次提交 | 行为 |
| --- | --- | --- |
| `confirmed` | POST 报名 | **幂等成功**：返回已有 DTO（HTTP 200）；可选 `code: ALREADY_REGISTERED` 供端上提示，但不算错误阻断 |
| `cancelled` | POST 报名 | 若活动仍可报且有名额：更新为 `confirmed`，刷新 `name`/`phone`，清空 `cancelledAt`；否则按准入失败返回 |

## 4. API 契约

均挂在现有 Nest 全局前缀（如 `/api`）下；用户/组织者路由需对应 Guard。

### 4.1 `POST /registrations`

**鉴权：** 用户登录。

**Body：**

```json
{ "activityId": "<id>", "name": "张三", "phone": "13800138000" }
```

| 校验 | 失败 |
| --- | --- |
| `name` trim 非空，长度上限（建议 1～32） | 400 |
| `phone` 大陆手机号格式（实现约定正则） | 400 |
| 活动不存在 / 非 `published` | 404 或 409 + `ACTIVITY_NOT_OPENABLE` |
| 已结束 `now >= endAt` | 409 + `ACTIVITY_ENDED` |
| 报名截止 `now >= registrationDeadlineAt` | 409 + `REGISTRATION_CLOSED` |
| `feeType=paid` | 409 + `PAID_NOT_SUPPORTED` |
| 有效报名数 `>= capacity` | 409 + `ACTIVITY_FULL` |
| 已 `confirmed` | 200 + 已有报名（幂等） |

**成功：** 200/201 + Registration DTO。

**并发路径（权威）：**

```text
BEGIN
  lock Activity FOR UPDATE
  assert 准入
  upsert/insert Registration → confirmed
COMMIT
```

### 4.2 `POST /registrations/:id/cancel`（或 `DELETE /registrations/:id`）

**鉴权：** 用户登录；仅报名所有者。

| 条件 | 行为 |
| --- | --- |
| 报名不存在 / 非本人 | 404 / 403 |
| 已是 `cancelled` | 200 幂等，返回当前 DTO |
| `confirmed` 且活动 `now < endAt` 且 `allowUserCancel` | 事务内锁活动行 → 改 `cancelled` + `cancelledAt` → 释放名额 |
| `allowUserCancel=false` | 409 + `CANCEL_NOT_ALLOWED` |
| 活动已结束 | 409 + `ACTIVITY_ENDED`（不可再取消） |

取消成功后，公开 `displayStatus` 可能从 `full` 回落为 `open`。

### 4.3 `GET /registrations/me`

**鉴权：** 用户登录。  
**Query：** `page` / `pageSize`（默认 20，上限 50）；可选 `status`。  
**响应：** `{ items, total, page, pageSize }`；列表项含活动摘要（`id`、`title`、`coverUrl`、`startAt`、`place`、`displayStatus` 等最小集）+ 报名 `status`/`createdAt`。

### 4.4 `GET /organizer/activities/:activityId/registrations`

**鉴权：** 组织者且拥有该活动。  
**Query：** 分页同上。  
**响应：** 报名名单（含 `name`、`phone`、`status`、`createdAt`、`userId`）；越权 → 403。

### 4.5 公开详情联动

- `GET /public/activities/:id`：计算 `displayStatus` 时纳入满员（见 §5）。  
- 可选（推荐）：登录用户请求公开详情时增加 `myRegistration: { id, status } | null`（未登录恒 `null`），避免端上额外请求；若不加，则 mp 用「我的报名」或轻量 `GET /registrations/me?activityId=` 判断。

## 5. `displayStatus` 修订（相对 ADR-0006）

```text
if now >= endAt → ended
else if confirmedCount >= capacity → full
else if now >= (registrationDeadlineAt ?? startAt) → closed
else → open
```

展示态反映**报名通道**，不单独用「未开始」表示 `now < startAt`。活动尚未开场但报名未截止、未满员时为 `open`（报名中）。

- `packages/shared`：启用 `ActivityDisplayStatus.Full = "full"`。  
- 满员时报名接口仍返回 `ACTIVITY_FULL`；CTA 禁用。

## 6. 错误码（shared）

建议常量（名称可微调，须稳定字符串）：

| code | 场景 |
| --- | --- |
| `PAID_NOT_SUPPORTED` | paid 活动不可报 |
| `ACTIVITY_FULL` | 满员 |
| `ACTIVITY_ENDED` | 已结束 |
| `ACTIVITY_NOT_OPENABLE` | 非 published 等不可报 |
| `ALREADY_REGISTERED` | 幂等已报名（可随 200） |
| `REGISTRATION_NOT_CANCELLABLE` | 非 confirmed 或其它不可取消态（可选；已 cancelled 建议幂等 200） |

沿用公开详情的 `ACTIVITY_CANCELLED` / `ACTIVITY_REMOVED`。

## 7. 生命周期钩子

替换 [apps/api/src/activities/registration-cancel.hook.ts](../../../apps/api/src/activities/registration-cancel.hook.ts) 的 Noop：

- `cancelAllForActivity(activityId)`：将该活动下所有 `confirmed` 更新为 `cancelled`，写 `cancelledAt`。  
- 由既有 `unpublish` / `cancel` / admin `remove` 路径调用（已注入钩子处无需改调用点语义）。

## 8. 端上垂直切片

| 端 | 范围 |
| --- | --- |
| **mp** | 详情：免费且 `open` 可报；`full`/`ended`/`closed`/`paid` 禁用；报名表单页；提交/取消接 API；「我的报名」列表可取消未结束活动的报名 |
| **mp 组织者** | 活动详情/管理入口进入报名名单 |
| **admin** | 本阶段可不改名单 UI |
| **api** | RegistrationsModule + Prisma migration + 钩子实现 + 公开 `full` |

登录：未登录点报名 → 走现有登录适配后再回跳表单。

## 9. 权限与越权

- 不可替他人报名（`userId` 取自 token）。  
- 组织者名单仅本人活动；跨组织者 → 403。  
- 名额与状态不信任 query/body 中的客户端计数。

## 10. 验收（AT-REG 对照）

| 项 | 预期 |
| --- | --- |
| AT-REG-01 | 登录用户可对 free + published + 未结束 + 未满员活动报名成功 |
| AT-REG-02 | 表单校验失败不落库 |
| AT-REG-03 | 重复提交幂等，名额不双占 |
| AT-REG-04 | 并发报名不超 `capacity` |
| AT-REG-05 | 满员后拒绝；展示 `full` |
| AT-REG-06 | 非所有者不可拉名单；paid/已结束/非 published 不可报 |
| 用户取消 | 本人可取消未结束活动的 confirmed；名额释放；可再报（有名额时） |
| 钩子 | 退回/取消/下架后原 confirmed 变 cancelled，名额释放 |

（具体编号以 PRD 第十章为准；冲突以本规格 + ADR-0007 为准。）

## 11. 非目标

- 在线支付 / 退款 / paid 可报  
- 候补、审核制报名  
- Redis / MQ  
- Admin 报名审核队列（P0-5）  
- 分类筛选等 P1 发现能力  

## 12. 文档同步清单

- [x] ADR-0007 Accepted  
- [x] roadmap P0-4 挂上 ADR / 本规格链接  
- [x] 实现计划 [docs/superpowers/plans/2026-10-19-p0-4-free-registration.md](../plans/2026-10-19-p0-4-free-registration.md)  
- [x] 实现后 ADR → Implemented；本规格 → Implemented

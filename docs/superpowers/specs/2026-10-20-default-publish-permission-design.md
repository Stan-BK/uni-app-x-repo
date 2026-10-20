# 用户默认可发布（取消组织者）设计规格

- **日期：** 2026-10-20  
- **状态：** Implemented  
- **关联 ADR：** [0011](../../adr/0011-default-publish-permission.md)（Implemented，取代 ADR-0003 的 Organizer 部分）  
- **关联：** ADR-0004～0007 修订、roadmap P0-5 / ADR-0008；支付仍 P2

## 1. 目标

取消「组织者」角色与申请审核。登录用户**默认可以发布活动**；运营可在后台收回发布权。公开详情「主办」使用用户昵称。为 P0-5 治理（冻结、下架、审计）铺平模型。

## 2. 产品决策摘要（已确认）

| 项 | 结论 |
| --- | --- |
| 组织者角色 | **取消**；不申请、不审核「成为组织者」 |
| 发布权 | `User.canPublish` 默认 `true`；后台可冻结/恢复 |
| 活动归属 | `Activity.ownerUserId` → 用户 |
| 主办展示 | `hostName` = 用户昵称；空则「用户」 |
| 冻结后 | 不可新建、不可发布；已有活动不自动下架；运营仍可下架 |
| 报名名单 | 活动所有者可看；非所有者 403 |
| 支付 | 不变，仍 P2 |

## 3. 数据模型

### 3.1 `User` 增补

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `canPublish` | Boolean `@default(true)` | 发布权；冻结为 `false` |

`nickname` / `avatarUrl` / `status` 不变。删除 `User.organizer` 关系。

### 3.2 删除

- 模型 `Organizer`  
- 枚举 `PublishStatus`  
- 共享常量里的组织者申请态（若仍导出）

### 3.3 `Activity`

| 现字段 | 改为 |
| --- | --- |
| `organizerId` → Organizer | `ownerUserId` → User |

生命周期、报名策略字段不变（ADR-0005 / 0007）。

### 3.4 迁移

1. `User.canPublish` 默认 `true`。  
2. 新增 `Activity.ownerUserId`，用 `Organizer.ownerUserId` 回填。  
3. `Organizer.publishStatus = frozen` 的所有者：`canPublish = false`。其余（含 `none/pending/approved/rejected`）保持可发。  
4. 删除 `organizerId`、`Organizer` 表、`PublishStatus`。

## 4. 权限

| 操作 | 条件 |
| --- | --- |
| 新建草稿 / 发布 / 再发布 | 登录 ∧ `canPublish` ∧（发布/再发布时为所有者） |
| 编辑草稿、退回草稿、取消自己的活动 | 登录 ∧ 所有者。**冻结后仍可取消/退回自己的活动**，不可 publish |
| 看自己活动的报名名单 | 登录 ∧ 所有者（冻结后仍可看） |
| 看别人活动的名单 | 403 |
| 运营冻结/恢复 `canPublish`、下架活动 | Admin JWT + 既有角色；写 AuditLog |

`PublisherGuard` 改为校验 `User.canPublish`（可改名 `CanPublishGuard`），仅加在「会写出新的 published 态」的路由上。

## 5. API

### 5.1 用户活动（替换 `/organizer/activities`）

前缀：`/me/activities`（仍挂用户 JWT）。

- `POST /me/activities` 创建（可带 `publish`）  
- `GET /me/activities` 我的活动  
- `GET /me/activities/:id`  
- `PATCH /me/activities/:id`  
- `POST /me/activities/:id/publish` \| `unpublish` \| `cancel`  
- `GET /me/activities/:id/registrations` 报名名单  

实现期删除或 410 旧 `/organizer/*` 与 `/organizers/apply`、`/organizers/me`、`/organizers/can-publish`。mp 同步改客户端路径；页面目录 `pages/organizer/` 可暂留，文案改为「我的活动 / 发布」。

### 5.2 公开活动

DTO：以 `hostName: string` 替换 `organizer: { displayName }`。  
列表/详情/我的报名摘要中的主办字段同样替换。

### 5.3 Admin

- 去掉组织者申请列表、通过/驳回。  
- `GET /admin/users`（最小分页；含 `canPublish`、`nickname`）。  
- `POST /admin/users/:id/freeze-publish` / `unfreeze-publish`（原因进 body + AuditLog）。  
- 活动下架 API 保留（P0-2 已有）。

## 6. 端上

| 端 | 范围 |
| --- | --- |
| **mp** | 去掉申请组织者；登录后可发布；详情主办显示 `hostName`；冻结用户隐藏/禁用发布并提示 |
| **admin** | 用户发布权列表 + 冻结/恢复；不再展示组织者申请队列 |
| **api** | 迁移 + Guard + 路由替换 |

## 7. 对 P0-5 的影响

[ADR-0008](../../adr/0008-operational-governance-audit-logs.md)（Accepted）不再包含「组织者申请队列」，改为：

- 用户发布权冻结/恢复（原因、审计）  
- 活动下架（API + Admin 列表已有）  
- 审计日志查询（本期增量）  

## 8. 非目标

- 改微信登录 / JWT 方案  
- 封号模型（`User.status`）扩展  
- 支付、组织者结算（仍 P2）  
- 强制用户设置昵称  

## 9. 文档同步清单

- [x] ADR-0011 Accepted  
- [x] ADR-0003 → Superseded（Organizer 部分）  
- [x] ADR-0004～0007 修订指向 0011  
- [x] `prd-summary.md` D-01 / 角色  
- [x] `roadmap.md` P0-5 范围  
- [x] `docs/技术栈.md` mp 职责表述  
- [x] 实现后 0011 → Implemented；本规格 → Implemented  

## 10. 验收

- 新登录用户无需申请即可创建并发布活动。  
- `canPublish=false` 时创建/发布被拒绝。  
- 公开详情主办为昵称（空则「用户」）。  
- 仅所有者可拉报名名单。  
- 库中无 Organizer 申请流。

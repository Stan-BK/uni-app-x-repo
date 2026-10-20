# ADR-0008: 运营治理（发布权冻结、下架与审计）

- **状态：** Implemented
- **日期：** 2026-10-20
- **关联：** roadmap P0-5、PRD AT-ADM（修订）、[ADR-0004](./0004-admin-rbac.md)、[ADR-0005](./0005-activity-lifecycle-and-model.md)、[ADR-0011](./0011-default-publish-permission.md)
- **设计规格：** [docs/superpowers/specs/2026-10-20-audit-logs-governance-design.md](../superpowers/specs/2026-10-20-audit-logs-governance-design.md)
- **实现计划：** [docs/superpowers/plans/2026-10-20-audit-logs-governance.md](../superpowers/plans/2026-10-20-audit-logs-governance.md)

## 背景

P0-5 的运营治理在 ADR-0011 之后变为：**冻结/恢复用户发布权、下架已发布活动、查询审计日志**。不再有「成为组织者」申请队列，也没有活动审核队列（ADR-0005）。

冻结/恢复（Admin `/users`）与下架（Admin `/activities` + `POST .../remove`）已经写入 `AuditLog`。缺的是**只读查询**：没有列表 API，也没有后台页，AT-ADM「审计」无法验收。

约束：MVP 不上 Redis/MQ；审计表已存在，不另建日志系统。

## 决策

1. **P0-5 范围**  
   - 已落地（不在本期改行为）：冻结/恢复 `User.canPublish`（ADR-0011）；`published` → `removed` 下架（ADR-0005），Admin 活动列表可操作。  
   - 本期增量：**审计日志查询**（API + Admin 页）。  
   - 不做：封号扩展、恢复已下架活动、下架页再打磨、导出、全文搜索、删除日志。

2. **复用现有 `AuditLog`，只追加、不改写。**  
   - 字段保持：`actorType` / `actorId` / `action` / `targetType` / `targetId` / `reason` / `meta` / `createdAt`。  
   - 已有写入不变：  
     - `freeze_publish` / `unfreeze_publish`，`targetType=user`  
     - `remove`，`targetType=activity`  
   - 无更新、删除、导出接口。  
   - 补 `createdAt` 索引，支持倒序与时间区间。

3. **查询接口仅 `admin` 角色。**  
   - `GET /admin/audit-logs`：Admin JWT + `RolesGuard` 仅 `AdminRole.admin`。  
   - `operator` → 403（兑现 ADR-0004：查看审计日志属 admin）。  
   - 未登录 → 401。  
   - 前端按角色隐藏入口；真正鉴权只在 API。

4. **筛选与分页**  
   - 可选：`action`、`targetType`、`targetId`、`from` / `to`（`createdAt`）。  
   - 分页与用户列表一致：`page` 默认 1，`pageSize` 默认 20、最大 50。  
   - 默认按 `createdAt` 倒序，其次 `id` 倒序（稳定翻页）。

5. **展示名查询时联表，不做历史快照。**  
   - 操作人：`actorType=admin` 时查 `AdminUser`（`displayName` / `email`）。  
   - 对象：`user` → 昵称；`activity` → 标题。  
   - 对不上仍返回该行，展示名可空，UI 仍展示 id。  
   - 写入路径不补快照字段（YAGNI）。

6. **Admin 页**  
   - 路由 `/audit-logs`，仅 `admin` 可见。  
   - 筛选 + 表格 + 分页；对象列展示 `label（id）`，不跳详情。

## 备选方案

| 方案 | 优点 | 缺点 |
| --- | --- | --- |
| 只补审计查询（本决策） | 立刻验收 AT-ADM；改动面小 | 下架页保持现状 |
| 审计查询 + 下架页打磨 | 对象确认更一致 | 超出「补查询」最小闭环 |
| 更大治理包（封号/恢复下架/导出） | 一次做完治理 | 超出 P0-5 勾选项 |

## 后果

- 正面：冻结、下架、审计三条治理路径可在 Admin 验收；RBAC 与 ADR-0004 对齐。  
- 负面 / 跟进：展示名非快照，改名后旧日志跟新名字；`operator` 看不到自己操作记录（需要时另立决策）。  
- 已落地：`GET /admin/audit-logs` 与 Admin `/audit-logs`；roadmap「审计日志查询」已勾选。

## 实现备注

- 涉及：`apps/api` 新 Admin 审计模块 + `AuditLog.createdAt` 索引；`packages/shared` 审计 action/对象类型；`apps/admin` 审计页与登录后持久化 `role`。  
- 验收：`admin` 可筛可翻页看到冻结/恢复/下架记录；`operator` 不可见且接口 403；无改删日志接口。

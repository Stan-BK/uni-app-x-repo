# P0-5 审计日志查询设计规格

- **日期：** 2026-10-20  
- **状态：** Implemented  
- **关联 ADR：** [0008](../../adr/0008-operational-governance-audit-logs.md)（Implemented）  
- **实现计划：** [docs/superpowers/plans/2026-10-20-audit-logs-governance.md](../plans/2026-10-20-audit-logs-governance.md)  
- **关联：** ADR-0004（admin 才可看审计）、ADR-0005（下架已写入）、ADR-0011（冻结/恢复已写入）

## 1. 目标

为运营治理补上**只读审计查询**：Admin 可按操作、对象、时间翻页查看已有 `AuditLog`。冻结/恢复发布权与活动下架的写入路径保持不变。使修订后的 AT-ADM（冻结 + 下架 + 审计）可验收。

## 2. 产品决策摘要（已确认）

| 项 | 结论 |
| --- | --- |
| 本期范围 | 只补审计查询（API + Admin 页） |
| 冻结/恢复 | 已有，不改行为 |
| 下架 | API + 活动列表已有，本期不打磨 |
| 谁能看 | 仅 `AdminRole.admin`；`operator` 403 |
| 模型 | 复用 `AuditLog`；只追加，不改、不删 |
| 展示名 | 查询时联表；不是写入时快照 |
| 非目标 | 导出、全文搜索、封号、恢复已下架、给 operator 开放审计 |

## 3. 数据模型

现有 `AuditLog` 字段不改语义：

| 字段 | 说明 |
| --- | --- |
| `id` | cuid |
| `actorType` / `actorId` | 现写入均为 `admin` + AdminUser id |
| `action` | `freeze_publish` / `unfreeze_publish` / `remove` |
| `targetType` / `targetId` | `user` 或 `activity` + 对应 id |
| `reason` | 运营填写的原因 |
| `meta` | 可空；本期不依赖 |
| `createdAt` | 写入时间 |

索引：

- 保留 `@@index([targetType, targetId])`  
- **新增** `@@index([createdAt])`（倒序列表与 `from`/`to`）

无 FK 到 `AdminUser` / `User` / `Activity`。查询用 id 批量联表；对不上不丢行。

### 3.1 共享常量（`packages/shared`）

避免三端各写一套：

```ts
export const AuditAction = {
  FreezePublish: "freeze_publish",
  UnfreezePublish: "unfreeze_publish",
  Remove: "remove",
} as const;

export const AuditTargetType = {
  User: "user",
  Activity: "activity",
} as const;
```

中文标签仅 Admin 使用，可与常量同文件导出（`冻结发布权` / `恢复发布权` / `下架活动`）。未知 `action` 展示原字符串。

## 4. API 契约

挂在现有全局前缀（如 `/api`）下。独立模块，例如 `AdminAuditLogsModule`，不要塞进 `admin-users` / `admin-activities`。

### 4.1 `GET /admin/audit-logs`

**鉴权：** Admin JWT + `@Roles(AdminRole.admin)`。

**Query：**

| 参数 | 规则 |
| --- | --- |
| `action` | 可选；须为已知 `AuditAction`，否则 400 |
| `targetType` | 可选；须为已知 `AuditTargetType`，否则 400 |
| `targetId` | 可选；trim 后为空则忽略，否则精确匹配 |
| `from` / `to` | 可选；ISO-8601。`createdAt >= from` 且 `createdAt <= to`。非法日期 400。`from > to` 时返回空列表（200） |
| `page` | 默认 1；`<1` 或非数字按 1（与用户列表一致） |
| `pageSize` | 默认 20，夹在 1～50 |

默认排序：`createdAt` 倒序，其次 `id` 倒序（稳定翻页）。

**响应：**

```json
{
  "items": [
    {
      "id": "...",
      "createdAt": "2026-10-20T12:00:00.000Z",
      "action": "freeze_publish",
      "targetType": "user",
      "targetId": "...",
      "reason": "违规发布",
      "actor": {
        "id": "<adminUserId>",
        "displayName": "运营甲",
        "email": "admin@example.com"
      },
      "target": {
        "id": "<userId or activityId>",
        "label": "昵称或标题"
      }
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 20
}
```

联表规则：

| 情况 | `actor` | `target.label` |
| --- | --- | --- |
| `actorType=admin` 且 AdminUser 存在 | `id` + `displayName` + `email` | — |
| 非 admin 或操作人对不上 | `{ id: actorId, displayName: null, email: null }` | — |
| `targetType=user` 且用户存在 | — | `nickname` trim 后非空用之，否则空串（UI 再显示「用户」） |
| `targetType=activity` 且活动存在 | — | `title` |
| 对象对不上 | — | 空串；`target.id` 仍为 `targetId` |

无匹配筛选时 `items: []`、`total: 0`，HTTP 200。

**错误：**

| 情况 | HTTP |
| --- | --- |
| 无 / 无效 Admin token | 401 |
| `operator` 或其他非 admin | 403 |
| 非法 `action` / `targetType` / 日期 | 400 |

**禁止：** `POST` / `PATCH` / `DELETE` 审计日志。

### 4.2 既有写入（不改）

| 操作 | action | targetType |
| --- | --- | --- |
| `POST /admin/users/:id/freeze-publish` | `freeze_publish` | `user` |
| `POST /admin/users/:id/unfreeze-publish` | `unfreeze_publish` | `user` |
| `POST /admin/activities/:id/remove` | `remove` | `activity` |

## 5. Admin UI

新页 `apps/admin/src/views/AuditLogs.vue`，路由 `/audit-logs`。风格对齐 `Users.vue` / `Activities.vue`（顶栏 + 页间链接 + 表格 + 分页）。

### 5.1 角色与导航

登录成功后将 `admin`（`id` / `email` / `displayName` / `role`）与 token 一并写入 localStorage；退出时一起清掉。

| 角色 | 导航 | 直接打开 `/audit-logs` |
| --- | --- | --- |
| `admin` | 用户发布权 / 活动列表 / **审计日志** | 进入页面 |
| `operator` | 用户发布权 / 活动列表（无审计链接） | 路由拦回 `/users` |
| 无 token | — | 登录页 |

401：清 token 与本地 admin，回登录。页面若仍请求到 403，同样回 `/users`。

### 5.2 筛选与表格

筛选：操作（全部 + 三个中文标签）、对象类型（全部 / 用户 / 活动）、对象 ID（可选输入）、时间范围（`datetimerange` → `from`/`to` ISO）。变更后从第 1 页重查。

| 列 | 展示 |
| --- | --- |
| 时间 | 本地 `toLocaleString()` |
| 操作人 | `displayName` 或 `email`，旁注 id（等宽、可复制） |
| 操作 | 中文标签 |
| 对象 | `label（id）`；`label` 空则用户用「用户」、活动用「活动」；id 可复制 |
| 原因 | `reason`；空则「—」 |

分页：`el-pagination`，默认 20，与用户列表相同。空态：「暂无审计记录」。对象列不跳转用户/活动详情。

用户发布权页、活动列表页的顶栏为 `admin` 增加「审计日志」链接。

## 6. 测试

API 单测为主（Vitest，对齐 `admin-users.service.spec.ts`）：

- `admin` 可分页列出；默认 `createdAt` 倒序  
- `action` / `targetType` / `targetId` / `from`/`to` 过滤正确  
- 非法枚举或日期 → 400（controller/DTO 测即可）  
- `operator` 403；无 token 401  
- 操作人/对象缺失时仍返回该行，`label` / `displayName` 可空  
- 无 `POST`/`PATCH`/`DELETE` 审计路由（抽测 404 即可，不必穷尽）

Admin 页：手工过一遍筛选、分页、`operator` 看不到入口。无强制 E2E。

## 7. 文档同步清单

- [x] ADR-0008 Accepted  
- [x] `docs/adr/README.md`  
- [x] `docs/roadmap.md` P0-5 挂 ADR/规格；下架 UI 视为已有  
- [x] ADR-0004 审计查询指向 0008  
- [x] 实现后：0008 → Implemented；本规格 → Implemented；勾选「审计日志查询」

## 8. 验收

| 项 | 预期 |
| --- | --- |
| 冻结/恢复 | 操作后审计页能看到对应记录和原因 |
| 下架 | 操作后审计页能看到 `remove` 记录 |
| 权限 | `admin` 可筛可翻页；`operator` 无入口、接口 403 |
| 只读 | 没有改/删日志的接口 |

## 9. 非目标

导出 CSV、全文搜索、删除/修正日志、封号、恢复 `removed` 活动、下架页对象确认打磨、`operator` 查看审计、写入路径补名称快照、mp 端任何改动。

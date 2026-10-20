# ADR-0004: 管理后台 RBAC

- **状态：** Implemented
- **日期：** 2026-10-17
- **修订：** 2026-10-20 起组织者申请队列取消，运营改为冻结/恢复 `User.canPublish`（见 [ADR-0011](./0011-default-publish-permission.md)）。独立 Admin 账号与角色仍有效。
- **关联：** roadmap P0-1、PRD ADM-001/006、ADR-0003、ADR-0011、ADR-0008

## 背景

运营需审核活动、管理组织者发布权；管理员需配置角色。后台必须与小程序用户体系隔离，避免「拿着小程序 token 调运营接口」。

## 决策

1. **独立账号表 `AdminUser`**，不与小程序 `User` 混用登录入口。  
2. **角色枚举首期固定两种**（后续可表驱动）：  
   - `operator`：冻结/恢复用户发布权、下架活动  
   - `admin`：上述全部 + 管理 AdminUser、查看审计日志  
3. **鉴权**：Admin 登录签发独立 JWT（`typ: admin` 或独立 secret/issuer），Guard 校验类型。  
4. **种子账号**：通过环境变量 `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD` 在迁移后创建（仅当库中无 admin 时）。  
5. **审计**：敏感操作（冻结/恢复发布权、下架活动）写入 `AuditLog`；查询 API 与 Admin 页见 [ADR-0008](./0008-operational-governance-audit-logs.md)（仅 `admin` 可读）。  
6. Admin 前端路由按角色隐藏入口；**真正鉴权只在 API**。

## 备选方案

| 方案 | 优点 | 缺点 |
| --- | --- | --- |
| 复用小程序 User + 角色字段 | 少一张表 | 攻击面耦合、运营账号难管 |
| 完整 CASL/权限矩阵引擎 | 灵活 | 首期过重 |

## 后果

- P0-1 已交付：Admin 登录与最小后台。组织者申请 API 将按 ADR-0011 移除。  
- P0-5：用户发布权冻结/恢复 UI、活动下架 UI 已有；审计查询由 ADR-0008 规定。无活动审核队列（ADR-0005）。

# ADR-0011: 用户默认可发布（取消 Organizer）

- **状态：** Implemented
- **日期：** 2026-10-20
- **关联：** 取代 [ADR-0003](./0003-identity-and-organizer.md) 中的 Organizer / 申请发布权；修订 ADR-0004～0007；roadmap 下一阶段 P0-5 / ADR-0008
- **设计规格：** [docs/superpowers/specs/2026-10-20-default-publish-permission-design.md](../superpowers/specs/2026-10-20-default-publish-permission-design.md)

## 背景

产品确认：**不再有「组织者」角色**。登录用户默认可发布活动，除非运营在后台收回发布权。公开详情的「主办」直接使用用户昵称，不再维护组织者名称/申请审核流。

ADR-0003 规定独立 `Organizer` 实体、`publishStatus` 申请态、默认无发布权，与现行产品冲突。身份登录（`User` + `UserIdentity` + JWT）仍然有效，仅发布权与活动归属需要改模型。

## 决策

1. **取消 `Organizer` 实体与申请流。**  
   - 删除申请成为组织者、审核通过/驳回、组织者资料。  
   - 废弃 `PublishStatus`（`none/pending/approved/rejected/frozen`）。

2. **发布权在 `User` 上。**  
   - `User.canPublish` Boolean，**默认 `true`**。  
   - 运营可将 `canPublish` 设为 `false`（冻结）或改回 `true`（恢复）；写 `AuditLog`。  
   - `User.status=banned` 仍禁止业务操作（既有）；冻结发布权不等于封号。

3. **活动归属用户。**  
   - `Activity.ownerUserId` → `User`（原 `organizerId` 迁移后删除）。  
   - 创建/编辑/发布/退回/取消/查看报名名单：须当前用户为 `ownerUserId` **且** `canPublish=true`（查看自己的已有活动名单：所有者即可，即使已冻结，避免无法善后；**新发/再发布**必须 `canPublish=true`）。  
   - 已冻结用户：不可新建、不可 `publish`；已发布活动仍可由运营下架。

4. **公开展示主办 = 用户昵称。**  
   - 公开 DTO 用 `hostName`（`User.nickname` trim 后非空用之，否则 `"用户"`）。  
   - 不再返回 `organizer.displayName`。  
   - 昵称/头像由用户自助写入，见 [ADR-0012](./0012-user-profile-display.md)。

5. **API 口径。**  
   - 活动管理从 `/organizer/activities` 迁到 `/me/activities`（同一套 CRUD + publish/unpublish/cancel）。  
   - 报名名单：`GET /me/activities/:id/registrations`（须为所有者）。  
   - 删除 `POST /organizers/apply`、`GET /organizers/me`、Admin 组织者申请队列。  
   - 新增 Admin：列出用户并冻结/恢复 `canPublish`。

6. **多端登录不变。**  
   - 仍为 `User` + `UserIdentity(provider, openId)`；微信登录、JWT、`AUTH_DEV_BYPASS` 沿用 ADR-0003 第 1/3/4/5 点。

## 备选方案

| 方案 | 优点 | 缺点 |
| --- | --- | --- |
| 去掉 Organizer，发布权在 User（本决策） | 与产品一致，少一层实体 | 需迁移 `organizerId`、改路由与 Admin |
| 保留 Organizer 自动建档、产品层不叫组织者 | 代码改动少 | 库表/路由仍是组织者，概念分裂 |
| 冻结用 `publishFrozenAt` + 原因字段 | 查询冻结史方便 | 原因已可进 AuditLog，User 上先布尔即可 |

## 后果

- 正面：发布路径变短；P0-5 治理变为冻结发布权 + 下架 + 审计，不再做「成为组织者」审核。  
- 负面 / 跟进：数据迁移；mp「申请组织者」入口拆除；Admin 组织者队列改为用户发布权；P0-5 审计查询见 [ADR-0008](./0008-operational-governance-audit-logs.md)。  
- 历史 P0-1～P0-4 规格/计划保留为当时实现记录，文首可注明被本 ADR 取代的组织者部分。  
- 已落地：迁移 `drop_organizer_add_owner`；活动管理 `/me/activities`；Admin `/users` 冻结/恢复发布权。

## 实现备注

- 涉及：`apps/api` Prisma/User/Activity/Registrations、`packages/shared`、`apps/mp` 发布与详情主办、`apps/admin` 用户发布权。  
- 验收：新用户登录即可发活动；冻结后不可发布；详情主办为昵称；非所有者不可拉名单；旧 Organizer 数据迁完后无申请流。

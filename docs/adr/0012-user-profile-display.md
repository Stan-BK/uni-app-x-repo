# ADR-0012: 用户展示资料（昵称 / 头像）可自助更新

- **状态：** Implemented
- **日期：** 2026-10-22
- **关联：** roadmap P1-1、PRD D-11、[ADR-0003](./0003-identity-and-organizer.md) 登录决策、[ADR-0011](./0011-default-publish-permission.md) `hostName`、[ADR-0010](./0010-backend-ops-stack.md) 阶段 B（OSS 仍后置）
- **设计规格：** [docs/superpowers/specs/2026-10-22-user-profile-display-design.md](../superpowers/specs/2026-10-22-user-profile-display-design.md)

## 背景

登录只换 `openid` / JWT，**不带微信昵称和头像**（现行微信能力；`getUserProfile` 不可再用）。`User.nickname` / `avatarUrl` 已存在，公开主办名 `hostName` 也读昵称，但没有写入接口。个人页只读，真机用户长期显示「微信用户」/「用户」。

约束：不上 OSS；不改登录；不开放手机号编辑（P1 后续）；不把资料审核做成运营队列。

## 决策

1. **展示资料与登录分离。** 登录仍只建/绑 `User` + `UserIdentity`。昵称、头像由用户在「我的信息」自行填写并保存到 `User`。
2. **本期只写两个字段：** `nickname`、`avatarUrl`。`phone`、`canPublish`、`status` 不可由用户 PATCH。
3. **API**
   - 已有 `GET /me` 不变（`id` / `nickname` / `avatarUrl` / `canPublish`）。
   - 新增 `PATCH /me`：登录用户部分更新自己的昵称和/或头像；至少改一项。
   - 新增 `POST /me/uploads/avatar`：仅 `UserJwtGuard`（**不**要求 `canPublish`，冻结发布权仍可改资料）。
4. **头像必须落到本服务。** 微信 `chooseAvatar` 回调是临时路径，禁止写入 `wxfile://` 或微信临时 URL。上传到 `uploads/avatars/`，与封面一样走现有 `/api/uploads/` 静态前缀。OSS 仍等运维阶段 B。
5. **公开展示规则不变。** `hostName` 继续用 trim 后非空的 `User.nickname`，否则 `"用户"`。改资料后列表/详情主办名随下次读取更新；不回写历史报名快照。
6. **不强制完善资料。** 未填昵称仍可浏览、报名、发布。
7. **微信端用官方组件。** 头像：`button open-type="chooseAvatar"`；昵称：`input type="nickname"`。H5 / 开发旁路用相册选图 + 普通输入，便于联调。

## 备选方案

| 方案 | 优点 | 缺点 |
| --- | --- | --- |
| 登录时静默拉微信资料 | 少一步 | 现行微信不提供，会得到灰头像和「微信用户」 |
| 资料进独立 Profile 表 | 可扩展简介/性别 | 本期两字段，User 上已有列 |
| 头像外链任意 URL | 实现短 | 临时链失效、SSRF、不可控内容 |
| 上传复用封面接口（带 CanPublish） | 少一个路由 | 冻结用户无法改头像 |

## 后果

- 正面：主办展示、个人页、「我的」头像有真实数据；不碰支付 / OSS / 报名表。
- 负面 / 跟进：本地磁盘存头像（与封面同模式）；真机才能完整验微信组件；手机号预填留第二阶段。
- 不写 AuditLog（自助改展示名，不是运营治理）；不新增业务事件。

## 实现备注

- 涉及：`apps/api` Auth + Uploads；`apps/mp` `pages/mine/profile`、user store、上传适配；`packages/shared` 可选校验常量。Admin 只读展示已有昵称，本期不改。
- 验收：登录用户可改昵称/头像；未登录 401；不能改别人；空昵称公开为「用户」；冻结发布权仍可改资料；临时路径不能保存。

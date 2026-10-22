# 个人展示资料（昵称 / 头像）设计规格

- **日期：** 2026-10-22  
- **状态：** Implemented  
- **关联 ADR：** [0012](../../adr/0012-user-profile-display.md)  
- **实现计划：** [docs/superpowers/plans/2026-10-22-user-profile-display.md](../plans/2026-10-22-user-profile-display.md)  
- **范围：** 第一阶段。仅昵称 + 头像自助编辑；不改登录、报名表、Admin、支付、OSS。

## 1. 目标

让登录用户能在「我的信息」设置**展示用**昵称和头像，并落到服务端 `User`。公开活动主办名、个人页、「我的」资料卡读同一套字段。

成功标准：真机微信可选用微信头像/相册并填写昵称；保存后 `GET /me`、活动 `hostName`、两端头像一致；H5 开发环境可用普通输入联调。

## 2. 已确认决策

| 项 | 结论 |
| --- | --- |
| 与登录关系 | **两套能力**。`uni.login` 只换 JWT；不在登录时拉资料 |
| 可编辑字段 | 仅 `nickname`、`avatarUrl` |
| 手机号 | 本期不做（`User.phone` 仍空置） |
| 发布权限 | 个人页只读；用户改不了 `canPublish` |
| 是否强制 | 不强制；空昵称公开为「用户」 |
| 头像存储 | 本机 `uploads/avatars/` + 现有静态前缀；不上 OSS |
| 历史报名 | 名单上的姓名/头像仍是报名当时快照，不回溯改 |
| 退出登录 | 不做 |
| Admin | 不改；列表已有昵称即可 |

## 3. 数据

`User` 表不新增列。

| 字段 | 写入规则 |
| --- | --- |
| `nickname` | trim；空串视为 `null`；最长 32 个 Unicode 码元（JS string.length，trim 后）；禁止纯空白 |
| `avatarUrl` | 仅接受本服务上传结果（`/api/uploads/avatars/...`）；`null` 表示清除头像 |

不迁移历史数据。开发旁路用户「Dev User」可被用户改掉。

## 4. API

均需用户 JWT。错误形状沿用现有：HTTP 状态 + `message` 字符串。

### 4.1 `GET /me`

不变。

```ts
{
  id: string;
  nickname: string | null;
  avatarUrl: string | null;
  canPublish: boolean;
}
```

### 4.2 `PATCH /me`

Body 至少包含 `nickname` 或 `avatarUrl` 之一。

```ts
{
  nickname?: string | null;
  avatarUrl?: string | null;
}
```

| 条件 | 结果 |
| --- | --- |
| 未登录 | 401 |
| 空 body / 两字段都未出现 | 400「请提供要更新的字段」 |
| `nickname` 超长 | 400 |
| `avatarUrl` 非本服务头像路径 | 400「头像地址无效」 |
| 成功 | 200，body 与 `GET /me` 相同 |

部分更新：省略的字段保持原值。显式 `null` 清空。冻结 `canPublish=false` 仍允许。

不写 AuditLog，不打新的 `BusinessEvent`。

### 4.3 `POST /me/uploads/avatar`

- Guard：仅 `UserJwtGuard`（**不要** `CanPublishGuard`）。
- `multipart/form-data` 字段名 `file`。
- 类型：jpeg / png / webp / gif；上限 **2MB**。
- 落盘：`uploads/avatars/{uuid}{ext}`。
- 响应：`{ url: string }`，url 形如 `{PUBLIC_API_BASE}/uploads/avatars/{filename}`。
- 静态访问：沿用 `app.useStaticAssets(..., prefix: "/api/uploads/")`，无需改 Nginx。

封面上传 `POST /me/uploads/cover` 保持现状（仍要发布权）。

## 5. 小程序

### 5.1 页面

`pages/mine/profile`（二级页，标题「我的信息」）改为可编辑：

- 头像：可点。微信用 `<button open-type="chooseAvatar">`（样式做成圆形头像，去掉 `button::after` 边框）；H5 用现有选图。
- 昵称：微信 `<input type="nickname">`；H5 普通 input。占位「填写昵称」。
- 辅助文案：「用于活动主办与个人页展示」。
- 发布权限行保持只读（已开启 / 已关闭）。
- 无退出、无刷新按钮。

保存策略：

1. 头像：选完 → `uni.uploadFile` 到 `/me/uploads/avatar` → `PATCH /me { avatarUrl }` → `user.me` 更新。
2. 昵称：blur / confirm → `PATCH /me { nickname }`。空则存 `null`。
3. 失败 toast，保留用户刚填的内容，不回滚输入框到旧值以外的空白。

`pages/mine/registrations` 资料卡继续读 `user.me`；从「我的信息」返回后 `onShow` 已有 `refreshIdentity` 即可。

### 5.2 适配

平台差异收口到适配层（如 `apps/mp/src/adapters/profile.ts`），页面少写 `#ifdef`：

- 微信：chooseAvatar 临时路径。
- H5：`uni.chooseImage`。
- 上传：`uni.uploadFile` + 用户 token。

开发者工具对 `input type="nickname"` 还原不真，**头像昵称以真机为准**。

### 5.3 校验（端上 + 服务端双份）

昵称 trim 后 ≤32；头像必须先上传成功再 PATCH。禁止把 `wxfile://`、http 临时链写入 `avatarUrl`。

## 6. 公开展示

`hostNameFromNickname` 不变。用户改昵称后，其名下活动列表/详情下次请求即新主办名。报名人员预览用的是报名关联用户的 `nickname`/`avatarUrl`（若接口已 include User），随 User 更新，**不是**报名表单里的 `name` 字段。

## 7. 非目标

- 手机号、一键取号、报名预填  
- 简介、性别、地区、实名  
- 强制完善资料才能发布/报名  
- OSS / CDN  
- Admin 改用户昵称或审核资料  
- 退出登录  
- 新的 L1 信息架构（统计、入口重排）  
- `getUserProfile` / `getUserInfo`

## 8. 文档同步清单

- [x] ADR-0012 Accepted  
- [x] `roadmap.md` 增加 P1-1  
- [x] `prd-summary.md` D-11  
- [x] 实现计划  
- [x] 实现后 ADR-0012 → Implemented；本规格 → Implemented  

## 9. 验收

- 登录用户可更新昵称、头像；`GET /me` 与个人页、「我的」卡一致。  
- 未登录 `PATCH /me` / 上传 401。  
- 不能改 `canPublish` / `phone`。  
- 空昵称：页面可显示「微信用户」占位；公开 `hostName` 为「用户」。  
- `canPublish=false` 仍可改资料、可上传头像。  
- 非法 `avatarUrl` 400。  
- 微信真机：chooseAvatar + nickname 输入可用；H5 可用选图 + 文本。  
- 不改报名表单字段，不改支付。

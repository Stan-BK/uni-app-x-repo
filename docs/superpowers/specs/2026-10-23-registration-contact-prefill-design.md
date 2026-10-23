# 报名资料预填设计规格

- **日期：** 2026-10-23  
- **状态：** Implemented  
- **关联 ADR：** [0013](../../adr/0013-registration-contact-prefill.md)  
- **实现计划：** [docs/superpowers/plans/2026-10-23-registration-contact-prefill.md](../plans/2026-10-23-registration-contact-prefill.md)  
- **范围：** P1-2。报名姓名 + 手机号落到用户资料、报名回写、表单预填。不做分类筛选、订阅消息、举报、看板、微信取号、OSS、支付、L1 改版。

## 1. 目标

登录用户填过一次报名（或在「我的信息」保存过联系人）后，下次打开报名页自动带出姓名和手机号，仍可当场改。

成功标准：`GET /me` 含 `realName` / `phone`；报名接口不静默改 User；真正报名成功且联系人有改动时，用户确认后才 `PATCH /me`；已报名幂等返回不询问；公开 attendees 仍无手机号。

## 2. 已确认决策

| 项 | 结论 |
| --- | --- |
| 存储 | `User.realName` 新增；`User.phone` 沿用 |
| 与昵称 | 互不影响；不用昵称预填报名姓名 |
| 回写 | 报名事务不改 User；成功且有改动时弹窗确认，再 `PATCH /me` |
| 幂等 | 已 `confirmed` 返回 `alreadyRegistered: true`，不询问、不改快照 |
| 取消 | 不改 `User` |
| 预填 | 进入报名页一次；只填当前空字段 |
| 强制 | 不强制完善；不跳过表单 |
| 取号 | 不做 `getPhoneNumber` |
| 唯一 | 手机号不唯一 |
| 登录包 | `AuthUserView` 不加 `realName` / `phone` |
| Admin | 不改 |
| 日志 | 不写姓名、手机号 |

## 3. 数据

| 字段 | 写入规则 |
| --- | --- |
| `realName` | trim；空串 → `null`；最长 32 个 Unicode 码元（JS `string.length`） |
| `phone` | trim；空串 / `null` → `null`；否则必须 `^1\d{10}$` |

`Registration.name` / `Registration.phone` 规则不变，仍是当次快照。

## 4. API

错误形状沿用：HTTP 状态 + `message` 字符串。均需用户 JWT。

### 4.1 `GET /me`

```ts
{
  id: string;
  nickname: string | null;
  avatarUrl: string | null;
  realName: string | null;
  phone: string | null;
  canPublish: boolean;
}
```

### 4.2 `PATCH /me`

Body 至少包含 `nickname` / `avatarUrl` / `realName` / `phone` 之一。省略的字段保持原值。显式 `null` 或空白字符串清空 `realName` / `phone`。

| 条件 | 结果 |
| --- | --- |
| 未登录 | 401 |
| 空 body / 四字段都未出现 | 400「请提供要更新的字段」 |
| `realName` 超长 | 400「报名姓名过长」 |
| `phone` 非空且格式非法 | 400「手机号格式不正确」 |
| 成功 | 200，body 与 `GET /me` 相同 |

冻结 `canPublish=false` 仍允许。不写 AuditLog，不打新业务事件。

### 4.3 报名创建

[`RegistrationsService.create`](../../../apps/api/src/registrations/registrations.service.ts) **不**更新 `User`。响应为报名 DTO 外加：

```ts
alreadyRegistered: boolean;
```

| 路径 | `alreadyRegistered` |
| --- | --- |
| 已 `confirmed` 幂等返回 | `true` |
| 新建 `confirmed` | `false` |
| 从 `cancelled` 恢复 | `false` |

取消报名路径不碰 `User`。

## 5. 小程序

### 5.1 报名页 `pages/register/index`

登录后 `refreshIdentity()`，若 `name` / `phone` 当前为空则分别填入 `me.realName` / `me.phone`。用一次性标记，避免 `onShow` 把用户刚清空的值填回去。姓名 `maxlength` 与服务端对齐为 32。

提交成功后：

1. `alreadyRegistered === true`：toast「报名已提交」，不询问。  
2. 否则若本次 trim 后的姓名/手机号与 `me.realName` / `me.phone`（空视为 `""`）有任一不同：`uni.showModal` 标题「报名成功」，内容「是否将本次填写的姓名和手机号保存为下次预填？」，确认「保存」→ `PATCH /me`；取消则不写。  
3. 与预填相同：只 toast「报名已提交」。  

然后跳转「我的报名」。报名失败不询问。

### 5.2 我的信息 `pages/mine/profile`

在发布权限行之前增加「报名姓名」「手机号」，blur / confirm 时 `PATCH /me`。辅助文案：「用于下次报名预填。活动主办看到的是当次报名快照。」不改 Tab、不改头像昵称交互。

## 6. 非目标

- 微信 `getPhoneNumber` / 一键取号  
- 强制完善资料才能报名  
- Admin 查看或编辑用户默认手机号  
- 公开列表/详情/登录响出手机号  
- 分类筛选、订阅消息、举报、统计看板、L1 信息架构  
- OSS / 支付  

## 7. 文档同步清单

- [x] ADR-0013 Accepted  
- [x] `roadmap.md` 增加 P1-2  
- [x] `prd-summary.md` D-12  
- [x] 实现计划  
- [x] 实现后 ADR-0013 → Implemented；本规格 → Implemented  

## 8. 验收

- 登录用户 `GET /me` 含 `realName`、`phone`（可空）。  
- `PATCH /me` 可改/清空这两项；非法手机号 400；不能改别人。  
- 报名接口不写 User；真正成功且联系人有改动时，确认后才更新预填。已报名幂等返回不询问。  
- 公开 attendees 无 `phone`。  
- 报名页对已有资料预填；空资料仍可手填提交。  
- 个人页可编辑默认联系人。  
- 登录 JWT 响应 user 对象仍无 `realName` / `phone`。

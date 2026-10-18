# ADR-0003: 多端身份与 Organizer 模型

- **状态：** Implemented
- **日期：** 2026-10-17
- **关联：** roadmap P0-1、PRD D-01、ADR-0001

## 背景

小程序需支持微信（首期）、抖音/小红书（预留）。发布权限不能默认给所有用户。身份必须以服务端会话为准，不能信任客户端传入的 userId。

## 决策

1. **账号主体是平台 `User`**，与各端身份通过 `UserIdentity` 关联：`(provider, openid)` 唯一。  
   - `provider`: `weixin` | `toutiao` | `xhs`  
   - 首期只实现微信 `code → session`；其他 provider 留接口与表结构。  
2. **组织者是独立实体 `Organizer`**，`ownerUserId` 指向 User。  
   - `publishStatus`: `none` | `pending` | `approved` | `rejected` | `frozen`  
   - 普通用户默认无发布权；提交申请后由运营审核（Admin）。  
3. **小程序会话**：API 签发 JWT（或等价 session token），payload 含 `userId`；后续请求 `Authorization: Bearer`。  
4. **开发期**：可用 `AUTH_DEV_BYPASS=true` + 固定 mock code 换取测试用户，避免阻塞无 AppSecret 时的联调（生产必须关闭）。  
5. 不在首期做 unionId 打通多端同一人的强绑定；表结构预留 `unionId` 可空字段。

## 备选方案

| 方案 | 优点 | 缺点 |
| --- | --- | --- |
| 每端独立用户表 | 简单 | 无法合并身份、权限难统一 |
| 人人默认可发布 | 转化快 | 垃圾内容与治理成本高 |
| 仅微信云托管会话 | 省事 | 多端不适用 |

## 后果

- API 必须提供：微信登录、当前用户、申请组织者、查询申请状态。  
- Admin 侧冻结/通过发布权见 ADR-0004。  
- mp 侧登录与请求封装走 `adapters/auth` + 统一 `request`。

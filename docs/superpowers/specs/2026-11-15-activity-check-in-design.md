# 活动签到（确认到场）设计规格

- **日期：** 2026-11-15  
- **状态：** Accepted（待实现）  
- **关联 ADR：** [0017](../../adr/0017-activity-check-in.md)（Accepted）  
- **实现计划：** [docs/superpowers/plans/2026-11-15-activity-check-in.md](../plans/2026-11-15-activity-check-in.md)  
- **关联：** ADR-0005（活动生命周期）、ADR-0007（`Registration` / 有效报名）、现有所有者名单 `GET /me/activities/:id/registrations`

## 1. 目标

在现有「活动 ↔ 报名人员」关联上落地**仅确认到场**的签到能力：

- 参与者出示**动态短时**二维码，活动所有者扫码签到  
- 所有者可查看已签到 / 未签到名单，并可**手动标记到场**（二次确认）  
- 不涉及支付、退款、评价、候补等其他业务  

使组织者现场能可靠区分「谁已到场」。

## 2. 产品决策摘要（已确认）

| 项 | 结论 |
| --- | --- |
| 能力范围 | 仅确认到场；不做票务核销扩展、不做支付联动 |
| 人员关联 | 挂在 `Registration`；有效对象 = `status = confirmed` |
| 扫码方向 | 参与者出示码，组织者扫 |
| 手动标记 | 仅活动 `ownerUserId`；客户端二次确认后再调 API |
| 时间窗 | 活动结束前均可：`now < endAt`；不要求已过 `startAt` |
| 二维码 | 动态短时（进页签发，默认 TTL 180s，可配置）；过期刷新 |
| 撤销 | **不允许**；重复签到幂等，提示「已签到」 |
| 已签到后参与者码 | **不显示**动态码，只展示「已签到 + 时间」 |
| 存储方案 | 方案 1：`Registration` 增字段 + **无状态**短时 JWT；不新建 `CheckIn` / token 表；不上 Redis |
| Admin / 协管员 | 本阶段不做 |
| 参与者自助签到 | 不做 |

## 3. 数据模型

### 3.1 Prisma `Registration` 扩展

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `checkedInAt` | `DateTime?` | 首次签到成功时间；`null` = 未签到 |
| `checkedInByUserId` | `String?` | 执行签到的用户（所有者）；未签到为 `null` |

建议索引：

- `@@index([activityId, checkedInAt])` — 按活动筛已/未签到

不新增：`checkInStatus` 枚举、独立 `CheckIn` 表、`CheckInToken` 表、撤销相关字段。

扫码与手动写入**同一套**字段；本阶段不强制存 `method`（若实现期 DTO 需要展示来源，可仅在响应中标注，不入库，或以后续 ADR 扩展）。

### 3.2 有效签到对象（服务端权威）

同时满足方可**首次**写入签到字段：

1. 报名存在且属于 path 中的活动  
2. `status = confirmed`  
3. 活动 `lifecycle = published`  
4. 活动必须有 `endAt`，且 `now < endAt`；**`endAt` 为空则拒绝签到**（发码与扫码/手动均不可）  
5. 操作者为该活动 `ownerUserId`  

已签到（`checkedInAt != null`）再次请求：不修改字段，返回幂等成功。

### 3.3 动态短时签到码（无状态 JWT）

- 参与者（报名本人）请求发码 → 服务端签发短 TTL JWT（默认 **180 秒**，可用环境变量覆盖）  
- claims：`purpose: "checkin"`、`registrationId`、`activityId`、`sub`（userId）、`exp`  
- **不落库**；过期即失效；每次发码签发新 token（旧码自然过期）  
- 组织者提交的是该 token，禁止仅凭裸 `registrationId` 签到（防伪造）  
- **与登录 JWT 隔离：** 复用现有 `JwtService` / 密钥即可，但校验时**必须**断言 `purpose === "checkin"`；登录 access token 不得当作签到码（缺 purpose 或 purpose 不符 → `CHECK_IN_TOKEN_INVALID`）

## 4. API 契约

均需用户 JWT；挂在现有全局前缀（如 `/api`）下。

### 4.1 `POST /registrations/:id/check-in-token`

**谁：** 该报名的 `userId`（本人）。

**前置：** `confirmed`；活动 `published`、有 `endAt` 且 `now < endAt`。  
若已签到（`checkedInAt != null`）→ **不签发码**：HTTP **409** + `CHECK_IN_ALREADY_DONE`；端上只展示已签到 UI，不再请求码。

**成功响应：**

```json
{
  "token": "<short-lived-jwt>",
  "expiresAt": "2026-11-15T12:03:00.000Z",
  "expiresInSec": 180,
  "activityId": "...",
  "registrationId": "..."
}
```

### 4.2 `POST /me/activities/:activityId/check-in`

**Body：**

```json
{ "token": "<participant-check-in-jwt>" }
```

**谁：** `activity.ownerUserId`。

**服务端：** 验签、`exp`、`purpose=checkin`、payload.`activityId` 与 path 一致 → 查报名 → §3.2。

**响应（首次与幂等同形）：**

```json
{
  "registrationId": "...",
  "name": "...",
  "phone": "...",
  "checkedInAt": "...",
  "alreadyCheckedIn": false
}
```

已签到：`alreadyCheckedIn: true`，HTTP **200**，`checkedInAt` 为原时间。

### 4.3 `POST /me/activities/:activityId/registrations/:registrationId/check-in`

手动标记到场。Body 可空。二次确认仅客户端。响应同 4.2（可选 `method: "manual"` 仅响应字段）。

### 4.4 扩展 `GET /me/activities/:id/registrations`

新增可选 query：

| 参数 | 含义 |
| --- | --- |
| `checkedIn` | `true` / `false`；不传 = 全部 |

DTO 增补：`checkedInAt: string | null`、`checkedInByUserId: string | null`。

响应顶层建议带汇总：

在**现有**所有者名单分页响应上增加字段（保留现有 `items`/分页字段名不改）：

- `checkedInCount: number` — 该活动下 `confirmed` 且已签到数（不受当前页筛选影响时可定义为「当前 status 过滤后的全集计数」；默认按 `status=confirmed` 计）  
- `notCheckedInCount: number` — 对应未签到数  

具体与现有 list JSON 形状对齐在实现计划中贴一次真实响应样例即可，语义以本段为准。

### 4.5 参与者只读

`RegistrationDto` / 「我的报名」增加 `checkedInAt`，便于本人看到「已到场」。  
**不提供**参与者自助签到接口。

### 4.6 业务错误码（`packages/shared`）

| code | 场景 |
| --- | --- |
| `CHECK_IN_TOKEN_INVALID` | 签名错 / purpose 不对 / 与 activity 不符 |
| `CHECK_IN_TOKEN_EXPIRED` | 过期 |
| `CHECK_IN_NOT_ALLOWED` | 非 confirmed / 非 published / 已结束等 |
| `CHECK_IN_FORBIDDEN` | 非所有者操作；或非本人发码 |
| `CHECK_IN_ALREADY_DONE` | 已签到仍请求发码（参与者侧） |
| `REGISTRATION_NOT_FOUND` | 报名不存在或不属于该活动 |

与现有 `ACTIVITY_ENDED` 等是否内部复用：实现可映射，对外保持上表稳定。

### 4.7 本阶段不做的 API

撤销签到；Admin 代签；协管员；一码一用落库与强制吊销。

## 5. 小程序交互

### 5.1 参与者：签到码页

- 入口：我的报名 / 活动详情（已报名）→ 签到码  
- 未签到：拉 4.1 → 用 `token` 生成二维码；倒计时到期自动刷新或手动刷新  
- 已签到：**不显示码**，展示「已签到」+ `checkedInAt`  
- 不可用（已结束、已取消、非 confirmed）：明确文案  

二维码内容约定为 **纯 token 字符串**（避免复杂 deep link）。

### 5.2 组织者：签到工作台

- 入口：我的活动 → 某活动 → 签到  
- **扫码态：** `scanCode` → 提交 4.2 → 反馈姓名/手机与首次或「已签到」；可连续扫  
- **名单态：** tab 未签到 / 已签到（`checkedIn`）；顶栏 count；未签到行「标记到场」→ 二次确认 → 4.3；已签到只读  
- 活动已结束：扫码与手动禁用；名单只读回顾  

扫码走 mp 适配层，业务页避免大量 `#ifdef`。

### 5.3 权限边界

非所有者无法使用工作台（接口 403）；扫到其他活动的码 → `CHECK_IN_TOKEN_INVALID`；服务端权威，不信任前端隐藏。

## 6. 验收要点（草案）

| ID | 场景 |
| --- | --- |
| AT-CI-01 | confirmed 参与者可在结束前获得短时码；过期后旧码不可签到 |
| AT-CI-02 | 所有者扫有效码 → 首次写入 `checkedInAt`；再扫幂等 `alreadyCheckedIn=true` |
| AT-CI-03 | 非所有者扫码/手动 → 403 / `CHECK_IN_FORBIDDEN` |
| AT-CI-04 | 活动已结束 → 不可签到；名单可读 |
| AT-CI-05 | 非 confirmed / 已取消 → 不可签到 |
| AT-CI-06 | 手动标记：仅所有者 +（端上二次确认）成功后进入已签到列表 |
| AT-CI-07 | 名单 `checkedIn` 筛选与 count 正确 |
| AT-CI-08 | 已签到参与者不再展示/签发有效动态码 |
| AT-CI-09 | 伪造或他活动 token → invalid |

## 7. 实现顺序与文档

1. ~~新 ADR（签到）→ `Accepted`~~（ADR-0017）  
2. ~~实现计划~~（`docs/superpowers/plans/2026-11-15-activity-check-in.md`）  
3. `packages/shared` 错误码 → Prisma → API → mp 联调 → 自动化测试覆盖 AT-CI  
4. 完成后 ADR / 本规格标 `Implemented`，roadmap P2 签到勾选 

## 8. 明确不做（本阶段）

撤销；Admin 核销；协管员；参与者扫组织者码反向签到；离线补签；独立 CheckIn 流水表；Redis。

## 9. 实现计划阶段再贴样例即可（规格已拍板）

- 所有者名单「扩展后」的真实 JSON 样例（字段名对齐现网）  
- 环境变量名（如 `CHECK_IN_TOKEN_TTL_SEC`，默认 `180`）  
- ADR 编号写入本文档页眉「关联 ADR」  

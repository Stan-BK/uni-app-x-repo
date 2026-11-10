# 社区动态设计规格

- **日期：** 2026-11-03
- **状态：** Implemented（配套 [ADR-0016](../../adr/0016-community-feed.md)；实现计划见下）
- **实现计划：** [动态基座](../plans/2026-11-03-community-feed-posts.md)、[互动与通知](../plans/2026-11-03-community-feed-engagement.md)
- **关联 ADR：** [0016](../../adr/0016-community-feed.md)；活动可见性 [0006](../../adr/0006-activity-discovery-and-public-visibility.md)；上传基线 [0012](../../adr/0012-user-profile-display.md)；运维 [0010](../../adr/0010-backend-ops-stack.md)
- **关联：** roadmap **P1-5**
- **范围：** 完整目标态。下文用 **本期** / **后置** 标注交付边界。
- **不在本期：** OSS/CDN、举报、关注/@、站内转发实体、通知聚合、热度后台调参、社区类微信订阅消息、无限评论嵌套、Admin 社区运营打磨。

## 1. 目标

登录用户可在小程序「社区」Tab 浏览与发布动态，互动（赞、评、微信分享），并通过首页铃铛收到站内互动通知；发布者可在「我的」查看自己的动态。

成功标准：

- Tab 顺序为 **首页 / 社区 / 我的**；社区 Feed 支持最新 / 最热门；右下角 FAB 进入二级编辑页。
- 动态卡片三区：头像+昵称+日期；正文（文/图/`#` 活动标签）；赞 / 评 / 转发（微信分享）入口。
- 发布：正文 ≤200 字、图 ≤3；正文与图至少一项；可关联 0～3 个可发现活动；作者可软删。
- 评论两级、正文 ≤100、图 ≤1；可赞、可回、作者可软删。
- Admin 可通过 API 软删动态/评论。
- 首页铃铛展示未读；点通知跳到对应动态或评论锚点。
- 未登录不可浏览社区；所有社区写读接口需用户 JWT（Admin 管理接口除外）。

## 2. 已确认决策

| 项 | 结论 |
| --- | --- |
| 文档形态 | 完整目标态 + 本期/后置 |
| 浏览权限 | **须登录**；未登录进社区 Tab / 深链 → 引导登录 |
| 转发 | **仅微信分享卡片**；无站内转发实体、无分享次数 API |
| 热门排序 | 本期时间衰减热度（§3.6）；gravity 固定常量 |
| 图片上限 | 动态 ≤3；评论 ≤1；本地 `uploads/`，OSS 后置 |
| 删除 | **软删**；作者删自己的；**Admin 可删任意**；列表不可见；深链提示「已删除」 |
| 评论树 | 最多两级；对回复再回仍挂在一级评论下（`parentId` = 一级） |
| `#` 活动 | 0～3；仅 `lifecycle=published` 且 `now < endAt`（与 ADR-0006 可发现一致）；搜索选择，非正文自由弱匹配 |
| 通知 | 赞动态、赞评论、评动态、回复评论；一事一行不聚合；无微信订阅推送 |
| 字数 | 动态 ≤200 Unicode 码元；评论 ≤100（JS `string.length`，trim 后） |
| 内容最低要求 | 正文非空 **或** 至少 1 张图 |
| 自赞 | 允许 |
| Tab | 首页 / 社区 / 我的 |
| 我的入口 | 「我的」页入口区新增「我的动态」，与「我的活动」「我的信息」同级 |
| 存储 / 中间件 | Postgres；不上 Redis/MQ（ADR-0010） |
| Admin UI | 本期以 **软删 API** 为准；列表/删除页可最小实现，打磨后置 |

## 3. 数据

枚举与 DTO 放 `packages/shared`。

### 3.1 `Post`

| 字段 | 规则 |
| --- | --- |
| `id` | cuid |
| `authorId` | → `User` |
| `body` | trim；可空串仅当有图；最长 200 |
| `likeCount` | 非负；点赞变更时维护 |
| `commentCount` | 非负；仅统计未软删评论（含二级） |
| `deletedAt` | `null` 正常；非空为软删 |
| `deletedBy` | `author` \| `admin` \| null |
| `createdAt` / `updatedAt` | 常规 |

索引：`@@index([deletedAt, createdAt])`；热门可用 `(deletedAt, likeCount, commentCount, createdAt)` 或应用层算分后排序（见 §3.6）。

### 3.2 `PostImage`

| 字段 | 规则 |
| --- | --- |
| `id` | cuid |
| `postId` | → `Post` |
| `url` | 本服务上传路径（`/api/uploads/community/...`） |
| `sortOrder` | 0..2 |

约束：同一 `postId` 最多 3 行（服务端校验）。

### 3.3 `PostActivityLink`

| 字段 | 规则 |
| --- | --- |
| `postId` | → `Post` |
| `activityId` | → `Activity` |
| `sortOrder` | 0..2 |

`@@unique([postId, activityId])`；同一 post 最多 3 条。创建时活动须满足可发现规则；活动日后结束/下架：**链接保留**，展示时标题按公开详情规则解析，不可点进有效详情则灰态或「活动不可用」（不删历史动态）。

### 3.4 `Comment`

| 字段 | 规则 |
| --- | --- |
| `id` | cuid |
| `postId` | → `Post` |
| `authorId` | → `User` |
| `parentId` | `null` = 一级；非空则必须指向**同 post 的一级评论**（`parentId` 为空的那条） |
| `body` | trim；可空仅当有图；最长 100 |
| `imageUrl` | 可选；本服务 community 上传路径 |
| `likeCount` | 非负 |
| `deletedAt` / `deletedBy` | 同 Post |
| `createdAt` / `updatedAt` | 常规 |

索引：`@@index([postId, deletedAt, createdAt])`；`@@index([parentId])`。

软删一级评论：列表不展示该枝；其下未删回复对作者以外不可见（或整枝隐藏——**本期整枝对 Feed/详情不可见**，深链到回复则「已删除」）。`commentCount` 不含已软删。

### 3.5 `Like`

多态点赞，避免两套表。

| 字段 | 规则 |
| --- | --- |
| `id` | cuid |
| `userId` | → `User` |
| `targetType` | `post` \| `comment` |
| `targetId` | 目标 id |
| `createdAt` | 常规 |

`@@unique([userId, targetType, targetId])`。取消赞：删行并递减对应 `likeCount`（下限 0）。目标已软删：点赞 API 返回 404 类业务错误。

### 3.6 热门分数

常量放 shared，例如：

- `HOT_HALF_LIFE_HOURS = 48`
- `HOT_GRAVITY = 1.5`
- `HOT_AGE_OFFSET_HOURS = 2`

\[
\mathrm{score} = \frac{\mathrm{likeCount} + \mathrm{commentCount}}{\left(\frac{\mathrm{ageHours} + 2}{48}\right)^{1.5}}
\]

`ageHours = (now - createdAt)` 小时（浮点）。同分：`createdAt` 新者优先。列表可 DB 粗排 + 页内精算，或对候选窗（如最近 N 天未删动态）算分排序；**本期不要求**物化 `hotScore` 列（后置可缓存）。

### 3.7 `Notification`

| 字段 | 规则 |
| --- | --- |
| `id` | cuid |
| `recipientId` | 接收用户 → `User` |
| `actorId` | 触发者 → `User` |
| `type` | `like_post` \| `like_comment` \| `comment_post` \| `reply_comment` |
| `postId` | 始终有，便于跳转 |
| `commentId` | 赞评论 / 新评论 / 回复时有；赞动态为 `null` |
| `readAt` | `null` = 未读 |
| `createdAt` | 常规 |

规则：

- **不给自己发通知**（自赞、自己评自己的动态等不写）。
- 一事一行，不聚合。
- 目标软删后：通知仍可列出；点击跳转按软删深链处理。
- 索引：`@@index([recipientId, readAt, createdAt])`。

跳转语义：

| type | 落地 |
| --- | --- |
| `like_post` | 动态详情（无评论锚点） |
| `like_comment` | 动态详情 + 锚定该评论 |
| `comment_post` | 动态详情 + 锚定新评论 |
| `reply_comment` | 动态详情 + 锚定回复评论 |

## 4. API 契约摘要

除 Admin 外均需 **User JWT**。错误：HTTP + `message`（及既有 `code` 习惯）。分页默认 `page=1`，`pageSize=20`，上限 50。

### 4.1 上传

`POST /me/uploads/community`

- 仅 `UserJwtGuard`（不要求 `canPublish`）。
- `multipart` 字段 `file`；jpeg/png/webp/gif；**单张 ≤2MB**。
- 落盘：`uploads/community/{uuid}{ext}`。
- 响应：`{ url }`，与头像/封面同一 `PUBLIC_API_BASE` 规则。

### 4.2 动态

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/community/posts` | Feed。`sort=latest\|hot`（默认 `latest`）；仅 `deletedAt=null` |
| `GET` | `/community/posts/mine` | 当前用户未删动态，按 `createdAt` desc |
| `GET` | `/community/posts/:id` | 详情；已软删 → 404 + `POST_DELETED`（或等价 code） |
| `POST` | `/community/posts` | 发布。body + `imageUrls[]` + `activityIds[]` |
| `DELETE` | `/community/posts/:id` | 作者软删 |

创建校验：字数/图数/活动数；每个 `activityId` 可发现；`imageUrls` 须为本服务 community 路径。响应含作者展示字段（`nickname`/`avatarUrl`，空昵称「用户」）、图片、活动摘要（`id`/`title`）、`likedByMe`、计数、时间。

### 4.3 评论

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/community/posts/:id/comments` | 一级分页；每条可带 `replies`（二级未删，按时间 asc）或二级另拉——**本期一级页内带齐二级**（单层动态回复量预期可控） |
| `POST` | `/community/posts/:id/comments` | `body` / `imageUrl` / 可选 `parentId` |
| `DELETE` | `/community/comments/:id` | 作者软删 |

`parentId` 若指向二级评论：服务端改挂到该评论的一级祖先。动态已删不可评。

### 4.4 点赞

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/community/likes` | `{ targetType, targetId }` 幂等：已赞返回当前态 |
| `DELETE` | `/community/likes` | body 或 query 同目标；未赞视为成功 |

成功后维护计数；按 §3.7 写通知。

### 4.5 通知

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/community/notifications` | 当前用户，时间倒序；含 `unread` 摘要或另提供 count |
| `GET` | `/community/notifications/unread-count` | `{ count }` |
| `POST` | `/community/notifications/read` | `{ ids?: string[] }`；空/`all` 策略：**本期支持 `ids` 或 `all: true`** |

### 4.6 Admin

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `DELETE` | `/admin/community/posts/:id` | 软删，`deletedBy=admin`；写审计（沿用 ADR-0008 习惯） |
| `DELETE` | `/admin/community/comments/:id` | 同上 |

Admin 列表 UI 后置打磨；API 本期必备。

### 4.7 活动选择辅助

复用或薄封装可发现活动搜索（标题 `q`），供编辑页选 `#`：仅返回 ADR-0006 列表可见活动。可 `GET /community/activity-candidates?q=&page=`。

## 5. 小程序

### 5.1 路由与 Tab

[`apps/mp/src/pages.json`](../../../apps/mp/src/pages.json)：

- 新增 tab：`pages/community/index`（社区）
- 二级：`pages/community/compose`（发布）、`pages/community/detail`（详情+评论）、`pages/community/mine`（我的动态）、`pages/community/notifications`（通知列表）
- tabBar：`首页` → `社区` → `我的`

### 5.2 社区 Feed

- 顶栏切换「最新 / 最热门」。
- 竖直列表；卡片三区见目标。
- 右下角 FAB（固定不随列表滚出视口）：进 `compose`。
- 点卡片进详情；点活动标签进活动详情（不可用则 toast）。
- 「转发」：适配层分享（`onShareAppMessage` / 既有 share adapter），路径指向动态详情；**不调转发计数 API**。

### 5.3 编辑页

- 正文、选图（≤3）、搜索多选活动（≤3）。
- 提交调 `POST /community/posts`；成功返回 Feed 或详情。

### 5.4 详情与评论

- 展示完整动态与评论树；赞、回、删（仅自己的）。
- 分享菜单启用。

### 5.5 我的

[`pages/mine/registrations`](../../../apps/mp/src/pages/mine/registrations.vue) 入口行增加「我的动态」→ `pages/community/mine`，与「我的活动」「我的信息」同级排布（可三入口或换行，信息架构同级即可）。

### 5.6 首页通知

首页（`pages/home/index`）增加铃铛：未读角标来自 `unread-count`；点击进通知列表；项点击按 §3.7 跳转 `detail?id=&commentId=`。

### 5.7 登录门闸

社区 Tab / 相关二级页：未登录先走现有登录流程，成功后再加载。

## 6. Admin

本期：软删 API + 审计。最小管理页已落地（列表关键字 + 软删动态；抽屉查看/软删评论），见 [2026-11-10-admin-community-moderation-design.md](./2026-11-10-admin-community-moderation-design.md)。不做社区内容审核队列（举报后置）。

## 7. 非目标（后置）

- OSS/CDN、Redis/MQ
- 举报、关注、@、站内转发、分享次数
- 通知聚合、社区订阅消息
- 评论无限嵌套、热度运营调参后台
- 未登录公开浏览社区

## 8. 验收

| ID | 场景 |
| --- | --- |
| AT-COM-01 | 登录用户三 Tab 可见；未登录进社区被要求登录 |
| AT-COM-02 | 发布纯文 / 纯图 / 文+图；超字数或超 3 图失败 |
| AT-COM-03 | 关联 0～3 个可发现活动；不可发现活动拒绝 |
| AT-COM-04 | Feed 最新按时间；热门按 §3.6 衰减分 |
| AT-COM-05 | 作者软删后 Feed 不可见；深链「已删除」 |
| AT-COM-06 | Admin 软删动态/评论生效并审计 |
| AT-COM-07 | 点赞/取消幂等；计数正确；可自赞但不产生通知 |
| AT-COM-08 | 一级评论 + 回复挂一级；三级语义挂一级；字数/1 图限制 |
| AT-COM-09 | 他人赞/评/回复产生通知；铃铛未读；跳转锚点正确 |
| AT-COM-10 | 「转发」调起微信分享且无站内转发记录 |
| AT-COM-11 | 「我的动态」仅当前用户未删动态 |
| AT-COM-12 | 上传非 community 路径的 url 创建失败 |

## 9. 实现落点（指导，非本期文档任务）

- `packages/shared/src/community.ts`：社区枚举、热度常量、DTO
- `apps/api/src/community/`：动态、评论、点赞、通知模块；`apps/api/src/admin-community/`：运营软删；`apps/api/prisma/schema.prisma`：数据模型
- `apps/mp/src/pages/community/`：Feed、发布、详情互动、我的动态、通知；`apps/mp/src/pages/home/index.vue`：首页铃铛；`apps/mp/src/adapters/share.ts`：微信分享
- `apps/admin`：可选最小删帖页
- 实现前 ADR-0016 须为 **Accepted**

自动化验收已于 2026-11-03 完成：API 全量测试 248 passed、16 skipped，API 类型检查通过。微信开发者工具手测仍待人工执行，范围见 §8 AT-COM-01～12。

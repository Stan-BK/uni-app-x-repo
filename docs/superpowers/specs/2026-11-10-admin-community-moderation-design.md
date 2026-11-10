# Admin 社区动态最小管理页

- **日期：** 2026-11-10
- **状态：** Approved（待实现）
- **关联：** roadmap P1-5；[ADR-0016](../../adr/0016-community-feed.md)；母规格 [2026-11-03-community-feed-design.md](./2026-11-03-community-feed-design.md) §6
- **范围：** 落地母规格「最小管理页（列表关键字 + 删除）」可选能力；**不做**审核队列 / 上下架态 / 恢复已删 / 举报。

## 1. 目标

运营可在 Admin 后台：

1. 按关键字检索**未删除**社区动态；
2. 软删动态；
3. 在右侧抽屉中查看评论树并软删评论。

成功标准对应验收 AT-COM-ADMIN-01～04（§6）。

## 2. 已确认决策

| 项 | 结论 |
| --- | --- |
| 范围形态 | 动态列表为主 + 抽屉管评论（方案 B + 抽屉 A） |
| 列表内容 | 仅 `deletedAt = null`；已删不入列表，回看靠审计日志 |
| 架构 | Admin 专用只读 API + 复用既有软删 DELETE（方案 1） |
| 关键字 `q` | 可选；匹配正文 **或** 作者昵称（`contains`，Postgres `mode: 'insensitive'`）；空串 = 不筛 |
| 删除 UX | `ElMessageBox.confirm`，**不**强制填原因（与现软删 API 一致） |
| 权限 | 后端 `AdminJwtGuard` + `operator \| admin`；前端不新增 Capability，登录运营可见入口 |
| 数据模型 | 不改 Prisma；无审核 / 上下架状态机 |
| ADR | 不新开 ADR；落在 ADR-0016「最小管理页可选」内 |

## 3. API

前缀：`/admin/community`。鉴权与现有软删相同。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/posts?q=&page=&pageSize=` | 未删动态分页；`createdAt desc`；分页默认与社区用户侧一致（`page=1`，`pageSize=20`，上限同 `normalizePaging`） |
| `GET` | `/posts/:id` | 未删详情；已删或不存在 → 404 |
| `GET` | `/posts/:id/comments?page=&pageSize=` | 一级分页；页内带齐未删二级（对齐用户侧结构）；分页同上 |
| `DELETE` | `/posts/:id` | 已有：Admin 软删动态 + 审计 |
| `DELETE` | `/comments/:id` | 已有：Admin 软删评论 + 审计（一级级联未删回复） |

### 3.1 列表 / 详情 DTO

相对用户侧 `mapPost`：**省略** `likedByMe`。字段：

- `id`, `body`
- `author`: `{ id, nickname, avatarUrl }`
- `images`: `{ url, sortOrder }[]`
- `activities`: `{ id, title }[]`
- `likeCount`, `commentCount`, `createdAt`（ISO 字符串）

列表响应：`{ items, total, page, pageSize }`。

### 3.2 评论 DTO

对齐用户侧评论树形状，**省略** `likedByMe`（及仅服务互动的字段）。仅返回 `deletedAt = null` 的评论；动态已删或不存在时整接口 404。

## 4. Admin UI

### 4.1 入口

- 路由：`/community` → `views/CommunityPosts.vue`
- 侧栏：`navigation.ts` 增加「社区动态」（图标建议 `ChatDotRound`）
- 顺序：用户发布权 / 活动列表 / **社区动态** / 审计日志

### 4.2 列表页

- `PageHeader`：标题「社区动态」；说明检索未删动态、可软删或开抽屉处理评论
- `SearchForm`：单输入「正文 / 作者昵称」+ 查询 / 重置；刷新按钮
- `ProTableLite` + `useTable` 分页
- 列：作者、正文摘要（截断）、图数、关联活动数、赞/评、时间、操作
- 操作：`评论`（开抽屉）、`删除`（确认后调 DELETE）

### 4.3 抽屉

- 打开时并行请求详情 + 评论
- 头部：作者、全文、缩略图（可预览）、关联活动、赞/评、`删除动态`
- 评论区：一级 + 缩进二级；作者、正文、可选图、时间、`删除`
- 删评论 → 刷新评论树，并更新列表行 `commentCount`
- 删动态 → 关抽屉并刷新列表
- 详情 404 → 提示「动态不存在或已删除」，关抽屉并刷新列表

### 4.4 错误处理

- 列表 401 → `handleListError` 跳登录
- 软删 404 → toast「已删除或不存在」，刷新对应视图
- 其他 `ApiError` → 展示服务端 `message`

## 5. 非目标

- 内容审核队列、通过后展示、上下架（非删除）隐藏
- 恢复已删、批量删除、评论独立列表页
- 热度调参、举报、关注/@、OSS 迁移
- Admin 前端自动化单测（与现有 Users/Activities 一致，手工验收）

## 6. 验收

| ID | 场景 |
| --- | --- |
| AT-COM-ADMIN-01 | 关键字搜正文 / 昵称，结果均为未删动态 |
| AT-COM-ADMIN-02 | 软删动态后列表消失；审计存在 `soft_delete_post` |
| AT-COM-ADMIN-03 | 抽屉内软删评论后树更新、`commentCount` 正确；审计存在 `soft_delete_comment` |
| AT-COM-ADMIN-04 | `operator` 与 `admin` 可访问；未登录不可 |

## 7. 实现落点

- `apps/api/src/admin-community/`：list / get / listComments + 既有 softDelete；单测扩展
- `apps/admin/src/api/admin.ts`：客户端封装
- `apps/admin/src/views/CommunityPosts.vue`：列表 + 抽屉
- `apps/admin/src/router.ts`、`navigation.ts`
- 文档：更新母规格 §6、roadmap P1-5、ADR-0016 实现备注

## 8. 测试（API）

- `listPosts`：无 `q` 仅未删；`q` 命中正文或昵称；分页字段正确
- `getPost`：未删 OK；已删 / 不存在 404
- `listComments`：动态不存在 / 已删 404；仅未删；二级挂一级
- 既有 softDelete 用例保持通过

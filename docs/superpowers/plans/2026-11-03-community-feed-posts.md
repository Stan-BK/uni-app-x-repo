# 社区动态 · 动态基座 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地登录可见的社区 Feed：发布/列表（最新·热门）/详情读/我的动态/作者与 Admin 软删、本地图片上传、`#` 活动关联；小程序三 Tab + FAB + 编辑页 + 我的入口 + 微信分享适配。

**Architecture:** Nest `community` 模块 + Prisma `Post`/`PostImage`/`PostActivityLink`。热度纯函数算分后排序。上传扩 `uploads/community`。本计划**不含**评论、点赞、通知（见 [engagement 计划](./2026-11-03-community-feed-engagement.md)）；详情页可先只展示动态正文，互动区占位。

**Tech Stack:** NestJS、Prisma、PostgreSQL、Vitest、uni-app Vue3、`@activity/shared`

**前置文档：** [ADR-0016](../../adr/0016-community-feed.md)、[规格](../specs/2026-11-03-community-feed-design.md)

---

## 文件结构

```text
packages/shared/src/community.ts
packages/shared/src/audit.ts          # 扩展 AuditAction / AuditTargetType
packages/shared/src/index.ts

apps/api/prisma/schema.prisma
apps/api/prisma/migrations/20261103120000_community_posts/migration.sql

apps/api/src/community/community-hot-score.ts
apps/api/src/community/community-hot-score.spec.ts
apps/api/src/community/posts.mapper.ts
apps/api/src/community/posts.service.ts
apps/api/src/community/posts.service.spec.ts
apps/api/src/community/posts.controller.ts
apps/api/src/community/dto/create-post.dto.ts
apps/api/src/community/dto/list-posts.query.ts
apps/api/src/community/community.module.ts
apps/api/src/admin-community/admin-community.service.ts
apps/api/src/admin-community/admin-community.service.spec.ts
apps/api/src/admin-community/admin-community.controller.ts
apps/api/src/admin-community/admin-community.module.ts
apps/api/src/uploads/uploads.controller.ts
apps/api/src/app.module.ts

apps/mp/src/pages.json
apps/mp/src/adapters/share.ts
apps/mp/src/pages/community/index.vue
apps/mp/src/pages/community/compose.vue
apps/mp/src/pages/community/detail.vue   # 本期仅动态正文；评论区占位文案
apps/mp/src/pages/community/mine.vue
apps/mp/src/pages/mine/registrations.vue
apps/mp/src/static/tab-community.png
apps/mp/src/static/tab-community-active.png
```

---

### Task 1: shared 常量与审计扩展

**Files:**
- Create: `packages/shared/src/community.ts`
- Modify: `packages/shared/src/audit.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: 写 `community.ts`**

```ts
export const CommunityPostSort = {
  Latest: "latest",
  Hot: "hot",
} as const;
export type CommunityPostSort =
  (typeof CommunityPostSort)[keyof typeof CommunityPostSort];

export const CommunityDeletedBy = {
  Author: "author",
  Admin: "admin",
} as const;
export type CommunityDeletedBy =
  (typeof CommunityDeletedBy)[keyof typeof CommunityDeletedBy];

/** 规格 §3.6 */
export const COMMUNITY_HOT_HALF_LIFE_HOURS = 48;
export const COMMUNITY_HOT_GRAVITY = 1.5;
export const COMMUNITY_HOT_AGE_OFFSET_HOURS = 2;

export const COMMUNITY_POST_BODY_MAX = 200;
export const COMMUNITY_POST_IMAGES_MAX = 3;
export const COMMUNITY_POST_ACTIVITIES_MAX = 3;
export const COMMUNITY_COMMENT_BODY_MAX = 100;
export const COMMUNITY_COMMENT_IMAGES_MAX = 1;

export const LikeTargetType = {
  Post: "post",
  Comment: "comment",
} as const;
export type LikeTargetType =
  (typeof LikeTargetType)[keyof typeof LikeTargetType];

export const NotificationType = {
  LikePost: "like_post",
  LikeComment: "like_comment",
  CommentPost: "comment_post",
  ReplyComment: "reply_comment",
} as const;
export type NotificationType =
  (typeof NotificationType)[keyof typeof NotificationType];
```

- [ ] **Step 2: 扩展 `audit.ts`**

在 `AuditAction` 增加 `SoftDeletePost: "soft_delete_post"`、`SoftDeleteComment: "soft_delete_comment"`；在 `AuditTargetType` 增加 `Post: "post"`、`Comment: "comment"`；同步 `AuditActionLabel`。

- [ ] **Step 3: `index.ts` 导出**

```ts
export * from "./community";
```

- [ ] **Step 4: 类型检查并提交**

Run: `pnpm --filter @activity/shared type-check`  
Expected: 通过

```bash
git add packages/shared/src/community.ts packages/shared/src/audit.ts packages/shared/src/index.ts
git commit -m "$(cat <<'EOF'
feat(shared): 社区动态枚举、热度常量与审计目标

EOF
)"
```

---

### Task 2: Prisma 模型与 migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20261103120000_community_posts/migration.sql`

- [ ] **Step 1: 在 schema 增加枚举与模型**

在 `User` 上增加关系：`posts Post[]`、`comments Comment[]`、`likes Like[]`、`notificationsReceived Notification[]` `@relation("NotificationRecipient")`、`notificationsActed Notification[]` `@relation("NotificationActor")`。

在 `Activity` 上增加：`postLinks PostActivityLink[]`。

追加（字段与规格一致；Comment/Like/Notification 本计划一并建表，engagement 计划再写服务，避免二次 migration）：

```prisma
enum CommunityDeletedBy {
  author
  admin
}

enum LikeTargetType {
  post
  comment
}

enum NotificationType {
  like_post
  like_comment
  comment_post
  reply_comment
}

model Post {
  id           String               @id @default(cuid())
  authorId     String
  body         String               @default("")
  likeCount    Int                  @default(0)
  commentCount Int                  @default(0)
  deletedAt    DateTime?
  deletedBy    CommunityDeletedBy?
  createdAt    DateTime             @default(now())
  updatedAt    DateTime             @updatedAt
  author       User                 @relation(fields: [authorId], references: [id])
  images       PostImage[]
  activityLinks PostActivityLink[]
  comments     Comment[]
  notifications Notification[]

  @@index([deletedAt, createdAt])
  @@index([authorId, deletedAt, createdAt])
}

model PostImage {
  id        String @id @default(cuid())
  postId    String
  url       String
  sortOrder Int    @default(0)
  post      Post   @relation(fields: [postId], references: [id], onDelete: Cascade)

  @@index([postId])
}

model PostActivityLink {
  id         String   @id @default(cuid())
  postId     String
  activityId String
  sortOrder  Int      @default(0)
  post       Post     @relation(fields: [postId], references: [id], onDelete: Cascade)
  activity   Activity @relation(fields: [activityId], references: [id])

  @@unique([postId, activityId])
  @@index([activityId])
}

model Comment {
  id        String               @id @default(cuid())
  postId    String
  authorId  String
  parentId  String?
  body      String               @default("")
  imageUrl  String?
  likeCount Int                  @default(0)
  deletedAt DateTime?
  deletedBy CommunityDeletedBy?
  createdAt DateTime             @default(now())
  updatedAt DateTime             @updatedAt
  post      Post                 @relation(fields: [postId], references: [id])
  author    User                 @relation(fields: [authorId], references: [id])
  parent    Comment?             @relation("CommentReplies", fields: [parentId], references: [id])
  replies   Comment[]            @relation("CommentReplies")
  notifications Notification[]

  @@index([postId, deletedAt, createdAt])
  @@index([parentId])
}

model Like {
  id         String         @id @default(cuid())
  userId     String
  targetType LikeTargetType
  targetId   String
  createdAt  DateTime       @default(now())
  user       User           @relation(fields: [userId], references: [id])

  @@unique([userId, targetType, targetId])
  @@index([targetType, targetId])
}

model Notification {
  id          String           @id @default(cuid())
  recipientId String
  actorId     String
  type        NotificationType
  postId      String
  commentId   String?
  readAt      DateTime?
  createdAt   DateTime         @default(now())
  recipient   User             @relation("NotificationRecipient", fields: [recipientId], references: [id])
  actor       User             @relation("NotificationActor", fields: [actorId], references: [id])
  post        Post             @relation(fields: [postId], references: [id])
  comment     Comment?         @relation(fields: [commentId], references: [id])

  @@index([recipientId, readAt, createdAt])
}
```

- [ ] **Step 2: 手写 migration SQL**

与 schema 对齐的 `CREATE TYPE` / `CREATE TABLE` / 索引 / FK；勿依赖 `prisma migrate diff` 若团队惯例是手写（对照既有 `20261102120000_*`）。

- [ ] **Step 3: 生成 Client**

Run: `pnpm --filter @activity/api exec prisma generate`  
Expected: 成功

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20261103120000_community_posts
git commit -m "$(cat <<'EOF'
feat(api): 社区动态 Post/Comment/Like/Notification 表

EOF
)"
```

---

### Task 3: 热度纯函数

**Files:**
- Create: `apps/api/src/community/community-hot-score.ts`
- Create: `apps/api/src/community/community-hot-score.spec.ts`

- [ ] **Step 1: 失败测试**

```ts
import { describe, expect, it } from "vitest";
import { communityHotScore } from "./community-hot-score";

describe("communityHotScore", () => {
  it("年龄为 0 且无互动时分数为 0", () => {
    expect(
      communityHotScore({
        likeCount: 0,
        commentCount: 0,
        ageHours: 0,
      }),
    ).toBe(0);
  });

  it("同等互动下更旧的帖分数更低", () => {
    const newer = communityHotScore({
      likeCount: 10,
      commentCount: 2,
      ageHours: 1,
    });
    const older = communityHotScore({
      likeCount: 10,
      commentCount: 2,
      ageHours: 48,
    });
    expect(newer).toBeGreaterThan(older);
  });
});
```

- [ ] **Step 2: 跑测确认失败**

Run: `pnpm --filter @activity/api test -- src/community/community-hot-score.spec.ts`  
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

```ts
import {
  COMMUNITY_HOT_AGE_OFFSET_HOURS,
  COMMUNITY_HOT_GRAVITY,
  COMMUNITY_HOT_HALF_LIFE_HOURS,
} from "@activity/shared";

export function communityHotScore(input: {
  likeCount: number;
  commentCount: number;
  ageHours: number;
}): number {
  const engagement = input.likeCount + input.commentCount;
  if (engagement <= 0) return 0;
  const denom = Math.pow(
    (input.ageHours + COMMUNITY_HOT_AGE_OFFSET_HOURS) /
      COMMUNITY_HOT_HALF_LIFE_HOURS,
    COMMUNITY_HOT_GRAVITY,
  );
  return engagement / denom;
}
```

- [ ] **Step 4: 再跑测通过并提交**

```bash
git add apps/api/src/community/community-hot-score.ts apps/api/src/community/community-hot-score.spec.ts
git commit -m "$(cat <<'EOF'
feat(api): 社区热门时间衰减计分

EOF
)"
```

---

### Task 4: community 图片上传

**Files:**
- Modify: `apps/api/src/uploads/uploads.controller.ts`

- [ ] **Step 1: 增加 `community` 目录与路由**

与 `avatar` 同级：`POST community`，`UserJwtGuard` only（无 `CanPublishGuard`），上限 2MB，目录 `uploads/community`，url 形如 `{PUBLIC_API_BASE}/uploads/community/{filename}`。

- [ ] **Step 2: 手动或现有上传测例若有则扩展；否则 type-check**

Run: `pnpm --filter @activity/api type-check`

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/uploads/uploads.controller.ts
git commit -m "$(cat <<'EOF'
feat(api): 社区动态图片上传接口

EOF
)"
```

---

### Task 5: PostsService（创建 / Feed / 详情 / 我的 / 作者删 / 活动候选）

**Files:**
- Create: `apps/api/src/community/dto/create-post.dto.ts`
- Create: `apps/api/src/community/dto/list-posts.query.ts`
- Create: `apps/api/src/community/posts.mapper.ts`
- Create: `apps/api/src/community/posts.service.ts`
- Create: `apps/api/src/community/posts.service.spec.ts`

- [ ] **Step 1: 写关键失败测例（节选须全部写入 spec）**

覆盖：

1. 正文与图皆空 → `BadRequestException`
2. body 超 200 → 400
3. 图片 >3 → 400
4. `imageUrls` 非 `/uploads/community/` 路径 → 400
5. 活动不可发现 → 400
6. 创建成功返回含 author 展示名、images、activities
7. `list({ sort: latest })` 仅未删、按 `createdAt` desc
8. `list({ sort: hot })` 调用计分后新热帖优先（构造 fixture：高赞旧帖 vs 低赞新帖，断言顺序符合公式）
9. 作者 `softDelete` 后 list 不可见；`getById` 抛 NotFound + message 含已删除语义
10. 非作者 `softDelete` → Forbidden

用 Vitest mock `PrismaService`（对照 `registrations.service.spec.ts` 风格）。

- [ ] **Step 2: 跑测确认失败**

Run: `pnpm --filter @activity/api test -- src/community/posts.service.spec.ts`

- [ ] **Step 3: 实现 Service**

要点：

- `isCommunityUploadUrl(url: string)`：解析 pathname 含 `/uploads/community/`
- `assertDiscoverableActivities(ids, now)`：`lifecycle=published` 且 `endAt > now`（与公开列表一致；`endAt` 若 null 按现有活动域惯例处理——若库中必填则只比 `endAt`）
- `create`：事务写 Post + images + links；`commentCount/likeCount=0`
- `list`：`where: { deletedAt: null }`；latest `orderBy createdAt desc` + skip/take；hot 先取候选窗（如 `createdAt >= now - 30d`，`take` 上限 200）再内存 `communityHotScore` 排序后切片分页
- `mapPost`：昵称空 → `"用户"`；附 `likedByMe: false`（engagement 再填真值，本计划列表可先不查 Like 表）
- 软删：`deletedAt=now`，`deletedBy=author`

- [ ] **Step 4: 测通并提交**

```bash
git add apps/api/src/community/
git commit -m "$(cat <<'EOF'
feat(api): 社区动态发布、Feed 与作者软删

EOF
)"
```

---

### Task 6: HTTP 控制器与 Module

**Files:**
- Create: `apps/api/src/community/posts.controller.ts`
- Create: `apps/api/src/community/community.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Controller**

`@Controller("community")` + `@UseGuards(UserJwtGuard)`：

| Method | Path | Handler |
| --- | --- | --- |
| GET | `posts` | list query `sort`/`page`/`pageSize` |
| GET | `posts/mine` | mine |
| GET | `posts/:id` | getById |
| POST | `posts` | create |
| DELETE | `posts/:id` | softDelete author |
| GET | `activity-candidates` | q/page → 可发现活动 `{ id, title }[]` |

从 request 取 `userId`（与现有 `registrations.controller` 相同装饰器/方式）。

- [ ] **Step 2: Module 注册进 AppModule**

- [ ] **Step 3: type-check + 相关单测**

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(api): 暴露 community posts HTTP 接口

EOF
)"
```

---

### Task 7: Admin 软删动态

**Files:**
- Create: `apps/api/src/admin-community/admin-community.service.ts`
- Create: `apps/api/src/admin-community/admin-community.service.spec.ts`
- Create: `apps/api/src/admin-community/admin-community.controller.ts`
- Create: `apps/api/src/admin-community/admin-community.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: 测例** — 已存在动态 Admin 软删写 `deletedBy=admin` + `auditLog`（`action: soft_delete_post`，`targetType: post`）；重复删已删 → 404 或 Conflict（选一种并在测例锁死：**404**）

- [ ] **Step 2: 实现** — `DELETE /admin/community/posts/:id`，`AdminJwtGuard` + `RolesGuard`（与 `admin-activities` 同角色要求）

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(api): Admin 软删社区动态

EOF
)"
```

---

### Task 8: 小程序 Tab、Feed、发布、详情占位、我的动态、分享

**Files:**
- Modify: `apps/mp/src/pages.json`
- Modify: `apps/mp/src/adapters/share.ts`
- Create: `apps/mp/src/pages/community/index.vue`
- Create: `apps/mp/src/pages/community/compose.vue`
- Create: `apps/mp/src/pages/community/detail.vue`
- Create: `apps/mp/src/pages/community/mine.vue`
- Modify: `apps/mp/src/pages/mine/registrations.vue`
- Add: tab 图标（可复制现有 tab png 改名占位，后续换设计稿）

- [ ] **Step 1: `pages.json`**

注册四页；tabBar 中间插入社区（`pages/community/index`）。`detail` 开启 `enableShareAppMessage`。

- [ ] **Step 2: share 适配扩展**

```ts
export function buildPostSharePath(id: string): string {
  return `/pages/community/detail?id=${encodeURIComponent(id)}`;
}

export function getPostShareMessage(post: {
  id: string;
  body: string;
  images?: { url: string }[];
}): MpShareMessage {
  const title = (post.body || "社区动态").trim().slice(0, 30) || "社区动态";
  const msg: MpShareMessage = { title, path: buildPostSharePath(post.id) };
  const cover = post.images?.[0]?.url?.trim();
  if (cover) msg.imageUrl = cover;
  return msg;
}
```

- [ ] **Step 3: `index.vue`**

- `onShow`：未登录 → 引导登录（复用 user store 现有登录入口）
- 顶栏切换 latest/hot；下拉/触底分页 `GET /community/posts`
- 三区卡片；FAB → compose
- 转发按钮：`open-type="share"` 或调适配层（微信）

- [ ] **Step 4: `compose.vue`**

选图 → `uni.uploadFile` → `/me/uploads/community`；活动搜索 `activity-candidates`；提交 `POST /community/posts`。

- [ ] **Step 5: `detail.vue`**

拉 `GET /community/posts/:id`；已删除展示文案；评论/赞区显示「即将开放」占位（engagement 计划替换）。`onShareAppMessage` 用 `getPostShareMessage`。

- [ ] **Step 6: `mine.vue` + registrations 入口**

`GET /community/posts/mine`；入口文案「我的动态」，与「我的活动」「我的信息」同级。

- [ ] **Step 7: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(mp): 社区 Tab、发布与我的动态入口

EOF
)"
```

---

### Task 9: 基座验收与文档勾选

- [ ] **Step 1:** `pnpm --filter @activity/api test` 与 `type-check`；mp 若有 type-check 则跑

- [ ] **Step 2:** 手测清单（开发者工具）：登录 → 社区 Tab → 发图文 → Feed 最新/热门 → 我的动态 → 分享菜单有 path → 作者删除后 Feed 消失

- [ ] **Step 3:** 在 `docs/roadmap.md` P1-5 中勾选本计划已覆盖项（Feed/发布/软删/上传/我的入口/分享）；评论赞通知保持未勾

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
docs: 勾选 P1-5 社区动态基座完成项

EOF
)"
```

---

## 本计划自检

| 规格项 | 任务 |
| --- | --- |
| 登录可见 Feed / 发布 / 图≤3 / 字≤200 | T5–T6, T8 |
| `#` 0～3 可发现活动 | T5 |
| 最新/热门 | T3, T5 |
| 作者+Admin 软删动态 | T5, T7 |
| Tab / FAB / 我的动态 / 微信分享 | T8 |
| Comment/Like/Notification 表 | T2（服务在 engagement） |

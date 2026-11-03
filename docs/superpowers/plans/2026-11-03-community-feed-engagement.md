# 社区动态 · 互动与通知 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在动态基座之上完成两级评论、点赞、站内通知、详情互动 UI、首页铃铛，以及 Admin 软删评论；收尾将 ADR-0016 / roadmap P1-5 标为完成。

**Architecture:** 同 Nest `community` 模块扩展 `CommentsService`、`LikesService`、`NotificationsService`。点赞事务内维护计数并写 `Notification`（不给自己发）。列表/详情补 `likedByMe`。无 Redis/MQ。

**Tech Stack:** 同基座计划

**前置：** [动态基座计划](./2026-11-03-community-feed-posts.md) 已合入；[ADR-0016](../../adr/0016-community-feed.md)、[规格](../specs/2026-11-03-community-feed-design.md)

---

## 文件结构

```text
apps/api/src/community/comments.service.ts
apps/api/src/community/comments.service.spec.ts
apps/api/src/community/likes.service.ts
apps/api/src/community/likes.service.spec.ts
apps/api/src/community/notifications.service.ts
apps/api/src/community/notifications.service.spec.ts
apps/api/src/community/comments.controller.ts   # 或并入 posts.controller 路由
apps/api/src/community/likes.controller.ts
apps/api/src/community/notifications.controller.ts
apps/api/src/community/dto/create-comment.dto.ts
apps/api/src/community/dto/like.dto.ts
apps/api/src/community/dto/read-notifications.dto.ts
apps/api/src/community/community.module.ts      # 注册新 provider
apps/api/src/community/posts.service.ts        # list/get 填 likedByMe；删帖不影响本计划主路径
apps/api/src/admin-community/admin-community.service.ts  # 增删评论
apps/api/src/admin-community/admin-community.controller.ts

apps/mp/src/pages/community/detail.vue         # 替换占位
apps/mp/src/pages/community/notifications.vue
apps/mp/src/pages/community/index.vue          # 卡片赞数可点进详情；可选列表点赞
apps/mp/src/pages/home/index.vue              # 铃铛 + unread-count
apps/mp/src/pages.json                        # 注册 notifications 页（若基座未加）

docs/roadmap.md
docs/adr/0016-community-feed.md
docs/adr/README.md
docs/superpowers/specs/2026-11-03-community-feed-design.md
```

---

### Task 1: CommentsService

**Files:**
- Create: `apps/api/src/community/dto/create-comment.dto.ts`
- Create: `apps/api/src/community/comments.service.ts`
- Create: `apps/api/src/community/comments.service.spec.ts`

- [ ] **Step 1: 写失败测例**

必须覆盖：

1. 动态已软删 → 不可评  
2. body 与 image 皆空 → 400  
3. body >100 → 400  
4. `imageUrl` 非 community 路径 → 400  
5. `parentId` 指向二级评论 → 实际挂到其一级祖先  
6. `parentId` 指向其他 post 的评论 → 400  
7. 创建一级：`commentCount++`；创建通知 `comment_post` 给帖主（若 actor≠recipient）  
8. 创建回复：通知 `reply_comment` 给父评论作者（若≠actor）；帖主若不同人**本期只通知父评作者**（规格：回复评论类型；不额外双发帖主，除非父评作者即帖主）  
9. 作者软删评论：`commentCount--`（仅当该评论此前未删）；一级删后列表整枝不可见  
10. `listForPost`：仅未删一级，带未删 `replies` 按 `createdAt` asc  

- [ ] **Step 2: 跑测确认失败**

Run: `pnpm --filter @activity/api test -- src/community/comments.service.spec.ts`

- [ ] **Step 3: 实现**

```ts
// resolveParentId 伪代码
async function resolveRootParentId(
  prisma,
  postId: string,
  parentId: string | undefined,
): Promise<string | null> {
  if (!parentId) return null;
  const parent = await prisma.comment.findFirst({
    where: { id: parentId, postId, deletedAt: null },
  });
  if (!parent) throw new BadRequestException("回复的评论不存在");
  return parent.parentId ?? parent.id;
}
```

通知写入与计数同一事务。展示字段：author nickname/avatarUrl。

- [ ] **Step 4: 测通 Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(api): 社区两级评论与作者软删

EOF
)"
```

---

### Task 2: LikesService

**Files:**
- Create: `apps/api/src/community/dto/like.dto.ts`
- Create: `apps/api/src/community/likes.service.ts`
- Create: `apps/api/src/community/likes.service.spec.ts`

- [ ] **Step 1: 测例**

1. 赞不存在/已删目标 → 404  
2. 首次赞 post：`likeCount++`，写 `like_post` 通知（非本人）  
3. 重复赞：幂等，计数不变，不重复通知  
4. 取消赞：删 Like 行，`likeCount` 下限 0  
5. 未赞取消：成功无副作用  
6. 赞评论：`like_comment` 通知评论作者；`commentId` 写入 Notification  
7. 自赞：计数增加，**无** Notification 行  

- [ ] **Step 2–4: 红→绿→Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(api): 社区动态与评论点赞

EOF
)"
```

---

### Task 3: NotificationsService

**Files:**
- Create: `apps/api/src/community/dto/read-notifications.dto.ts`
- Create: `apps/api/src/community/notifications.service.ts`
- Create: `apps/api/src/community/notifications.service.spec.ts`

- [ ] **Step 1: 测例**

1. `list(recipientId)` 按 `createdAt` desc，含 actor 昵称头像、type、postId、commentId、readAt  
2. `unreadCount`  
3. `markRead({ ids })` 只更新属于该用户的行  
4. `markRead({ all: true })` 将该用户未读全部标记  

- [ ] **Step 2–4: 实现、测通、Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(api): 社区站内通知列表与已读

EOF
)"
```

---

### Task 4: HTTP 路由与 likedByMe

**Files:**
- Modify / Create controllers under `apps/api/src/community/`
- Modify: `apps/api/src/community/posts.service.ts`（及 spec）
- Modify: `apps/api/src/community/community.module.ts`

- [ ] **Step 1: 路由**

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/community/posts/:id/comments` | listForPost |
| POST | `/community/posts/:id/comments` | create |
| DELETE | `/community/comments/:id` | 作者软删 |
| POST | `/community/likes` | body `{ targetType, targetId }` |
| DELETE | `/community/likes` | 同目标（query 或 body，与 POST 对称；**选定 body**） |
| GET | `/community/notifications` | 分页 |
| GET | `/community/notifications/unread-count` | `{ count }` |
| POST | `/community/notifications/read` | `{ ids?: string[]; all?: boolean }` |

均 `UserJwtGuard`。

- [ ] **Step 2: `likedByMe`**

在 `getById` / `list` / `listMine` / 评论列表：对当前用户批量查 `Like`，填布尔。测例至少覆盖 getById 已赞为 true。

- [ ] **Step 3: type-check + api 单测**

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(api): 暴露评论、点赞与通知接口

EOF
)"
```

---

### Task 5: Admin 软删评论

**Files:**
- Modify: `apps/api/src/admin-community/admin-community.service.ts`
- Modify: `apps/api/src/admin-community/admin-community.service.spec.ts`
- Modify: `apps/api/src/admin-community/admin-community.controller.ts`

- [ ] **Step 1: 测例** — `DELETE` 评论写 `deletedBy=admin`、审计 `soft_delete_comment`、递减 `post.commentCount`

- [ ] **Step 2: 路由** `DELETE /admin/community/comments/:id`

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(api): Admin 软删社区评论

EOF
)"
```

---

### Task 6: 小程序详情互动、通知页、首页铃铛

**Files:**
- Modify: `apps/mp/src/pages/community/detail.vue`
- Create: `apps/mp/src/pages/community/notifications.vue`
- Modify: `apps/mp/src/pages/community/index.vue`（可选列表点赞；至少展示 commentCount）
- Modify: `apps/mp/src/pages/home/index.vue`
- Modify: `apps/mp/src/pages.json`（注册 notifications）

- [ ] **Step 1: `detail.vue`**

- 评论列表 + 回复（点回复带 `parentId`，UI 展示挂在一级下）  
- 输入正文/一图；提交评论  
- 动态与评论点赞切换  
- 作者删评；分享保持基座  
- query `commentId`：滚动/高亮对应评论  

- [ ] **Step 2: `notifications.vue`**

列表；点击按 type 跳转 `detail?id=&commentId=`；进入或点击时 `markRead`。

- [ ] **Step 3: 首页铃铛**

导航区域加铃铛；`onShow` 拉 `unread-count` 角标；点击进 notifications。未登录不请求或隐藏。

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(mp): 社区评论点赞与站内通知入口

EOF
)"
```

---

### Task 7: 全量验收与文档收尾

- [ ] **Step 1:** `pnpm --filter @activity/api test` 与 `type-check`

- [ ] **Step 2:** 对照规格 §8 AT-COM-01～12 手测（含通知跳转、自赞无通知、Admin 删评）

- [ ] **Step 3: 文档**

- `docs/roadmap.md` P1-5 全部勾选  
- ADR-0016 → **Implemented**；README 同步  
- 规格状态 → **Implemented**  
- ADR 后果/实现备注补入口路径（community 目录、mp 页面）

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
docs: P1-5 社区动态标记为已实现

EOF
)"
```

---

## 本计划自检

| 规格项 | 任务 |
| --- | --- |
| 两级评论 + 图≤1 + 字≤100 | T1, T4, T6 |
| 点赞幂等 / 自赞无通知 | T2 |
| 四类通知 + 铃铛跳转 | T3, T6 |
| Admin 软删评论 | T5 |
| AT-COM 收尾 / ADR Implemented | T7 |
| 无站内转发 / 无订阅消息 | 不实现即满足 |

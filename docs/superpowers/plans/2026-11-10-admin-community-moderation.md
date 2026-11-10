# Admin 社区动态最小管理页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Admin 落地社区动态「列表关键字 + 软删 + 抽屉管评论」，补齐只读 Admin API，复用既有软删与审计。

**Architecture:** 在 `apps/api/src/admin-community/` 增加 `listPosts` / `getPost` / `listComments`（仅未删）；DTO 复用社区 `mapPost` / 评论映射但省略 `likedByMe`。Admin 前端新增 `/community` 页：`ProTableLite` + `SearchForm` + `el-drawer`，调用新只读接口与既有 `DELETE`。

**Tech Stack:** NestJS + Prisma + Vitest；Vue 3 `<script setup>` + Element Plus + 既有 `useTable` / `ProTableLite`。

**Spec:** [docs/superpowers/specs/2026-11-10-admin-community-moderation-design.md](../specs/2026-11-10-admin-community-moderation-design.md)

---

## File map

| File | Responsibility |
| --- | --- |
| `apps/api/src/admin-community/dto/list-admin-posts.query.ts` | `q` / `page` / `pageSize` 校验 |
| `apps/api/src/admin-community/admin-community.service.ts` | list / get / listComments + 既有 softDelete |
| `apps/api/src/admin-community/admin-community.controller.ts` | GET 路由（注意静态段在 `:id` 前） |
| `apps/api/src/admin-community/admin-community.service.spec.ts` | 只读接口单测 |
| `apps/admin/src/api/admin.ts` | 客户端类型与请求 |
| `apps/admin/src/views/CommunityPosts.vue` | 列表 + 抽屉 |
| `apps/admin/src/router.ts` / `navigation.ts` | 路由与侧栏 |
| 文档：roadmap / 母规格 §6 / ADR-0016 实现备注 | 勾选与说明 |

---

### Task 1: Admin 动态列表 API（TDD）

**Files:**
- Create: `apps/api/src/admin-community/dto/list-admin-posts.query.ts`
- Modify: `apps/api/src/admin-community/admin-community.service.ts`
- Modify: `apps/api/src/admin-community/admin-community.controller.ts`
- Modify: `apps/api/src/admin-community/admin-community.service.spec.ts`

- [ ] **Step 1: 在 spec 末尾追加 listPosts 失败用例（先不实现方法）**

在 `admin-community.service.spec.ts` 的 `describe` 内追加（并扩展 prisma mock：`post.findMany` / `post.count`，以及 `$transaction` 以外的直连调用）：

```ts
describe("listPosts", () => {
  it("无 q 时 where 仅 deletedAt:null，按 createdAt desc 分页", async () => {
    prisma.post.findMany.mockResolvedValue([]);
    prisma.post.count.mockResolvedValue(0);

    const result = await service.listPosts({});

    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        skip: 0,
        take: 20,
      }),
    );
    expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
  });

  it("q 时 OR 匹配 body 与 author.nickname（insensitive）", async () => {
    prisma.post.findMany.mockResolvedValue([]);
    prisma.post.count.mockResolvedValue(0);

    await service.listPosts({ q: "徒步", page: 2, pageSize: 10 });

    const arg = prisma.post.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({
      deletedAt: null,
      OR: [
        { body: { contains: "徒步", mode: "insensitive" } },
        { author: { nickname: { contains: "徒步", mode: "insensitive" } } },
      ],
    });
    expect(arg.skip).toBe(10);
    expect(arg.take).toBe(10);
  });
});
```

在 `beforeEach` 的 prisma 对象上增加：

```ts
post: {
  findUnique: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
  updateMany: vi.fn(),
},
```

- [ ] **Step 2: 跑测确认失败**

Run:

```bash
cd /Users/kkk/Repositories/uni-app-x-repo/apps/api && pnpm exec vitest run src/admin-community/admin-community.service.spec.ts
```

Expected: FAIL（`listPosts` 未定义或断言失败）。

- [ ] **Step 3: 实现 DTO + listPosts + 路由**

`dto/list-admin-posts.query.ts`:

```ts
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class ListAdminPostsQuery {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;
}
```

在 `admin-community.service.ts` 增加（复用社区 mapper / paging）：

```ts
import { POST_INCLUDE, mapPost } from "../community/posts.mapper";
import { normalizePaging } from "../community/posts.service";

function mapAdminPost(row: Parameters<typeof mapPost>[0]) {
  const { likedByMe: _omit, ...rest } = mapPost(row);
  return rest;
}

async listPosts(input: { q?: string; page?: number; pageSize?: number }) {
  const { page, pageSize } = normalizePaging(input);
  const keyword = input.q?.trim() || undefined;
  const where = {
    deletedAt: null as null,
    ...(keyword
      ? {
          OR: [
            { body: { contains: keyword, mode: "insensitive" as const } },
            {
              author: {
                nickname: { contains: keyword, mode: "insensitive" as const },
              },
            },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    this.prisma.post.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: POST_INCLUDE,
    }),
    this.prisma.post.count({ where }),
  ]);
  return {
    items: rows.map((row) => mapAdminPost(row)),
    total,
    page,
    pageSize,
  };
}
```

Controller 增加（放在 `@Delete` 之前亦可；注意 `Get()` 与 `Get('posts/:id')` 顺序：`posts` 列表用 `@Get('posts')`，详情 `@Get('posts/:id')`）：

```ts
@Get("posts")
listPosts(@Query() query: ListAdminPostsQuery) {
  return this.adminCommunityService.listPosts(query);
}
```

并补充 `Get` / `Query` import。

- [ ] **Step 4: 跑测通过**

Run:

```bash
cd /Users/kkk/Repositories/uni-app-x-repo/apps/api && pnpm exec vitest run src/admin-community/admin-community.service.spec.ts
```

Expected: PASS（含既有 softDelete 用例）。

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/admin-community/
git commit -m "$(cat <<'EOF'
feat(api): Admin 社区动态列表接口

支持关键字检索未删动态，供运营后台最小管理页使用。

EOF
)"
```

---

### Task 2: Admin 动态详情 API（TDD）

**Files:**
- Modify: `apps/api/src/admin-community/admin-community.service.ts`
- Modify: `apps/api/src/admin-community/admin-community.controller.ts`
- Modify: `apps/api/src/admin-community/admin-community.service.spec.ts`

- [ ] **Step 1: 写失败用例**

```ts
describe("getPost", () => {
  it("未删动态返回 Admin DTO（无 likedByMe）", async () => {
    const createdAt = new Date("2026-11-01T00:00:00.000Z");
    prisma.post.findUnique.mockResolvedValue({
      id: "p1",
      body: "hello",
      likeCount: 1,
      commentCount: 2,
      deletedAt: null,
      createdAt,
      author: { id: "u1", nickname: "小明", avatarUrl: null },
      images: [],
      activityLinks: [],
    });

    const dto = await service.getPost("p1");

    expect(dto).toMatchObject({
      id: "p1",
      body: "hello",
      author: { id: "u1", nickname: "小明", avatarUrl: null },
      likeCount: 1,
      commentCount: 2,
    });
    expect(dto).not.toHaveProperty("likedByMe");
    expect(prisma.post.findUnique).toHaveBeenCalledWith({
      where: { id: "p1" },
      include: POST_INCLUDE,
    });
  });

  it("不存在 → 404 动态不存在", async () => {
    prisma.post.findUnique.mockResolvedValue(null);
    await expect(service.getPost("nope")).rejects.toThrow(
      new NotFoundException("动态不存在"),
    );
  });

  it("已删 → 404 动态已删除", async () => {
    prisma.post.findUnique.mockResolvedValue({
      id: "p1",
      deletedAt: new Date(),
      body: "",
      likeCount: 0,
      commentCount: 0,
      createdAt: new Date(),
      author: { id: "u1", nickname: null, avatarUrl: null },
      images: [],
      activityLinks: [],
    });
    await expect(service.getPost("p1")).rejects.toThrow(
      new NotFoundException("动态已删除"),
    );
  });
});
```

（spec 内 `import { POST_INCLUDE } from "../community/posts.mapper"`。）

- [ ] **Step 2: 跑测确认失败**

```bash
cd /Users/kkk/Repositories/uni-app-x-repo/apps/api && pnpm exec vitest run src/admin-community/admin-community.service.spec.ts
```

Expected: FAIL（`getPost` 未定义）。

- [ ] **Step 3: 实现 getPost + 路由**

```ts
async getPost(id: string) {
  const row = await this.prisma.post.findUnique({
    where: { id },
    include: POST_INCLUDE,
  });
  if (!row) throw new NotFoundException("动态不存在");
  if (row.deletedAt) throw new NotFoundException("动态已删除");
  return mapAdminPost(row);
}
```

Controller:

```ts
@Get("posts/:id")
getPost(@Param("id") id: string) {
  return this.adminCommunityService.getPost(id);
}
```

- [ ] **Step 4: 跑测通过**

```bash
cd /Users/kkk/Repositories/uni-app-x-repo/apps/api && pnpm exec vitest run src/admin-community/admin-community.service.spec.ts
```

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/admin-community/
git commit -m "$(cat <<'EOF'
feat(api): Admin 社区动态详情接口

抽屉头部展示用；已删或不存在返回 404。

EOF
)"
```

---

### Task 3: Admin 评论列表 API（TDD）

**Files:**
- Modify: `apps/api/src/admin-community/admin-community.service.ts`
- Modify: `apps/api/src/admin-community/admin-community.controller.ts`
- Modify: `apps/api/src/admin-community/admin-community.service.spec.ts`

- [ ] **Step 1: 写失败用例**

扩展 prisma mock：`comment.findMany` / `comment.count`（list 场景直连，不必走 `$transaction`）。

```ts
describe("listComments", () => {
  it("动态不存在 → 404", async () => {
    prisma.post.findUnique.mockResolvedValue(null);
    await expect(service.listComments("nope", {})).rejects.toThrow(
      new NotFoundException("动态不存在"),
    );
  });

  it("动态已删 → 404", async () => {
    prisma.post.findUnique.mockResolvedValue({
      id: "p1",
      deletedAt: new Date(),
    });
    await expect(service.listComments("p1", {})).rejects.toThrow(
      new NotFoundException("动态已删除"),
    );
  });

  it("仅拉取未删一级评论并带齐未删二级，DTO 无 likedByMe", async () => {
    prisma.post.findUnique.mockResolvedValue({ id: "p1", deletedAt: null });
    const createdAt = new Date("2026-11-02T00:00:00.000Z");
    prisma.comment.findMany.mockResolvedValue([
      {
        id: "c1",
        postId: "p1",
        parentId: null,
        body: "根评",
        imageUrl: null,
        likeCount: 0,
        createdAt,
        author: { id: "u1", nickname: "甲", avatarUrl: null },
        replyToAuthor: null,
        replies: [
          {
            id: "c2",
            postId: "p1",
            parentId: "c1",
            body: "回复",
            imageUrl: null,
            likeCount: 0,
            createdAt,
            author: { id: "u2", nickname: "乙", avatarUrl: null },
            replyToAuthor: {
              id: "u1",
              nickname: "甲",
              avatarUrl: null,
            },
          },
        ],
      },
    ]);
    prisma.comment.count.mockResolvedValue(1);

    const result = await service.listComments("p1", { page: 1, pageSize: 20 });

    expect(prisma.comment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { postId: "p1", parentId: null, deletedAt: null },
      }),
    );
    expect(result.total).toBe(1);
    expect(result.items[0]).not.toHaveProperty("likedByMe");
    expect(result.items[0].replies[0]).not.toHaveProperty("likedByMe");
    expect(result.items[0].replies[0].body).toBe("回复");
  });
});
```

- [ ] **Step 2: 跑测确认失败**

```bash
cd /Users/kkk/Repositories/uni-app-x-repo/apps/api && pnpm exec vitest run src/admin-community/admin-community.service.spec.ts
```

Expected: FAIL。

- [ ] **Step 3: 实现 listComments**

复用 `mapComment` 后剥掉 `likedByMe`（与 `comments.service` 查询形状对齐）：

```ts
import { mapComment } from "../community/comments.service";

// AUTHOR_SELECT / COMMENT_INCLUDE 可在本文件内复制 comments.service 的常量，
// 或从 comments.service 导出 COMMENT_INCLUDE；优先复制小常量避免大范围重构。

async listComments(
  postId: string,
  input: { page?: number; pageSize?: number },
) {
  const post = await this.prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, deletedAt: true },
  });
  if (!post) throw new NotFoundException("动态不存在");
  if (post.deletedAt) throw new NotFoundException("动态已删除");

  const { page, pageSize } = normalizePaging(input);
  const where = { postId, parentId: null, deletedAt: null };
  const [rows, total] = await Promise.all([
    this.prisma.comment.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        author: { select: { id: true, nickname: true, avatarUrl: true } },
        replyToAuthor: {
          select: { id: true, nickname: true, avatarUrl: true },
        },
        replies: {
          where: { deletedAt: null },
          orderBy: { createdAt: "asc" },
          include: {
            author: { select: { id: true, nickname: true, avatarUrl: true } },
            replyToAuthor: {
              select: { id: true, nickname: true, avatarUrl: true },
            },
          },
        },
      },
    }),
    this.prisma.comment.count({ where }),
  ]);

  const items = rows.map((row) => {
    const rootMapped = mapComment(row);
    const { likedByMe: _a, ...root } = rootMapped;
    return {
      ...root,
      replies: row.replies.map((r) => {
        const mapped = mapComment(r, { replyToFallback: root.author });
        const { likedByMe: _b, ...rest } = mapped;
        return rest;
      }),
    };
  });

  return { items, total, page, pageSize };
}
```

Controller（**必须写在** `@Get('posts/:id')` **之前**，否则 `comments` 被当成 id；Nest 按声明顺序匹配，更稳妥的做法是用完整路径 `posts/:postId/comments`）：

```ts
@Get("posts/:postId/comments")
listComments(
  @Param("postId") postId: string,
  @Query() query: ListAdminPostsQuery, // 或单独 PagingQuery；仅用 page/pageSize
) {
  return this.adminCommunityService.listComments(postId, query);
}
```

路由声明顺序建议：

1. `GET posts`
2. `GET posts/:postId/comments`
3. `GET posts/:id`
4. `DELETE posts/:id`
5. `DELETE comments/:id`

- [ ] **Step 4: 跑测通过 + 类型检查**

```bash
cd /Users/kkk/Repositories/uni-app-x-repo/apps/api && pnpm exec vitest run src/admin-community/admin-community.service.spec.ts && pnpm type-check
```

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/admin-community/
git commit -m "$(cat <<'EOF'
feat(api): Admin 社区评论列表接口

抽屉内展示未删两级评论，不含 likedByMe。

EOF
)"
```

---

### Task 4: Admin API 客户端

**Files:**
- Modify: `apps/admin/src/api/admin.ts`

- [ ] **Step 1: 追加类型与函数**

```ts
export type AdminCommunityPost = {
  id: string;
  body: string;
  author: { id: string; nickname: string; avatarUrl: string | null };
  images: { url: string; sortOrder: number }[];
  activities: { id: string; title: string }[];
  likeCount: number;
  commentCount: number;
  createdAt: string;
};

export type AdminCommunityComment = {
  id: string;
  postId: string;
  parentId: string | null;
  body: string;
  imageUrl: string | null;
  author: { id: string; nickname: string; avatarUrl: string | null };
  replyTo: { id: string; nickname: string; avatarUrl: string | null } | null;
  likeCount: number;
  createdAt: string;
  replies: AdminCommunityComment[];
};

export type ListAdminCommunityPostsParams = {
  q?: string;
  page?: number;
  pageSize?: number;
};

export function listAdminCommunityPosts(
  params: ListAdminCommunityPostsParams = {},
) {
  const q = new URLSearchParams();
  if (params.q) q.set("q", params.q);
  if (params.page) q.set("page", String(params.page));
  if (params.pageSize) q.set("pageSize", String(params.pageSize));
  const qs = q.toString();
  return apiRequest<{
    items: AdminCommunityPost[];
    total: number;
    page: number;
    pageSize: number;
  }>(`/admin/community/posts${qs ? `?${qs}` : ""}`);
}

export function getAdminCommunityPost(id: string) {
  return apiRequest<AdminCommunityPost>(
    `/admin/community/posts/${encodeURIComponent(id)}`,
  );
}

export function listAdminCommunityComments(
  postId: string,
  params: { page?: number; pageSize?: number } = {},
) {
  const q = new URLSearchParams();
  if (params.page) q.set("page", String(params.page));
  if (params.pageSize) q.set("pageSize", String(params.pageSize));
  const qs = q.toString();
  return apiRequest<{
    items: AdminCommunityComment[];
    total: number;
    page: number;
    pageSize: number;
  }>(
    `/admin/community/posts/${encodeURIComponent(postId)}/comments${
      qs ? `?${qs}` : ""
    }`,
  );
}

export function softDeleteAdminCommunityPost(id: string) {
  return apiRequest<void>(
    `/admin/community/posts/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

export function softDeleteAdminCommunityComment(id: string) {
  return apiRequest<void>(
    `/admin/community/comments/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/api/admin.ts
git commit -m "$(cat <<'EOF'
feat(admin): 社区动态管理 API 客户端

封装列表、详情、评论与软删请求。

EOF
)"
```

---

### Task 5: 路由与侧栏入口

**Files:**
- Modify: `apps/admin/src/router.ts`
- Modify: `apps/admin/src/navigation.ts`

- [ ] **Step 1: 注册路由**

在 `router.ts` children 中、`activities` 与 `audit-logs` 之间插入：

```ts
{
  path: "community",
  name: "community",
  component: () => import("./views/CommunityPosts.vue"),
  meta: { title: "社区动态" },
},
```

- [ ] **Step 2: 侧栏**

`navigation.ts`：

```ts
import { Calendar, ChatDotRound, Document, User } from "@element-plus/icons-vue";

export const navItems: NavItem[] = [
  { path: "/users", title: "用户发布权", icon: User },
  { path: "/activities", title: "活动列表", icon: Calendar },
  { path: "/community", title: "社区动态", icon: ChatDotRound },
  {
    path: "/audit-logs",
    title: "审计日志",
    icon: Document,
    capability: Capability.AuditRead,
  },
];
```

- [ ] **Step 3: 先放空壳页面以便路由可解析（下一步填满）**

Create `apps/admin/src/views/CommunityPosts.vue`：

```vue
<script setup lang="ts">
import PageHeader from "../components/PageHeader.vue";
</script>

<template>
  <div>
    <PageHeader title="社区动态" description="加载中…" />
  </div>
</template>
```

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/router.ts apps/admin/src/navigation.ts apps/admin/src/views/CommunityPosts.vue
git commit -m "$(cat <<'EOF'
feat(admin): 注册社区动态侧栏与路由

为最小管理页挂载入口。

EOF
)"
```

---

### Task 6: 列表页 + 软删动态

**Files:**
- Modify: `apps/admin/src/views/CommunityPosts.vue`

- [ ] **Step 1: 实现列表与删除（抽屉可先留空壳状态）**

完整替换为（抽屉在 Task 7 补全；此处先实现列表核心）：

对齐 `AuditLogs.vue` / `Users.vue` 模式：

- `applied` 保存已应用的 `q`
- `useTable` → `listAdminCommunityPosts({ q: applied.q, page })`
- `SearchForm` 单输入
- 列：作者（`UserIdentity`）、正文摘要、图数、活动数、赞/评、时间、操作
- `删除`：`ElMessageBox.confirm` → `softDeleteAdminCommunityPost` → `refresh`
- `评论` 按钮：设置 `drawerPostId` 并 `drawerVisible = true`（Task 7 消费）

正文摘要辅助：

```ts
function bodyPreview(body: string) {
  const t = body.trim();
  if (!t) return "（仅图片）";
  return t.length > 80 ? `${t.slice(0, 80)}…` : t;
}
```

删除：

```ts
async function onDeletePost(row: AdminCommunityPost) {
  try {
    await ElMessageBox.confirm(
      `确认软删动态「${bodyPreview(row.body)}」？此操作不可在后台恢复。`,
      "删除动态",
      { type: "warning", confirmButtonText: "删除", cancelButtonText: "取消" },
    );
    busyId.value = row.id;
    await softDeleteAdminCommunityPost(row.id);
    ElMessage.success("已删除");
    if (drawerPostId.value === row.id) {
      drawerVisible.value = false;
      drawerPostId.value = null;
    }
    refresh();
  } catch (e) {
    if (e === "cancel" || e === "close") return;
    if (e instanceof ApiError && e.status === 401) {
      await router.replace("/login");
      return;
    }
    ElMessage.error(e instanceof ApiError ? e.message : "删除失败");
  } finally {
    busyId.value = null;
  }
}
```

- [ ] **Step 2: 本地目视**（API + Admin 已起时）打开 `/community`，无数据时 empty；有数据可搜可删。

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/views/CommunityPosts.vue
git commit -m "$(cat <<'EOF'
feat(admin): 社区动态列表与软删

关键字检索未删动态，确认后软删并刷新列表。

EOF
)"
```

---

### Task 7: 评论抽屉

**Files:**
- Modify: `apps/admin/src/views/CommunityPosts.vue`

- [ ] **Step 1: 实现抽屉数据流**

状态：

```ts
const drawerVisible = ref(false);
const drawerPostId = ref<string | null>(null);
const drawerPost = ref<AdminCommunityPost | null>(null);
const drawerComments = ref<AdminCommunityComment[]>([]);
const drawerLoading = ref(false);
const busyCommentId = ref<string | null>(null);

async function openDrawer(row: AdminCommunityPost) {
  drawerPostId.value = row.id;
  drawerVisible.value = true;
  await loadDrawer(row.id);
}

async function loadDrawer(postId: string) {
  drawerLoading.value = true;
  try {
    const [post, comments] = await Promise.all([
      getAdminCommunityPost(postId),
      listAdminCommunityComments(postId, { page: 1, pageSize: 50 }),
    ]);
    drawerPost.value = post;
    drawerComments.value = comments.items;
    const row = rows.value.find((r) => r.id === postId);
    if (row) row.commentCount = post.commentCount;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      await router.replace("/login");
      return;
    }
    if (e instanceof ApiError && e.status === 404) {
      ElMessage.warning("动态不存在或已删除");
      drawerVisible.value = false;
      drawerPostId.value = null;
      refresh();
      return;
    }
    ElMessage.error(e instanceof ApiError ? e.message : "加载失败");
  } finally {
    drawerLoading.value = false;
  }
}
```

模板要点：

- `el-drawer` `size="480px"`，`v-model="drawerVisible"`
- 头部展示 `drawerPost` 全文、`el-image` 缩略图（`preview-src-list`）、活动标题、`删除动态`
- 评论：`v-for` 一级；二级 `padding-left`；每条 `删除`
- 删评论：`confirm` → `softDeleteAdminCommunityComment` → `loadDrawer(postId)`（用返回的 `post.commentCount` 同步列表行）

```ts
async function onDeleteComment(comment: AdminCommunityComment) {
  const postId = drawerPostId.value;
  if (!postId) return;
  try {
    await ElMessageBox.confirm("确认软删该评论？", "删除评论", {
      type: "warning",
      confirmButtonText: "删除",
      cancelButtonText: "取消",
    });
    busyCommentId.value = comment.id;
    await softDeleteAdminCommunityComment(comment.id);
    ElMessage.success("已删除");
    await loadDrawer(postId);
  } catch (e) {
    if (e === "cancel" || e === "close") return;
    if (e instanceof ApiError && e.status === 401) {
      await router.replace("/login");
      return;
    }
    ElMessage.error(e instanceof ApiError ? e.message : "删除失败");
  } finally {
    busyCommentId.value = null;
  }
}
```

样式：复用现有 `--text-*` 变量；二级评论 `.reply { padding-left: 28px; }`；正文 `white-space: pre-wrap`。

- [ ] **Step 2: 手工验收 AT-COM-ADMIN-01～03**（有测试栈时）

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/views/CommunityPosts.vue
git commit -m "$(cat <<'EOF'
feat(admin): 社区动态评论抽屉

支持查看两级评论并软删，同步 commentCount。

EOF
)"
```

---

### Task 8: 文档回写

**Files:**
- Modify: `docs/superpowers/specs/2026-11-03-community-feed-design.md`（§6）
- Modify: `docs/roadmap.md`（P1-5）
- Modify: `docs/adr/0016-community-feed.md`（实现备注）
- Modify: `docs/superpowers/specs/2026-11-10-admin-community-moderation-design.md`（状态 → Implemented）

- [ ] **Step 1: 更新母规格 §6**

将：

```md
本期：软删 API + 审计。最小管理页（列表关键字 + 删除）可选实现；不阻塞 mp 闭环。不做社区内容审核队列（举报后置）。
```

改为：

```md
本期：软删 API + 审计。最小管理页已落地（列表关键字 + 软删动态；抽屉查看/软删评论），见 [2026-11-10-admin-community-moderation-design.md](./2026-11-10-admin-community-moderation-design.md)。不做社区内容审核队列（举报后置）。
```

- [ ] **Step 2: roadmap P1-5 增加勾选**

```md
- [x] Admin 社区最小管理页（列表关键字 + 软删 + 评论抽屉）
```

- [ ] **Step 3: ADR-0016 实现备注追加一句**

```md
- Admin UI：`apps/admin`「社区动态」最小管理页已落地（只读列表/详情/评论 + 既有软删）；规格见 2026-11-10-admin-community-moderation-design.md。
```

- [ ] **Step 4: 设计规格状态改为 Implemented**

- [ ] **Step 5: Commit**

```bash
git add docs/
git commit -m "$(cat <<'EOF'
docs: 回写 Admin 社区最小管理页已落地

更新母规格 §6、roadmap P1-5 与 ADR-0016 实现备注。

EOF
)"
```

---

## Spec coverage checklist

| Spec 项 | Task |
| --- | --- |
| `GET /admin/community/posts` + `q` | Task 1 |
| `GET /admin/community/posts/:id` | Task 2 |
| `GET .../comments` 无 likedByMe | Task 3 |
| 既有 DELETE 复用 | Task 4/6/7 |
| Admin 客户端 | Task 4 |
| 路由/侧栏 | Task 5 |
| 列表 + 关键字 + 软删动态 | Task 6 |
| 抽屉管评论 | Task 7 |
| 文档回写 | Task 8 |
| 审核队列 / 恢复 | 明确不做 |

---

## Self-review notes

- 无 TBD；`listComments` 路由顺序已写明防冲突。
- `mapAdminPost` / 剥 `likedByMe` 在 Task 1 与 Task 3 一致。
- 分页复用 `normalizePaging`（默认 20）。

<script setup lang="ts">
import { Refresh } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { reactive, ref } from "vue";
import { useRouter } from "vue-router";
import {
  getAdminCommunityPost,
  listAdminCommunityComments,
  listAdminCommunityPosts,
  softDeleteAdminCommunityComment,
  softDeleteAdminCommunityPost,
  type AdminCommunityComment,
  type AdminCommunityPost,
} from "../api/admin";
import { ApiError } from "../api/http";
import PageHeader from "../components/PageHeader.vue";
import ProTableLite from "../components/ProTableLite.vue";
import SearchForm from "../components/SearchForm.vue";
import UserIdentity from "../components/UserIdentity.vue";
import { useTable } from "../composables/useTable";
import { handleListError } from "../utils/errors";
import { displayName, formatDateTime } from "../utils/format";

const router = useRouter();
const busyId = ref<string | null>(null);

/** 评论抽屉状态 */
const drawerVisible = ref(false);
const drawerPostId = ref<string | null>(null);
const drawerPost = ref<AdminCommunityPost | null>(null);
const drawerComments = ref<AdminCommunityComment[]>([]);
const drawerLoading = ref(false);
const busyCommentId = ref<string | null>(null);

/** 表单态：用户正在编辑的关键字 */
const form = reactive({ q: "" });

/** 已应用态：真正参与请求的条件（点「查询」后同步） */
const applied = ref({ q: "" });

const { rows, loading, page, pageSize, total, load, goPage, refresh } =
  useTable<AdminCommunityPost>({
    fetch: ({ page: targetPage }) =>
      listAdminCommunityPosts({ q: applied.value.q, page: targetPage }),
    onError: (error) => handleListError(error, router, "加载失败"),
  });

function search(): void {
  applied.value = { q: form.q.trim() };
  void load(1);
}

function reset(): void {
  form.q = "";
  search();
}

function bodyPreview(body: string) {
  const t = body.trim();
  if (!t) return "（仅图片）";
  return t.length > 80 ? `${t.slice(0, 80)}…` : t;
}

async function openDrawer(row: AdminCommunityPost) {
  drawerPostId.value = row.id;
  drawerPost.value = null;
  drawerComments.value = [];
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
    if (e instanceof ApiError && e.status === 404) {
      ElMessage.warning("已删除或不存在");
      await loadDrawer(postId);
      return;
    }
    ElMessage.error(e instanceof ApiError ? e.message : "删除失败");
  } finally {
    busyCommentId.value = null;
  }
}

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
    if (e instanceof ApiError && e.status === 404) {
      ElMessage.warning("已删除或不存在");
      if (drawerPostId.value === row.id) {
        drawerVisible.value = false;
        drawerPostId.value = null;
      }
      refresh();
      return;
    }
    ElMessage.error(e instanceof ApiError ? e.message : "删除失败");
  } finally {
    busyId.value = null;
  }
}
</script>

<template>
  <div>
    <PageHeader
      title="社区动态"
      description="按关键字检索未删除的社区动态，可软删违规内容；点「评论」在抽屉中查看与处理评论。"
    >
      <template #actions>
        <el-button :icon="Refresh" :loading="loading" @click="refresh">刷新</el-button>
      </template>
    </PageHeader>

    <ProTableLite
      :data="rows"
      :loading="loading"
      row-key="id"
      empty-text="暂无动态"
      paged
      :page="page"
      :page-size="pageSize"
      :total="total"
      @page-change="goPage"
    >
      <template #toolbar>
        <SearchForm :loading="loading" @search="search" @reset="reset">
          <el-input
            v-model="form.q"
            clearable
            placeholder="正文 / 作者昵称"
            class="filters__input"
            @keyup.enter="search"
          />
        </SearchForm>
      </template>

      <el-table-column label="作者" min-width="240">
        <template #default="{ row }">
          <UserIdentity :name="displayName(row.author.nickname)" :sub="row.author.id" />
        </template>
      </el-table-column>
      <el-table-column label="正文摘要" min-width="280">
        <template #default="{ row }">
          <el-tooltip
            v-if="row.body.trim()"
            :content="row.body"
            placement="top"
            :show-after="200"
          >
            <span class="cell-ellipsis">{{ bodyPreview(row.body) }}</span>
          </el-tooltip>
          <span v-else class="text-muted">{{ bodyPreview(row.body) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="图数" width="72" align="right">
        <template #default="{ row }">{{ row.images.length }}</template>
      </el-table-column>
      <el-table-column label="活动数" width="80" align="right">
        <template #default="{ row }">{{ row.activities.length }}</template>
      </el-table-column>
      <el-table-column label="赞" prop="likeCount" width="72" align="right" />
      <el-table-column label="评" prop="commentCount" width="72" align="right" />
      <el-table-column label="时间" min-width="170">
        <template #default="{ row }">
          <span class="text-secondary">{{ formatDateTime(row.createdAt) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="140" align="right" fixed="right">
        <template #default="{ row }">
          <el-button type="primary" link @click="openDrawer(row)">评论</el-button>
          <el-button
            type="danger"
            link
            :loading="busyId === row.id"
            @click="onDeletePost(row)"
          >
            删除
          </el-button>
        </template>
      </el-table-column>
    </ProTableLite>

    <el-drawer v-model="drawerVisible" title="动态与评论" size="480px" destroy-on-close>
      <div v-loading="drawerLoading" class="drawer-body">
        <template v-if="drawerPost">
          <section class="post">
            <UserIdentity
              :name="displayName(drawerPost.author.nickname)"
              :sub="formatDateTime(drawerPost.createdAt)"
            />
            <p v-if="drawerPost.body.trim()" class="post__body">{{ drawerPost.body }}</p>
            <div v-if="drawerPost.images.length" class="post__images">
              <el-image
                v-for="(img, idx) in drawerPost.images"
                :key="img.url"
                :src="img.url"
                :preview-src-list="drawerPost.images.map((i) => i.url)"
                :initial-index="idx"
                fit="cover"
                preview-teleported
                class="post__image"
              />
            </div>
            <div v-if="drawerPost.activities.length" class="post__activities">
              <el-tag v-for="a in drawerPost.activities" :key="a.id" size="small" effect="plain">
                {{ a.title }}
              </el-tag>
            </div>
            <div class="post__footer">
              <span class="text-secondary">
                赞 {{ drawerPost.likeCount }} · 评论 {{ drawerPost.commentCount }}
              </span>
              <el-button
                type="danger"
                size="small"
                :loading="busyId === drawerPost.id"
                @click="onDeletePost(drawerPost)"
              >
                删除动态
              </el-button>
            </div>
          </section>

          <section class="comments">
            <h4 class="comments__title">评论（{{ drawerPost.commentCount }}）</h4>
            <el-empty v-if="!drawerComments.length" description="暂无评论" :image-size="64" />
            <div v-for="c in drawerComments" :key="c.id" class="comment-group">
              <div class="comment">
                <div class="comment__head">
                  <UserIdentity
                    :name="displayName(c.author.nickname)"
                    :sub="formatDateTime(c.createdAt)"
                    :size="28"
                  />
                  <el-button
                    type="danger"
                    link
                    size="small"
                    :loading="busyCommentId === c.id"
                    @click="onDeleteComment(c)"
                  >
                    删除
                  </el-button>
                </div>
                <p v-if="c.body.trim()" class="comment__body">{{ c.body }}</p>
                <el-image
                  v-if="c.imageUrl"
                  :src="c.imageUrl"
                  :preview-src-list="[c.imageUrl]"
                  fit="cover"
                  preview-teleported
                  class="comment__image"
                />
              </div>
              <div v-for="r in c.replies" :key="r.id" class="comment reply">
                <div class="comment__head">
                  <UserIdentity
                    :name="displayName(r.author.nickname)"
                    :sub="formatDateTime(r.createdAt)"
                    :size="24"
                  />
                  <el-button
                    type="danger"
                    link
                    size="small"
                    :loading="busyCommentId === r.id"
                    @click="onDeleteComment(r)"
                  >
                    删除
                  </el-button>
                </div>
                <p v-if="r.body.trim() || r.replyTo" class="comment__body">
                  <span v-if="r.replyTo" class="text-secondary">
                    回复 @{{ displayName(r.replyTo.nickname) }}：
                  </span>{{ r.body }}
                </p>
                <el-image
                  v-if="r.imageUrl"
                  :src="r.imageUrl"
                  :preview-src-list="[r.imageUrl]"
                  fit="cover"
                  preview-teleported
                  class="comment__image"
                />
              </div>
            </div>
          </section>
        </template>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.filters__input {
  width: 260px;
}

.cell-ellipsis {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}

.drawer-body {
  min-height: 160px;
}

.post {
  padding-bottom: 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.post__body,
.comment__body {
  margin: 10px 0 0;
  color: var(--text-primary);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.post__images {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.post__image {
  width: 88px;
  height: 88px;
  border-radius: 6px;
}

.post__activities {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}

.post__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
  font-size: 13px;
}

.comments__title {
  margin: 16px 0 8px;
  color: var(--text-primary);
  font-size: 14px;
}

.comment-group {
  padding: 10px 0;
  border-bottom: 1px solid var(--el-border-color-extra-light);
}

.comment__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.comment__body {
  margin-top: 6px;
  font-size: 13px;
}

.comment__image {
  width: 96px;
  height: 96px;
  margin-top: 8px;
  border-radius: 6px;
}

.reply {
  margin-top: 10px;
  padding-left: 28px;
}

@media (max-width: 900px) {
  .filters__input {
    width: 100%;
  }
}
</style>

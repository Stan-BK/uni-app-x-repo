<script setup lang="ts">
import { Refresh } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { reactive, ref } from "vue";
import { useRouter } from "vue-router";
import {
  listAdminCommunityPosts,
  softDeleteAdminCommunityPost,
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

/** 评论抽屉状态（内容由 Task 7 实现） */
const drawerVisible = ref(false);
const drawerPostId = ref<string | null>(null);

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

function openDrawer(row: AdminCommunityPost): void {
  drawerPostId.value = row.id;
  drawerVisible.value = true;
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

    <!-- Task 7：评论抽屉内容 -->
    <el-drawer v-model="drawerVisible" title="评论" size="520px" destroy-on-close />
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

@media (max-width: 900px) {
  .filters__input {
    width: 100%;
  }
}
</style>

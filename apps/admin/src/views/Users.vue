<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  freezePublish,
  listUsers,
  unfreezePublish,
  type AdminUserRow,
} from "../api/admin";
import { ApiError, setAdminToken } from "../api/http";

const router = useRouter();
const rows = ref<AdminUserRow[]>([]);
const loading = ref(false);
const busyId = ref<string | null>(null);
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);

async function load(nextPage = page.value) {
  loading.value = true;
  try {
    const result = await listUsers(nextPage);
    rows.value = result.items;
    page.value = result.page;
    pageSize.value = result.pageSize;
    total.value = result.total;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      await router.replace("/login");
      return;
    }
    ElMessage.error(e instanceof ApiError ? e.message : "加载失败");
  } finally {
    loading.value = false;
  }
}

function displayName(row: AdminUserRow) {
  return row.nickname || "用户";
}

async function promptReason(title: string, confirmButtonText: string) {
  const { value } = await ElMessageBox.prompt("请输入原因", title, {
    confirmButtonText,
    cancelButtonText: "取消",
    inputPattern: /\S+/,
    inputErrorMessage: "原因不能为空",
  });
  return value.trim();
}

async function onFreeze(row: AdminUserRow) {
  try {
    const reason = await promptReason("冻结发布权", "冻结");
    busyId.value = row.id;
    await freezePublish(row.id, reason);
    ElMessage.success("已冻结发布权");
    await load();
  } catch (e) {
    if (e === "cancel" || e === "close") return;
    ElMessage.error(e instanceof ApiError ? e.message : "冻结失败");
  } finally {
    busyId.value = null;
  }
}

async function onUnfreeze(row: AdminUserRow) {
  try {
    const reason = await promptReason("恢复发布权", "恢复");
    busyId.value = row.id;
    await unfreezePublish(row.id, reason);
    ElMessage.success("已恢复发布权");
    await load();
  } catch (e) {
    if (e === "cancel" || e === "close") return;
    ElMessage.error(e instanceof ApiError ? e.message : "恢复失败");
  } finally {
    busyId.value = null;
  }
}

function logout() {
  setAdminToken(null);
  void router.replace("/login");
}

function onPageChange(next: number) {
  void load(next);
}

onMounted(() => {
  void load(1);
});
</script>

<template>
  <div class="page">
    <div class="bar">
      <h1>用户发布权</h1>
      <el-space>
        <router-link class="nav-link" to="/activities">活动列表</router-link>
        <el-button :loading="loading" @click="load()">刷新</el-button>
        <el-button @click="logout">退出</el-button>
      </el-space>
    </div>

    <el-table
      v-loading="loading"
      class="table"
      :data="rows"
      stripe
      empty-text="暂无用户"
    >
      <el-table-column label="昵称" min-width="160">
        <template #default="{ row }">
          {{ displayName(row) }}
        </template>
      </el-table-column>
      <el-table-column label="发布权" width="120">
        <template #default="{ row }">
          <el-tag :type="row.canPublish ? 'success' : 'info'" size="small">
            {{ row.canPublish ? "可发布" : "已冻结" }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="注册时间" min-width="180">
        <template #default="{ row }">
          {{ new Date(row.createdAt).toLocaleString() }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button
            v-if="row.canPublish"
            type="danger"
            link
            :loading="busyId === row.id"
            @click="onFreeze(row)"
          >
            冻结
          </el-button>
          <el-button
            v-else
            type="primary"
            link
            :loading="busyId === row.id"
            @click="onUnfreeze(row)"
          >
            恢复
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      class="pager"
      background
      layout="prev, pager, next, total"
      :current-page="page"
      :page-size="pageSize"
      :total="total"
      @current-change="onPageChange"
    />
  </div>
</template>

<style scoped>
.page {
  max-width: 1100px;
  margin: 0 auto;
  padding: 24px;
}
.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.bar h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}
.nav-link {
  color: var(--el-color-primary);
  text-decoration: none;
  font-size: 14px;
}
.nav-link:hover {
  text-decoration: underline;
}
.table {
  width: 100%;
}
.pager {
  margin-top: 16px;
  justify-content: flex-end;
}
</style>

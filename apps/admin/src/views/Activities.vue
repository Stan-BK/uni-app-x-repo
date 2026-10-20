<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  listActivities,
  removeActivity,
  type ActivityRow,
} from "../api/admin";
import { ApiError, setAdminToken } from "../api/http";

const router = useRouter();
const rows = ref<ActivityRow[]>([]);
const loading = ref(false);
const busyId = ref<string | null>(null);
/** empty string = all */
const lifecycleFilter = ref("published");

async function load() {
  loading.value = true;
  try {
    rows.value = await listActivities(
      lifecycleFilter.value || undefined,
    );
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

async function onRemove(row: ActivityRow) {
  try {
    const { value } = await ElMessageBox.prompt("请输入下架原因", "下架活动", {
      confirmButtonText: "下架",
      cancelButtonText: "取消",
      inputPattern: /\S+/,
      inputErrorMessage: "原因不能为空",
    });
    busyId.value = row.id;
    await removeActivity(row.id, value.trim());
    ElMessage.success("已下架");
    await load();
  } catch (e) {
    if (e === "cancel" || e === "close") return;
    ElMessage.error(e instanceof ApiError ? e.message : "下架失败");
  } finally {
    busyId.value = null;
  }
}

function logout() {
  setAdminToken(null);
  void router.replace("/login");
}

function formatFee(row: ActivityRow) {
  if (row.feeType === "free") return "免费";
  return `¥${(row.feeCents / 100).toFixed(2)}`;
}

watch(lifecycleFilter, () => {
  void load();
});

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="page">
    <div class="bar">
      <h1>活动列表</h1>
      <el-space>
        <router-link class="nav-link" to="/users">用户发布权</router-link>
        <el-select
          v-model="lifecycleFilter"
          placeholder="生命周期"
          style="width: 140px"
        >
          <el-option label="全部" value="" />
          <el-option label="已发布" value="published" />
          <el-option label="草稿" value="draft" />
          <el-option label="已下架" value="removed" />
          <el-option label="已取消" value="cancelled" />
        </el-select>
        <el-button :loading="loading" @click="load">刷新</el-button>
        <el-button @click="logout">退出</el-button>
      </el-space>
    </div>

    <el-table
      v-loading="loading"
      class="table"
      :data="rows"
      stripe
      empty-text="暂无活动"
    >
      <el-table-column prop="title" label="标题" min-width="160" />
      <el-table-column label="主办" min-width="120">
        <template #default="{ row }">
          {{ row.owner?.nickname || "用户" }}
        </template>
      </el-table-column>
      <el-table-column prop="lifecycle" label="状态" width="100" />
      <el-table-column label="费用" width="100">
        <template #default="{ row }">
          {{ formatFee(row) }}
        </template>
      </el-table-column>
      <el-table-column label="开始时间" min-width="160">
        <template #default="{ row }">
          {{ row.startAt ? new Date(row.startAt).toLocaleString() : "—" }}
        </template>
      </el-table-column>
      <el-table-column label="下架原因" min-width="140">
        <template #default="{ row }">
          {{ row.removeReason || "—" }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button
            v-if="row.lifecycle === 'published'"
            type="danger"
            link
            :loading="busyId === row.id"
            @click="onRemove(row)"
          >
            下架
          </el-button>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
    </el-table>
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
.muted {
  color: var(--el-text-color-placeholder);
}
</style>

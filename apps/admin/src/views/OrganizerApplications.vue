<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  approveOrganizer,
  listOrganizers,
  rejectOrganizer,
  type OrganizerRow,
} from "../api/admin";
import { ApiError, setAdminToken } from "../api/http";

const router = useRouter();
const rows = ref<OrganizerRow[]>([]);
const loading = ref(false);
const busyId = ref<string | null>(null);

async function load() {
  loading.value = true;
  try {
    rows.value = await listOrganizers("pending");
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

async function onApprove(row: OrganizerRow) {
  busyId.value = row.id;
  try {
    await approveOrganizer(row.id, "ok");
    ElMessage.success("已通过");
    await load();
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : "通过失败");
  } finally {
    busyId.value = null;
  }
}

async function onReject(row: OrganizerRow) {
  try {
    const { value } = await ElMessageBox.prompt("请输入驳回原因", "驳回申请", {
      confirmButtonText: "驳回",
      cancelButtonText: "取消",
      inputPattern: /\S+/,
      inputErrorMessage: "原因不能为空",
      inputValue: "资料不全",
    });
    busyId.value = row.id;
    await rejectOrganizer(row.id, value.trim());
    ElMessage.success("已驳回");
    await load();
  } catch (e) {
    if (e === "cancel" || e === "close") return;
    ElMessage.error(e instanceof ApiError ? e.message : "驳回失败");
  } finally {
    busyId.value = null;
  }
}

function logout() {
  setAdminToken(null);
  void router.replace("/login");
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="page">
    <div class="bar">
      <h1>组织者申请审核</h1>
      <el-space>
        <router-link class="nav-link" to="/activities">活动列表</router-link>
        <el-button :loading="loading" @click="load">刷新</el-button>
        <el-button @click="logout">退出</el-button>
      </el-space>
    </div>

    <el-table
      v-loading="loading"
      class="table"
      :data="rows"
      stripe
      empty-text="暂无待审核申请"
    >
      <el-table-column prop="name" label="名称" min-width="140" />
      <el-table-column prop="type" label="类型" width="100" />
      <el-table-column prop="applyReason" label="申请说明" min-width="200">
        <template #default="{ row }">
          {{ row.applyReason || "—" }}
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="申请时间" min-width="180">
        <template #default="{ row }">
          {{ new Date(row.createdAt).toLocaleString() }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button
            type="primary"
            link
            :loading="busyId === row.id"
            @click="onApprove(row)"
          >
            通过
          </el-button>
          <el-button
            type="danger"
            link
            :loading="busyId === row.id"
            @click="onReject(row)"
          >
            驳回
          </el-button>
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
</style>

<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import {
  AuditAction,
  AuditTargetType,
  auditActionLabel,
} from "@activity/shared";
import { listAuditLogs, type AuditLogRow } from "../api/admin";
import { ApiError, setAdminToken } from "../api/http";

const router = useRouter();
const rows = ref<AuditLogRow[]>([]);
const loading = ref(false);
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);
const action = ref("");
const targetType = ref("");
const targetId = ref("");
const range = ref<[Date, Date] | undefined>(undefined);

async function load(nextPage = 1) {
  loading.value = true;
  try {
    const result = await listAuditLogs({
      action: action.value || undefined,
      targetType: targetType.value || undefined,
      targetId: targetId.value.trim() || undefined,
      from: range.value?.[0]?.toISOString(),
      to: range.value?.[1]?.toISOString(),
      page: nextPage,
    });
    rows.value = result.items;
    page.value = result.page;
    pageSize.value = result.pageSize;
    total.value = result.total;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      await router.replace("/login");
      return;
    }
    if (e instanceof ApiError && e.status === 403) {
      await router.replace("/users");
      return;
    }
    ElMessage.error(e instanceof ApiError ? e.message : "加载失败");
  } finally {
    loading.value = false;
  }
}

function actorText(row: AuditLogRow) {
  return row.actor.displayName?.trim() || row.actor.email || "管理员";
}

function targetText(row: AuditLogRow) {
  const fallback = row.targetType === AuditTargetType.User ? "用户" : "活动";
  const label = row.target.label.trim() || fallback;
  return `${label}（${row.target.id}）`;
}

function logout() {
  setAdminToken(null);
  void router.replace("/login");
}

watch([action, targetType, range], () => {
  void load(1);
});

onMounted(() => {
  void load(1);
});
</script>

<template>
  <div class="page">
    <div class="bar">
      <h1>审计日志</h1>
      <el-space>
        <router-link class="nav-link" to="/users">用户发布权</router-link>
        <router-link class="nav-link" to="/activities">活动列表</router-link>
        <el-button :loading="loading" @click="load(page)">刷新</el-button>
        <el-button @click="logout">退出</el-button>
      </el-space>
    </div>

    <el-space class="filters" wrap>
      <el-select v-model="action" clearable placeholder="操作" style="width: 160px">
        <el-option :label="auditActionLabel(AuditAction.FreezePublish)" :value="AuditAction.FreezePublish" />
        <el-option :label="auditActionLabel(AuditAction.UnfreezePublish)" :value="AuditAction.UnfreezePublish" />
        <el-option :label="auditActionLabel(AuditAction.Remove)" :value="AuditAction.Remove" />
      </el-select>
      <el-select v-model="targetType" clearable placeholder="对象类型" style="width: 140px">
        <el-option label="用户" :value="AuditTargetType.User" />
        <el-option label="活动" :value="AuditTargetType.Activity" />
      </el-select>
      <el-input
        v-model="targetId"
        clearable
        placeholder="对象 ID"
        style="width: 220px"
        @keyup.enter="load(1)"
      />
      <el-date-picker
        v-model="range"
        type="datetimerange"
        start-placeholder="开始"
        end-placeholder="结束"
      />
      <el-button type="primary" :loading="loading" @click="load(1)">查询</el-button>
    </el-space>

    <el-table
      v-loading="loading"
      class="table"
      row-key="id"
      :data="rows"
      stripe
      empty-text="暂无审计记录"
    >
      <el-table-column label="时间" min-width="180">
        <template #default="{ row }">
          {{ new Date(row.createdAt).toLocaleString() }}
        </template>
      </el-table-column>
      <el-table-column label="操作人" min-width="200">
        <template #default="{ row }">
          <div>{{ actorText(row) }}</div>
          <span class="mono">{{ row.actor.id }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="140">
        <template #default="{ row }">
          {{ auditActionLabel(row.action) }}
        </template>
      </el-table-column>
      <el-table-column label="对象" min-width="240">
        <template #default="{ row }">
          {{ targetText(row) }}
        </template>
      </el-table-column>
      <el-table-column label="原因" min-width="160">
        <template #default="{ row }">
          {{ row.reason || "—" }}
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
      @current-change="load"
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
.filters {
  margin-bottom: 16px;
}
.table {
  width: 100%;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  user-select: all;
}
.pager {
  margin-top: 16px;
  justify-content: flex-end;
}
</style>

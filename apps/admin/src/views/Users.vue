<script setup lang="ts">
import { Refresh } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import {
  freezePublish,
  listUsers,
  unfreezePublish,
  type AdminUserRow,
} from "../api/admin";
import { ApiError } from "../api/http";
import PageHeader from "../components/PageHeader.vue";
import ProTableLite from "../components/ProTableLite.vue";
import StatusPill from "../components/StatusPill.vue";
import UserIdentity from "../components/UserIdentity.vue";
import { useTable } from "../composables/useTable";
import { Capability } from "../permissions";
import { handleListError } from "../utils/errors";
import { displayName, formatDateTime } from "../utils/format";

const router = useRouter();
const busyId = ref<string | null>(null);

const { rows, loading, page, pageSize, total, goPage, refresh } = useTable<AdminUserRow>({
  fetch: ({ page: targetPage }) => listUsers(targetPage),
  onError: (error) => handleListError(error, router, "加载失败"),
});

const publishableCount = computed(() => rows.value.filter((row) => row.canPublish).length);
const frozenCount = computed(() => rows.value.filter((row) => !row.canPublish).length);

function subjectLabel(row: AdminUserRow) {
  return `${displayName(row.nickname)}（${row.id}）`;
}

async function promptReason(row: AdminUserRow, action: "冻结" | "恢复") {
  const subject = subjectLabel(row);
  const { value } = await ElMessageBox.prompt(
    `将${action}「${subject}」的发布权，请输入原因`,
    `${action}发布权 · ${subject}`,
    {
      confirmButtonText: action,
      cancelButtonText: "取消",
      inputPattern: /\S+/,
      inputErrorMessage: "原因不能为空",
    },
  );
  return value.trim();
}

async function onSubmitAction(row: AdminUserRow, action: "冻结" | "恢复") {
  try {
    const reason = await promptReason(row, action);
    busyId.value = row.id;
    if (action === "冻结") {
      await freezePublish(row.id, reason);
    } else {
      await unfreezePublish(row.id, reason);
    }
    ElMessage.success(action === "冻结" ? "已冻结发布权" : "已恢复发布权");
    refresh();
  } catch (e) {
    if (e === "cancel" || e === "close") return;
    if (e instanceof ApiError && e.status === 401) {
      await router.replace("/login");
      return;
    }
    ElMessage.error(
      e instanceof ApiError ? e.message : action === "冻结" ? "冻结失败" : "恢复失败",
    );
  } finally {
    busyId.value = null;
  }
}
</script>

<template>
  <div>
    <PageHeader
      title="用户发布权"
      description="默认可发布；冻结后用户无法创建或发布活动，敏感操作会写入审计日志。"
    >
      <template #actions>
        <el-button :icon="Refresh" :loading="loading" @click="refresh">刷新</el-button>
      </template>
    </PageHeader>

    <ProTableLite
      :data="rows"
      :loading="loading"
      row-key="id"
      empty-text="暂无用户"
      paged
      :page="page"
      :page-size="pageSize"
      :total="total"
      @page-change="goPage"
    >
      <template #toolbar>
        <span class="stat">
          共 <b>{{ total }}</b> 位用户
        </span>
        <span class="divider" />
        <span class="stat stat--ok">本页可发布 <b>{{ publishableCount }}</b></span>
        <span class="stat stat--off">本页已冻结 <b>{{ frozenCount }}</b></span>
      </template>

      <el-table-column label="用户" min-width="280">
        <template #default="{ row }">
          <UserIdentity :name="displayName(row.nickname)" :sub="row.id" />
        </template>
      </el-table-column>
      <el-table-column label="发布权" width="140">
        <template #default="{ row }">
          <StatusPill
            :tone="row.canPublish ? 'ok' : 'danger'"
            :label="row.canPublish ? '可发布' : '已冻结'"
          />
        </template>
      </el-table-column>
      <el-table-column label="注册时间" min-width="180">
        <template #default="{ row }">
          <span class="text-secondary">{{ formatDateTime(row.createdAt) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="140" align="right" fixed="right">
        <template #default="{ row }">
          <el-button
            v-if="row.canPublish"
            v-auth="Capability.ManagePublish"
            type="danger"
            link
            :loading="busyId === row.id"
            @click="onSubmitAction(row, '冻结')"
          >
            冻结发布权
          </el-button>
          <el-button
            v-else
            v-auth="Capability.ManagePublish"
            type="primary"
            link
            :loading="busyId === row.id"
            @click="onSubmitAction(row, '恢复')"
          >
            恢复发布权
          </el-button>
        </template>
      </el-table-column>
    </ProTableLite>
  </div>
</template>

<style scoped>
.stat {
  font-size: 13px;
  color: var(--text-secondary);
}

.stat b {
  color: var(--text-primary);
  font-weight: 600;
  margin: 0 2px;
}

.stat--ok b {
  color: var(--success);
}

.stat--off b {
  color: var(--danger);
}

.divider {
  width: 1px;
  height: 14px;
  background: var(--border);
}
</style>

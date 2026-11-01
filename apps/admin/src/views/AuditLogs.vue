<script setup lang="ts">
import {
  AuditAction,
  AuditTargetType,
  auditActionLabel,
} from "@activity/shared";
import { Refresh } from "@element-plus/icons-vue";
import { reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { listAuditLogs, type AuditLogRow, type ListAuditLogsParams } from "../api/admin";
import PageHeader from "../components/PageHeader.vue";
import ProTableLite from "../components/ProTableLite.vue";
import SearchForm from "../components/SearchForm.vue";
import StatusPill from "../components/StatusPill.vue";
import UserIdentity from "../components/UserIdentity.vue";
import { useTable } from "../composables/useTable";
import { handleListError } from "../utils/errors";
import { formatDateTime, formatRelative } from "../utils/format";

type Tone = "ok" | "warn" | "danger" | "info" | "neutral";
type Range = [Date, Date] | undefined;

const ACTION_TONE: Record<string, Tone> = {
  [AuditAction.FreezePublish]: "danger",
  [AuditAction.UnfreezePublish]: "ok",
  [AuditAction.Remove]: "warn",
};

const router = useRouter();

/** 表单态：用户正在编辑的筛选条件 */
const form = reactive({
  action: "",
  targetType: "",
  targetId: "",
  range: undefined as Range,
});

/** 已应用态：真正参与请求的条件（点「查询」后同步） */
const applied = ref<ListAuditLogsParams>({});

const { rows, loading, page, pageSize, total, load, goPage, refresh } = useTable<AuditLogRow>({
  fetch: ({ page: targetPage }) => listAuditLogs({ ...applied.value, page: targetPage }),
  onError: (error) => handleListError(error, router, "加载失败"),
});

function applyFilters(): void {
  applied.value = {
    action: form.action || undefined,
    targetType: form.targetType || undefined,
    targetId: form.targetId.trim() || undefined,
    from: form.range?.[0]?.toISOString(),
    to: form.range?.[1]?.toISOString(),
  };
}

function search(): void {
  applyFilters();
  void load(1);
}

function reset(): void {
  form.action = "";
  form.targetType = "";
  form.targetId = "";
  form.range = undefined;
  search();
}

function actorText(row: AuditLogRow) {
  return row.actor.displayName?.trim() || row.actor.email || "管理员";
}

function targetLabel(row: AuditLogRow) {
  const fallback = row.targetType === AuditTargetType.User ? "用户" : "活动";
  const label = row.target.label.trim() || fallback;
  return label;
}
</script>

<template>
  <div>
    <PageHeader
      title="审计日志"
      description="冻结、恢复发布权与下架活动的完整留痕，仅管理员可查看。"
    >
      <template #actions>
        <el-button :icon="Refresh" :loading="loading" @click="refresh">刷新</el-button>
      </template>
    </PageHeader>

    <ProTableLite
      :data="rows"
      :loading="loading"
      row-key="id"
      empty-text="暂无审计记录"
      paged
      :page="page"
      :page-size="pageSize"
      :total="total"
      @page-change="goPage"
    >
      <template #toolbar>
        <SearchForm :loading="loading" @search="search" @reset="reset">
          <el-select v-model="form.action" clearable placeholder="操作类型" class="filters__select">
            <el-option
              :label="auditActionLabel(AuditAction.FreezePublish)"
              :value="AuditAction.FreezePublish"
            />
            <el-option
              :label="auditActionLabel(AuditAction.UnfreezePublish)"
              :value="AuditAction.UnfreezePublish"
            />
            <el-option :label="auditActionLabel(AuditAction.Remove)" :value="AuditAction.Remove" />
          </el-select>
          <el-select
            v-model="form.targetType"
            clearable
            placeholder="对象类型"
            class="filters__select filters__select--sm"
          >
            <el-option label="用户" :value="AuditTargetType.User" />
            <el-option label="活动" :value="AuditTargetType.Activity" />
          </el-select>
          <el-input
            v-model="form.targetId"
            clearable
            placeholder="对象 ID"
            class="filters__input"
            @keyup.enter="search"
          />
          <el-date-picker
            v-model="form.range"
            type="datetimerange"
            range-separator="至"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
            class="filters__range"
          />
        </SearchForm>
      </template>

      <el-table-column label="时间" min-width="170">
        <template #default="{ row }">
          <el-tooltip :content="formatDateTime(row.createdAt)" placement="top" :show-after="200">
            <span class="text-secondary">{{ formatRelative(row.createdAt) }}</span>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column label="操作人" min-width="230">
        <template #default="{ row }">
          <UserIdentity :name="actorText(row)" :sub="row.actor.id" :size="28" />
        </template>
      </el-table-column>
      <el-table-column label="操作" width="150">
        <template #default="{ row }">
          <StatusPill
            :tone="ACTION_TONE[row.action] ?? 'neutral'"
            :label="auditActionLabel(row.action)"
          />
        </template>
      </el-table-column>
      <el-table-column label="对象" min-width="220">
        <template #default="{ row }">
          <div class="cell-stack">
            <span class="cell-title">{{ targetLabel(row) }}</span>
            <span class="mono text-muted">{{ row.target.id }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="原因" min-width="220">
        <template #default="{ row }">
          <el-tooltip v-if="row.reason" :content="row.reason" placement="top" :show-after="200">
            <span class="cell-ellipsis text-secondary">{{ row.reason }}</span>
          </el-tooltip>
          <span v-else class="text-muted">—</span>
        </template>
      </el-table-column>
    </ProTableLite>
  </div>
</template>

<style scoped>
.filters__select {
  width: 160px;
}

.filters__select--sm {
  width: 128px;
}

.filters__input {
  width: 200px;
}

.filters__range {
  width: 360px;
}

.cell-stack {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.cell-title {
  font-weight: 500;
  color: var(--text-primary);
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
  .filters__select,
  .filters__select--sm,
  .filters__input,
  .filters__range {
    width: 100%;
  }
}
</style>

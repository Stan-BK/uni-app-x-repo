<script setup lang="ts">
import { Refresh } from "@element-plus/icons-vue";
import { ActivityLifecycleStatus, FeeType } from "@activity/shared";
import { ElMessage, ElMessageBox } from "element-plus";
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import {
  listActivities,
  removeActivity,
  type ActivityRow,
} from "../api/admin";
import { ApiError } from "../api/http";
import PageHeader from "../components/PageHeader.vue";
import ProTableLite from "../components/ProTableLite.vue";
import StatusPill from "../components/StatusPill.vue";
import UserIdentity from "../components/UserIdentity.vue";
import { useTable } from "../composables/useTable";
import { Capability } from "../permissions";
import { handleListError } from "../utils/errors";
import { displayName, formatDateTime, formatFee } from "../utils/format";

type Tone = "ok" | "warn" | "danger" | "info" | "neutral";

const LIFECYCLE_META: Record<string, { label: string; tone: Tone }> = {
  [ActivityLifecycleStatus.Draft]: { label: "草稿", tone: "neutral" },
  [ActivityLifecycleStatus.Published]: { label: "已发布", tone: "ok" },
  [ActivityLifecycleStatus.Cancelled]: { label: "已取消", tone: "warn" },
  [ActivityLifecycleStatus.Removed]: { label: "已下架", tone: "danger" },
  [ActivityLifecycleStatus.Ended]: { label: "已结束", tone: "neutral" },
};

const router = useRouter();
const busyId = ref<string | null>(null);
/** empty string = 全部 */
const lifecycleFilter = ref<string>(ActivityLifecycleStatus.Published);

const { rows, loading, load, refresh } = useTable<ActivityRow>({
  fetch: () => listActivities(lifecycleFilter.value || undefined),
  onError: (error) => handleListError(error, router, "加载失败"),
});

const publishedCount = computed(
  () => rows.value.filter((row) => row.lifecycle === ActivityLifecycleStatus.Published).length,
);
const removedCount = computed(
  () => rows.value.filter((row) => row.lifecycle === ActivityLifecycleStatus.Removed).length,
);

function lifecycleMeta(lifecycle: string) {
  return LIFECYCLE_META[lifecycle] ?? { label: lifecycle, tone: "neutral" as Tone };
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
    refresh();
  } catch (e) {
    if (e === "cancel" || e === "close") return;
    if (e instanceof ApiError && e.status === 401) {
      await router.replace("/login");
      return;
    }
    ElMessage.error(e instanceof ApiError ? e.message : "下架失败");
  } finally {
    busyId.value = null;
  }
}

watch(lifecycleFilter, () => {
  void load(1);
});
</script>

<template>
  <div>
    <PageHeader
      title="活动列表"
      description="查看全平台活动，对已发布的活动执行下架；下架会通知主办方并留痕。"
    >
      <template #actions>
        <el-select
          v-model="lifecycleFilter"
          class="lifecycle-select"
          placeholder="生命周期"
        >
          <el-option label="全部" value="" />
          <el-option label="已发布" :value="ActivityLifecycleStatus.Published" />
          <el-option label="草稿" :value="ActivityLifecycleStatus.Draft" />
          <el-option label="已下架" :value="ActivityLifecycleStatus.Removed" />
          <el-option label="已取消" :value="ActivityLifecycleStatus.Cancelled" />
          <el-option label="已结束" :value="ActivityLifecycleStatus.Ended" />
        </el-select>
        <el-button :icon="Refresh" :loading="loading" @click="refresh">刷新</el-button>
      </template>
    </PageHeader>

    <ProTableLite :data="rows" :loading="loading" row-key="id" empty-text="该筛选下暂无活动">
      <template #toolbar>
        <span class="stat">当前筛选 <b>{{ rows.length }}</b> 条</span>
        <span class="divider" />
        <span class="stat stat--ok">已发布 <b>{{ publishedCount }}</b></span>
        <span class="stat stat--off">已下架 <b>{{ removedCount }}</b></span>
        <span class="toolbar-note">免费与付费活动按主办方设置展示</span>
      </template>

      <el-table-column label="活动" min-width="260">
        <template #default="{ row }">
          <div class="cell-stack">
            <span class="cell-title">{{ row.title }}</span>
            <span class="mono text-muted">{{ row.id }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="主办" min-width="200">
        <template #default="{ row }">
          <UserIdentity
            :name="displayName(row.owner?.nickname)"
            :sub="row.owner?.id"
            :size="28"
          />
        </template>
      </el-table-column>
      <el-table-column label="状态" width="120">
        <template #default="{ row }">
          <StatusPill
            :tone="lifecycleMeta(row.lifecycle).tone"
            :label="lifecycleMeta(row.lifecycle).label"
          />
        </template>
      </el-table-column>
      <el-table-column label="费用" width="110">
        <template #default="{ row }">
          <span :class="row.feeType === FeeType.Free ? 'text-muted' : 'cell-title'">
            {{ formatFee(row.feeType, row.feeCents) }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="开始时间" min-width="170">
        <template #default="{ row }">
          <span class="text-secondary">
            {{ row.startAt ? formatDateTime(row.startAt) : "未设置" }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="下架原因" min-width="200">
        <template #default="{ row }">
          <el-tooltip
            v-if="row.removeReason"
            :content="row.removeReason"
            placement="top"
            :show-after="200"
          >
            <span class="cell-ellipsis text-secondary">{{ row.removeReason }}</span>
          </el-tooltip>
          <span v-else class="text-muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="110" align="right" fixed="right">
        <template #default="{ row }">
          <el-button
            v-if="row.lifecycle === ActivityLifecycleStatus.Published"
            v-auth="Capability.RemoveActivity"
            type="danger"
            link
            :loading="busyId === row.id"
            @click="onRemove(row)"
          >
            下架
          </el-button>
          <span v-else class="text-muted">—</span>
        </template>
      </el-table-column>
    </ProTableLite>
  </div>
</template>

<style scoped>
.lifecycle-select {
  width: 148px;
}

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

.toolbar-note {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-muted);
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
</style>

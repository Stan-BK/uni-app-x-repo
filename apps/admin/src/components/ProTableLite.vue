<script setup lang="ts" generic="Row extends Record<string, unknown>">
/**
 * 轻量表格容器（对齐 Geeker ProTable / v3-admin-vite 的「工具栏 + 表格 + 分页」骨架）：
 * - 负责：panel 外观、工具栏插槽、空态、加载态、分页（可选）
 * - 不负责：取数、筛选状态、列定义（列通过默认插槽传入 el-table-column）
 */
withDefaults(
  defineProps<{
    data: Row[];
    loading?: boolean;
    rowKey?: string;
    emptyText?: string;
    /** 是否显示分页（分页接口传 true，一次性列表省略） */
    paged?: boolean;
    page?: number;
    pageSize?: number;
    total?: number;
  }>(),
  {
    loading: false,
    rowKey: "id",
    emptyText: "暂无数据",
    paged: false,
    page: 1,
    pageSize: 20,
    total: 0,
  },
);

const emit = defineEmits<{
  (e: "page-change", page: number): void;
}>();
</script>

<template>
  <section class="panel">
    <div v-if="$slots.toolbar" class="panel__toolbar">
      <slot name="toolbar" />
    </div>

    <el-table v-loading="loading" :data="data" :row-key="rowKey">
      <slot />
      <template #empty>
        <el-empty :image-size="72" :description="emptyText" />
      </template>
    </el-table>

    <div v-if="paged" class="table-pagination">
      <el-pagination
        background
        layout="total, prev, pager, next"
        :current-page="page"
        :page-size="pageSize"
        :total="total"
        @current-change="emit('page-change', $event)"
      />
    </div>
  </section>
</template>

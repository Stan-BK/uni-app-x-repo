<script setup lang="ts">
import { Search } from "@element-plus/icons-vue";

/**
 * 组合查询栏：字段走默认插槽，右下角统一「查询 / 重置」。
 * 放在 `ProTableLite` 的 `#toolbar` 里使用。
 *
 * 约定：字段值先落到页面的 form 上，点「查询」才应用到请求，
 * 避免每改一个筛选条件就发一次请求。
 */
withDefaults(
  defineProps<{
    loading?: boolean;
  }>(),
  { loading: false },
);

const emit = defineEmits<{
  (e: "search"): void;
  (e: "reset"): void;
}>();
</script>

<template>
  <div class="search-form">
    <div class="search-form__fields">
      <slot />
    </div>
    <div class="search-form__actions">
      <el-button type="primary" :icon="Search" :loading="loading" @click="emit('search')">
        查询
      </el-button>
      <el-button @click="emit('reset')">重置</el-button>
    </div>
  </div>
</template>

<style scoped>
.search-form {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 12px;
  width: 100%;
}

.search-form__fields {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 12px;
  min-width: 0;
}

.search-form__actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

@media (max-width: 900px) {
  .search-form__fields {
    width: 100%;
  }

  .search-form__actions {
    margin-left: 0;
  }
}
</style>

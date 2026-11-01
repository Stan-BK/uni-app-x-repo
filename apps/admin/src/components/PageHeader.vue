<script setup lang="ts">
defineProps<{
  title: string;
  description?: string;
}>();
</script>

<template>
  <header class="page-header">
    <div class="page-header__main">
      <h1 class="page-header__title">{{ title }}</h1>
      <p v-if="description" class="page-header__desc">{{ description }}</p>
    </div>
    <div class="page-header__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 18px;
  flex-wrap: wrap;
}

.page-header__title {
  font-size: 21px;
  font-weight: 650;
  letter-spacing: -0.01em;
  color: var(--text-primary);
}

.page-header__desc {
  margin-top: 4px;
  font-size: 13px;
  color: var(--text-muted);
}

.page-header__actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
</style>

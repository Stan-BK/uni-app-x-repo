<script setup lang="ts">
import { Odometer } from "@element-plus/icons-vue";
import { computed } from "vue";
import { useRoute } from "vue-router";
import { navItems } from "../navigation";
import { can } from "../permissions";

const props = defineProps<{ collapsed: boolean }>();
const emit = defineEmits<{ (e: "navigate"): void }>();

const route = useRoute();
const activePath = computed(() => route.path);
const envLabel = import.meta.env.DEV ? "开发环境" : "生产环境";

const visibleItems = computed(() =>
  navItems.filter((item) => !item.capability || can(item.capability)),
);
</script>

<template>
  <div class="sidebar-nav" :class="{ 'is-collapsed': props.collapsed }">
    <div class="brand">
      <div class="brand__mark">
        <el-icon :size="20"><Odometer /></el-icon>
      </div>
      <div v-if="!props.collapsed" class="brand__text">
        <span class="brand__name">Activity</span>
        <span class="brand__sub">运营后台</span>
      </div>
    </div>

    <el-scrollbar class="menu-scroll">
      <el-menu
        :default-active="activePath"
        :collapse="props.collapsed"
        :collapse-transition="false"
        router
        class="menu"
        @select="emit('navigate')"
      >
        <el-menu-item v-for="item in visibleItems" :key="item.path" :index="item.path">
          <el-icon><component :is="item.icon" /></el-icon>
          <template #title>{{ item.title }}</template>
        </el-menu-item>
      </el-menu>
    </el-scrollbar>

    <div v-if="!props.collapsed" class="sidebar-footer">
      <span class="sidebar-footer__dot" />
      <span>{{ envLabel }} · Activity Platform</span>
    </div>
  </div>
</template>

<style scoped>
.sidebar-nav {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-surface);
  border-right: 1px solid var(--border);
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  height: var(--header-height);
  padding: 0 18px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.is-collapsed .brand {
  justify-content: center;
  padding: 0;
}

.brand__mark {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  color: #fff;
  background: linear-gradient(135deg, var(--brand-500), var(--brand-accent));
  box-shadow: 0 6px 16px -8px color-mix(in srgb, var(--brand-500) 80%, transparent);
  flex-shrink: 0;
}

.brand__text {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
  overflow: hidden;
}

.brand__name {
  font-size: 15px;
  font-weight: 650;
  letter-spacing: 0.01em;
  color: var(--text-primary);
}

.brand__sub {
  font-size: 11.5px;
  color: var(--text-muted);
}

.menu-scroll {
  flex: 1;
  padding: 12px 10px;
}

.menu {
  border-right: none;
  background: transparent;
}

.menu:not(.el-menu--collapse) {
  width: auto;
}

.menu :deep(.el-menu-item) {
  height: 42px;
  line-height: 42px;
  margin-bottom: 4px;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-weight: 500;
}

.menu :deep(.el-menu-item:hover) {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.menu :deep(.el-menu-item.is-active) {
  background: var(--brand-050);
  color: var(--brand-500);
  font-weight: 600;
}

.menu :deep(.el-menu-item .el-icon) {
  font-size: 18px;
}

.is-collapsed .menu-scroll {
  padding-inline: 8px;
}

.sidebar-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 20px;
  border-top: 1px solid var(--border);
  font-size: 11.5px;
  color: var(--text-muted);
}

.sidebar-footer__dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--success);
  box-shadow: 0 0 0 3px rgba(18, 183, 106, 0.16);
}
</style>

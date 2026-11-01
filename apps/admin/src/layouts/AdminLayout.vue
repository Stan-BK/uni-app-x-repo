<script setup lang="ts">
import {
  ArrowDown,
  Expand,
  Fold,
  Menu,
  MoonNight,
  Sunny,
  SwitchButton,
} from "@element-plus/icons-vue";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { getAdminProfile, setAdminToken } from "../api/http";
import SidebarNav from "../components/SidebarNav.vue";
import { useTheme } from "../composables/useTheme";
import { ADMIN_ROLE_LABEL } from "../navigation";
import { isAdmin } from "../permissions";
import { initialOf, avatarColor } from "../utils/format";

const route = useRoute();
const router = useRouter();
const { isDark, toggle: toggleTheme } = useTheme();

const COLLAPSE_KEY = "admin_sidebar_collapsed";
const collapsed = ref(localStorage.getItem(COLLAPSE_KEY) === "1");
const mobile = ref(false);
const drawerOpen = ref(false);

const profile = getAdminProfile();
const adminName = computed(
  () => profile?.displayName?.trim() || profile?.email || "管理员",
);
const roleLabel = computed(
  () => ADMIN_ROLE_LABEL[profile?.role ?? ""] ?? (isAdmin() ? "管理员" : "运营"),
);
const pageTitle = computed(() => (route.meta.title as string | undefined) ?? "");
const avatarBg = computed(() => avatarColor(adminName.value));

let mql: MediaQueryList | undefined;
function syncMobile(event: MediaQueryList | MediaQueryListEvent) {
  mobile.value = event.matches;
  if (!event.matches) drawerOpen.value = false;
}

function toggleSidebar() {
  if (mobile.value) {
    drawerOpen.value = !drawerOpen.value;
    return;
  }
  collapsed.value = !collapsed.value;
  localStorage.setItem(COLLAPSE_KEY, collapsed.value ? "1" : "0");
}

function onCommand(command: string) {
  if (command !== "logout") return;
  setAdminToken(null);
  void router.replace("/login");
}

onMounted(() => {
  mql = window.matchMedia("(max-width: 900px)");
  syncMobile(mql);
  mql.addEventListener("change", syncMobile);
});

onBeforeUnmount(() => {
  mql?.removeEventListener("change", syncMobile);
});
</script>

<template>
  <div class="shell">
    <aside
      v-if="!mobile"
      class="shell__aside"
      :style="{ width: collapsed ? 'var(--sidebar-width-collapsed)' : 'var(--sidebar-width)' }"
    >
      <SidebarNav :collapsed="collapsed" />
    </aside>

    <el-drawer
      v-else
      v-model="drawerOpen"
      direction="ltr"
      size="248px"
      :with-header="false"
      class="shell__drawer"
    >
      <SidebarNav :collapsed="false" @navigate="drawerOpen = false" />
    </el-drawer>

    <div class="shell__body">
      <header class="topbar">
        <div class="topbar__left">
          <el-button
            text
            circle
            class="icon-btn"
            :aria-label="mobile ? '打开菜单' : '折叠菜单'"
            @click="toggleSidebar"
          >
            <el-icon :size="18">
              <component :is="mobile ? Menu : collapsed ? Expand : Fold" />
            </el-icon>
          </el-button>
          <nav class="crumbs" aria-label="面包屑">
            <span class="crumbs__root">运营后台</span>
            <span v-if="pageTitle" class="crumbs__sep">/</span>
            <span v-if="pageTitle" class="crumbs__current">{{ pageTitle }}</span>
          </nav>
        </div>

        <div class="topbar__right">
          <el-tooltip :content="isDark ? '切换到浅色模式' : '切换到深色模式'" placement="bottom">
            <el-button text circle class="icon-btn" aria-label="切换主题" @click="toggleTheme()">
              <el-icon :size="17">
                <component :is="isDark ? Sunny : MoonNight" />
              </el-icon>
            </el-button>
          </el-tooltip>

          <el-dropdown trigger="click" @command="onCommand">
            <button class="user-btn" type="button">
              <span class="user-btn__avatar" :style="{ background: avatarBg }">
                {{ initialOf(adminName) }}
              </span>
              <span class="user-btn__meta">
                <span class="user-btn__name">{{ adminName }}</span>
                <span class="user-btn__role">{{ roleLabel }}</span>
              </span>
              <el-icon class="user-btn__caret"><ArrowDown /></el-icon>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item disabled>
                  {{ profile?.email ?? "—" }}
                </el-dropdown-item>
                <el-dropdown-item divided command="logout">
                  <el-icon><SwitchButton /></el-icon>
                  退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <main class="content">
        <div class="content__inner">
          <RouterView v-slot="{ Component }">
            <Transition name="page" mode="out-in">
              <component :is="Component" />
            </Transition>
          </RouterView>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: var(--bg-app);
}

.shell__aside {
  flex-shrink: 0;
  transition: width 0.2s ease;
  height: 100%;
}

.shell__drawer :deep(.el-drawer__body) {
  padding: 0;
}

.shell__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  height: var(--header-height);
  padding: 0 24px 0 16px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.topbar__left,
.topbar__right {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.icon-btn {
  color: var(--text-secondary);
}

.icon-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.crumbs {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
}

.crumbs__root {
  color: var(--text-muted);
}

.crumbs__sep {
  color: var(--text-muted);
  opacity: 0.6;
}

.crumbs__current {
  color: var(--text-primary);
  font-weight: 550;
}

.user-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 8px 5px 5px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  cursor: pointer;
  font: inherit;
  color: var(--text-primary);
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;
}

.user-btn:hover {
  background: var(--bg-hover);
  border-color: var(--border);
}

.user-btn__avatar {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 999px;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
}

.user-btn__meta {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  line-height: 1.2;
}

.user-btn__name {
  font-size: 13px;
  font-weight: 550;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-btn__role {
  font-size: 11px;
  color: var(--text-muted);
}

.user-btn__caret {
  font-size: 12px;
  color: var(--text-muted);
}

.content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.content__inner {
  max-width: 1240px;
  margin: 0 auto;
}

@media (max-width: 900px) {
  .content {
    padding: 16px;
  }

  .user-btn__meta {
    display: none;
  }
}
</style>

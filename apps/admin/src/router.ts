import { createRouter, createWebHistory } from "vue-router";
import { getAdminToken } from "./api/http";
import AdminLayout from "./layouts/AdminLayout.vue";
import { can, Capability, type Capability as CapabilityType } from "./permissions";
import LoginView from "./views/Login.vue";

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/login",
      name: "login",
      component: LoginView,
      meta: { public: true, title: "登录" },
    },
    {
      path: "/",
      component: AdminLayout,
      redirect: "/users",
      children: [
        {
          path: "users",
          name: "users",
          component: () => import("./views/Users.vue"),
          meta: { title: "用户发布权" },
        },
        {
          path: "activities",
          name: "activities",
          component: () => import("./views/Activities.vue"),
          meta: { title: "活动列表" },
        },
        {
          path: "community",
          name: "community",
          component: () => import("./views/CommunityPosts.vue"),
          meta: { title: "社区动态" },
        },
        {
          path: "audit-logs",
          name: "audit-logs",
          component: () => import("./views/AuditLogs.vue"),
          meta: { title: "审计日志", capability: Capability.AuditRead },
        },
      ],
    },
  ],
});

router.beforeEach((to) => {
  if (to.meta.public) return true;
  if (!getAdminToken()) {
    return { name: "login", query: { redirect: to.fullPath } };
  }
  const capability = to.meta.capability as CapabilityType | undefined;
  if (capability && !can(capability)) {
    return { name: "users" };
  }
  return true;
});

router.afterEach((to) => {
  const title = to.meta.title as string | undefined;
  document.title = title ? `${title} · Activity 运营后台` : "Activity 运营后台";
});

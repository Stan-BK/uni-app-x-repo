import { AdminRole } from "@activity/shared";
import { createRouter, createWebHistory } from "vue-router";
import { getAdminProfile, getAdminToken } from "./api/http";
import LoginView from "./views/Login.vue";
import UsersView from "./views/Users.vue";

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: "/", redirect: "/users" },
    {
      path: "/login",
      name: "login",
      component: LoginView,
      meta: { public: true },
    },
    {
      path: "/users",
      name: "users",
      component: UsersView,
    },
    {
      path: "/activities",
      name: "activities",
      component: () => import("./views/Activities.vue"),
    },
    {
      path: "/audit-logs",
      name: "audit-logs",
      component: () => import("./views/AuditLogs.vue"),
      meta: { roles: [AdminRole.Admin] },
    },
  ],
});

router.beforeEach((to) => {
  if (to.meta.public) return true;
  if (!getAdminToken()) {
    return { name: "login", query: { redirect: to.fullPath } };
  }
  const roles = to.meta.roles as string[] | undefined;
  if (roles?.length && !roles.includes(getAdminProfile()?.role ?? "")) {
    return { name: "users" };
  }
  return true;
});

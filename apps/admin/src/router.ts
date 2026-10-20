import { createRouter, createWebHistory } from "vue-router";
import { getAdminToken } from "./api/http";
import LoginView from "./views/Login.vue";
import UsersView from "./views/Users.vue";

export const router = createRouter({
  history: createWebHistory(),
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
  ],
});

router.beforeEach((to) => {
  if (to.meta.public) return true;
  if (!getAdminToken()) {
    return { name: "login", query: { redirect: to.fullPath } };
  }
  return true;
});

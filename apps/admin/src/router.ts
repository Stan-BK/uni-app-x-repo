import { createRouter, createWebHistory } from "vue-router";
import { getAdminToken } from "./api/http";
import LoginView from "./views/Login.vue";
import OrganizerApplicationsView from "./views/OrganizerApplications.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/organizers" },
    {
      path: "/login",
      name: "login",
      component: LoginView,
      meta: { public: true },
    },
    {
      path: "/organizers",
      name: "organizers",
      component: OrganizerApplicationsView,
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

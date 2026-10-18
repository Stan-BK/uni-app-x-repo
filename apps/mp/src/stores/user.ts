import { defineStore } from "pinia";
import { PublishStatus } from "@activity/shared";
import { loginWithWeixin } from "../adapters/auth";
import { getUserToken, request, setUserToken } from "../utils/request";

export type MeResult = {
  id: string;
  nickname: string | null;
  avatarUrl: string | null;
  organizer: { publishStatus: string } | null;
};

export type OrganizerApplyResult = {
  id: string;
  name: string;
  publishStatus: string;
  applyReason: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  [PublishStatus.None]: "未申请",
  [PublishStatus.Pending]: "审核中",
  [PublishStatus.Approved]: "已通过（可发布）",
  [PublishStatus.Rejected]: "已驳回",
  [PublishStatus.Frozen]: "已冻结",
};

export const useUserStore = defineStore("user", {
  state: () => ({
    token: getUserToken() as string | null,
    me: null as MeResult | null,
    canPublishFlag: false,
  }),
  getters: {
    isLoggedIn: (s) => Boolean(s.token),
    publishStatus: (s) => s.me?.organizer?.publishStatus ?? null,
    publishStatusLabel: (s) => {
      const status = s.me?.organizer?.publishStatus;
      if (!status) return "无组织者";
      return STATUS_LABEL[status] ?? status;
    },
    canApplyOrganizer: (s) => {
      if (!s.token) return false;
      const status = s.me?.organizer?.publishStatus;
      return (
        !status ||
        status === PublishStatus.None ||
        status === PublishStatus.Rejected
      );
    },
    canPublish: (s) => s.canPublishFlag,
  },
  actions: {
    async login() {
      const result = await loginWithWeixin();
      this.token = result.accessToken;
      setUserToken(result.accessToken);
      await this.refreshIdentity();
    },
    logout() {
      this.token = null;
      this.me = null;
      this.canPublishFlag = false;
      setUserToken(null);
    },
    async fetchMe() {
      this.me = await request<MeResult>("/me");
      return this.me;
    },
    async refreshIdentity() {
      if (!this.token) {
        this.me = null;
        this.canPublishFlag = false;
        return;
      }
      await this.fetchMe();
      const res = await request<{ canPublish: boolean }>(
        "/organizers/can-publish",
      );
      this.canPublishFlag = res.canPublish;
    },
    async applyOrganizer(name: string, reason?: string) {
      const organizer = await request<OrganizerApplyResult>("/organizers/apply", {
        method: "POST",
        data: { name, reason },
      });
      await this.refreshIdentity();
      return organizer;
    },
  },
});

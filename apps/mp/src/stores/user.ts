import { defineStore } from "pinia";
import { loginWithWeixin, useDevLoginCode } from "../adapters/auth";
import { patchMe } from "../api/me";
import { getUserToken, request, setUserToken } from "../utils/request";

function initialToken(): string | null {
  // 开发旁路不恢复上次 JWT，冷启动从游客开始，便于走「点登录」流程。
  if (useDevLoginCode()) {
    setUserToken(null);
    return null;
  }
  return getUserToken();
}

export type MeResult = {
  id: string;
  nickname: string | null;
  avatarUrl: string | null;
  canPublish: boolean;
};

export const useUserStore = defineStore("user", {
  state: () => ({
    token: initialToken(),
    me: null as MeResult | null,
    canPublishFlag: false,
  }),
  getters: {
    isLoggedIn: (s) => Boolean(s.token),
    canPublish: (s) => s.canPublishFlag,
  },
  actions: {
    async login() {
      const result = await loginWithWeixin();
      this.token = result.accessToken;
      setUserToken(result.accessToken);
      await this.refreshIdentity();
    },
    /** 未登录时弹窗确认，用户点「去登录」才换 JWT。已登录则直接通过。 */
    async promptLogin(message = "请先登录微信账号后再继续") {
      if (this.isLoggedIn) return true;
      const res = await uni.showModal({
        title: "需要登录",
        content: message,
        confirmText: "去登录",
        cancelText: "取消",
      });
      if (!res.confirm) return false;
      try {
        await this.login();
        return true;
      } catch (e) {
        uni.showToast({
          title: e instanceof Error ? e.message : "登录失败",
          icon: "none",
        });
        return false;
      }
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
      this.canPublishFlag = this.me?.canPublish ?? false;
    },
    async updateProfile(patch: {
      nickname?: string | null;
      avatarUrl?: string | null;
    }) {
      this.me = await patchMe(patch);
      this.canPublishFlag = this.me?.canPublish ?? false;
      return this.me;
    },
  },
});

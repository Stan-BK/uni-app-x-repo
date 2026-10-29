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
  realName: string | null;
  phone: string | null;
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
    /** 已登录但缺昵称或头像，需引导完善（新版头像昵称）。 */
    needsProfile: (s) => {
      if (!s.token || !s.me) return false;
      const nick = (s.me.nickname ?? "").trim();
      const avatar = (s.me.avatarUrl ?? "").trim();
      return !nick || !avatar;
    },
  },
  actions: {
    async login() {
      const result = await loginWithWeixin();
      this.token = result.accessToken;
      setUserToken(result.accessToken);
      await this.refreshIdentity();
    },
    /** 未登录时弹窗确认，用户点「去登录」才换 JWT。已登录则直接通过。
     * 登录后若缺头像/昵称会跳转资料页，并返回 false 以便调用方暂停后续动作。 */
    async promptLogin(message = "请先登录微信账号后再继续") {
      if (this.isLoggedIn) {
        // 已登录但缺头像/昵称：同样引导完善，避免冷启动带旧 JWT 直接报名
        if (!this.me) await this.refreshIdentity();
        if (this.guideProfileIfNeeded("login")) return false;
        return true;
      }
      const res = await uni.showModal({
        title: "需要登录",
        content: message,
        confirmText: "去登录",
        cancelText: "取消",
      });
      if (!res.confirm) return false;
      try {
        await this.login();
        if (this.guideProfileIfNeeded("login")) return false;
        return true;
      } catch (e) {
        uni.showToast({
          title: e instanceof Error ? e.message : "登录失败",
          icon: "none",
        });
        return false;
      }
    },
    /** 缺资料时 toast + 跳转资料页；已跳转返回 true。 */
    guideProfileIfNeeded(from = "login") {
      if (!this.needsProfile) return false;
      uni.showToast({ title: "请完善头像和昵称", icon: "none" });
      uni.navigateTo({
        url: `/pages/mine/profile?from=${encodeURIComponent(from)}`,
      });
      return true;
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
      realName?: string | null;
      phone?: string | null;
    }) {
      this.me = await patchMe(patch);
      this.canPublishFlag = this.me?.canPublish ?? false;
      return this.me;
    },
  },
});

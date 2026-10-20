import { defineStore } from "pinia";
import { loginWithWeixin } from "../adapters/auth";
import { getUserToken, request, setUserToken } from "../utils/request";

export type MeResult = {
  id: string;
  nickname: string | null;
  avatarUrl: string | null;
  canPublish: boolean;
};

export const useUserStore = defineStore("user", {
  state: () => ({
    token: getUserToken() as string | null,
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
  },
});

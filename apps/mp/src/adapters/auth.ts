import { request } from "../utils/request";

export type LoginResult = {
  accessToken: string;
  user: {
    id: string;
    nickname: string | null;
    avatarUrl: string | null;
  };
};

export function useDevLoginCode(): boolean {
  // 默认开发旁路；生产构建请设 VITE_AUTH_DEV_BYPASS=false 并配置微信密钥
  return import.meta.env.VITE_AUTH_DEV_BYPASS !== "false";
}

/**
 * 微信登录适配：正式环境走 uni.login 取 code；
 * 开发旁路固定 code=dev（依赖服务端 AUTH_DEV_BYPASS，无需 AppSecret）。
 */
export async function loginWithWeixin(): Promise<LoginResult> {
  let code = "dev";

  if (!useDevLoginCode()) {
    // #ifdef MP-WEIXIN
    const loginRes = await new Promise<UniApp.LoginRes>((resolve, reject) => {
      uni.login({
        provider: "weixin",
        success: resolve,
        fail: reject,
      });
    });
    if (!loginRes.code) {
      throw new Error("uni.login 未返回 code");
    }
    code = loginRes.code;
    // #endif
  }

  return request<LoginResult>("/auth/weixin/login", {
    method: "POST",
    data: { code },
    auth: false,
  });
}

const TOKEN_KEY = "user_access_token";

export function getApiBase(): string {
  return import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:3000/api";
}

export function getUserToken(): string | null {
  return uni.getStorageSync(TOKEN_KEY) || null;
}

export function setUserToken(token: string | null): void {
  if (token) {
    uni.setStorageSync(TOKEN_KEY, token);
  } else {
    uni.removeStorageSync(TOKEN_KEY);
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  data?: unknown;
  auth?: boolean;
};

export function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", data, auth = true } = options;
  const header: Record<string, string> = {
    Accept: "application/json",
  };
  if (data !== undefined) {
    header["Content-Type"] = "application/json";
  }
  if (auth) {
    const token = getUserToken();
    if (token) {
      header.Authorization = `Bearer ${token}`;
    }
  }

  return new Promise((resolve, reject) => {
    uni.request({
      url: `${getApiBase()}${path}`,
      // PATCH 已纳入 RequestOptions；部分 uni 类型定义可能尚未包含，故断言
      method: method as UniApp.RequestOptions["method"],
      data: data as UniApp.RequestOptions["data"],
      header,
      success: (res) => {
        const status = res.statusCode ?? 0;
        if (status === 401) {
          setUserToken(null);
        }
        const body = res.data;
        if (status < 200 || status >= 300) {
          const message =
            typeof body === "object" &&
            body !== null &&
            "message" in body &&
            (body as { message: unknown }).message != null
              ? String(
                  Array.isArray((body as { message: unknown }).message)
                    ? ((body as { message: string[] }).message).join(", ")
                    : (body as { message: string }).message,
                )
              : `HTTP ${status}`;
          reject(new ApiError(status, message));
          return;
        }
        resolve(body as T);
      },
      fail: (err) => {
        reject(new Error(err.errMsg || "network error"));
      },
    });
  });
}

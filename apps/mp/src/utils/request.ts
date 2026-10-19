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
    public fields?: string[],
    public code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function messageFromBody(body: unknown): {
  message: string;
  fields?: string[];
  code?: string;
} {
  if (typeof body !== "object" || body === null) {
    return { message: "请求失败" };
  }
  const raw = body as {
    message?: unknown;
    fields?: unknown;
    code?: unknown;
  };
  let message = "";
  let fields: string[] | undefined;
  let code: string | undefined;

  if (typeof raw.code === "string") {
    code = raw.code;
  }

  if (Array.isArray(raw.message)) {
    message = raw.message.map(String).join("；");
  } else if (typeof raw.message === "object" && raw.message !== null) {
    const nested = raw.message as {
      message?: unknown;
      fields?: unknown;
      code?: unknown;
    };
    if (typeof nested.message === "string") {
      message = nested.message;
    }
    if (Array.isArray(nested.fields)) {
      fields = nested.fields.map(String);
    }
    if (typeof nested.code === "string") {
      code = nested.code;
    }
  } else if (raw.message != null) {
    message = String(raw.message);
  }

  if (Array.isArray(raw.fields)) {
    fields = raw.fields.map(String);
  }

  return { message: message || "请求失败", fields, code };
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
          const parsed = messageFromBody(body);
          reject(
            new ApiError(
              status,
              parsed.message || `HTTP ${status}`,
              parsed.fields,
              parsed.code,
            ),
          );
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

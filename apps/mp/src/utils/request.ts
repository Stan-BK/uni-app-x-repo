import {
  MAINTENANCE_MESSAGE,
  SystemErrorCode,
} from "@activity/shared";

const TOKEN_KEY = "user_access_token";
const MAINTENANCE_TOAST_COOLDOWN_MS = 8000;

let lastMaintenanceToastAt = 0;

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

export function isMaintenanceError(err: unknown): boolean {
  return (
    err instanceof ApiError && err.code === SystemErrorCode.Maintenance
  );
}

/** 节流提示升级中；维护错误在 cooldown 内重复调用不会再次弹 toast。 */
export function notifyMaintenanceOnce(
  message: string = MAINTENANCE_MESSAGE,
): void {
  const now = Date.now();
  if (now - lastMaintenanceToastAt < MAINTENANCE_TOAST_COOLDOWN_MS) {
    return;
  }
  lastMaintenanceToastAt = now;
  uni.showToast({ title: message, icon: "none", duration: 3000 });
}

/**
 * 页面 catch 里优先用这个，避免维护窗下与请求层重复弹 toast。
 * 维护错误：走节流提示；其它：照常 toast。
 */
export function showApiErrorToast(err: unknown, fallback = "请求失败"): void {
  if (isMaintenanceError(err)) {
    notifyMaintenanceOnce(err instanceof ApiError ? err.message : undefined);
    return;
  }
  const title =
    err instanceof ApiError
      ? err.message || fallback
      : err instanceof Error
        ? err.message
        : fallback;
  uni.showToast({ title, icon: "none" });
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

/** 将 HTTP 失败规范为 ApiError；维护窗时弹一次提示。 */
export function apiErrorFromResponse(
  status: number,
  body: unknown,
  fallbackMessage?: string,
): ApiError {
  const parsed = messageFromBody(body);
  const isMaintenance = parsed.code === SystemErrorCode.Maintenance;
  const message = isMaintenance
    ? parsed.message || MAINTENANCE_MESSAGE
    : parsed.message || fallbackMessage || `HTTP ${status}`;
  const code = isMaintenance ? SystemErrorCode.Maintenance : parsed.code;
  if (isMaintenance) {
    notifyMaintenanceOnce(message);
  }
  return new ApiError(status, message, parsed.fields, code);
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
          reject(apiErrorFromResponse(status, body));
          return;
        }
        resolve(body as T);
      },
      fail: (err) => {
        const detail = err.errMsg || "network error";
        reject(new Error(`请求失败：${detail}`));
      },
    });
  });
}

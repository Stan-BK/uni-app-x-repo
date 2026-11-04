import {
  MAINTENANCE_MESSAGE,
  SystemErrorCode,
} from "@activity/shared";
import { ElMessage } from "element-plus";

const TOKEN_KEY = "admin_access_token";
const ADMIN_KEY = "admin_profile";
const MAINTENANCE_TOAST_COOLDOWN_MS = 8000;

let lastMaintenanceToastAt = 0;

export type AdminProfile = {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
};

export function getApiBase(): string {
  return import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:3000/api";
}

export function getAdminToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getAdminProfile(): AdminProfile | null {
  const raw = localStorage.getItem(ADMIN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AdminProfile;
  } catch {
    return null;
  }
}

export function setAdminProfile(admin: AdminProfile | null): void {
  if (admin) {
    localStorage.setItem(ADMIN_KEY, JSON.stringify(admin));
  } else {
    localStorage.removeItem(ADMIN_KEY);
  }
}

export function setAdminToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ADMIN_KEY);
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
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

function notifyMaintenanceOnce(message: string = MAINTENANCE_MESSAGE): void {
  const now = Date.now();
  if (now - lastMaintenanceToastAt < MAINTENANCE_TOAST_COOLDOWN_MS) {
    return;
  }
  lastMaintenanceToastAt = now;
  ElMessage.warning(message);
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  auth?: boolean;
};

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", body, auth = true } = options;
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (auth) {
    const token = getAdminToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const res = await fetch(`${getApiBase()}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 401) {
    setAdminToken(null);
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const code =
      typeof data === "object" &&
      data !== null &&
      "code" in data &&
      typeof (data as { code: unknown }).code === "string"
        ? (data as { code: string }).code
        : undefined;
    const isMaintenance = code === SystemErrorCode.Maintenance;
    const message = isMaintenance
      ? (typeof data === "object" &&
        data !== null &&
        "message" in data &&
        typeof (data as { message: unknown }).message === "string"
          ? (data as { message: string }).message
          : MAINTENANCE_MESSAGE)
      : typeof data === "object" &&
          data !== null &&
          "message" in data &&
          (typeof (data as { message: unknown }).message === "string" ||
            Array.isArray((data as { message: unknown }).message))
        ? String(
            Array.isArray((data as { message: unknown }).message)
              ? (data as { message: string[] }).message.join(", ")
              : (data as { message: string }).message,
          )
        : res.statusText || `HTTP ${res.status}`;
    if (isMaintenance) {
      notifyMaintenanceOnce(message);
    }
    throw new ApiError(
      res.status,
      message,
      isMaintenance ? SystemErrorCode.Maintenance : code,
    );
  }

  return data as T;
}

import { apiRequest } from "./http";

export type AdminLoginResult = {
  accessToken: string;
  admin: {
    id: string;
    email: string;
    displayName: string | null;
    role: string;
  };
};

export type AdminUserRow = {
  id: string;
  nickname: string | null;
  canPublish: boolean;
  createdAt: string;
};

export function adminLogin(email: string, password: string) {
  return apiRequest<AdminLoginResult>("/admin/auth/login", {
    method: "POST",
    body: { email, password },
    auth: false,
  });
}

export function listUsers(page = 1) {
  return apiRequest<{
    items: AdminUserRow[];
    total: number;
    page: number;
    pageSize: number;
  }>(`/admin/users?page=${page}`);
}

export function freezePublish(id: string, reason: string) {
  return apiRequest(`/admin/users/${id}/freeze-publish`, {
    method: "POST",
    body: { reason },
  });
}

export function unfreezePublish(id: string, reason: string) {
  return apiRequest(`/admin/users/${id}/unfreeze-publish`, {
    method: "POST",
    body: { reason },
  });
}

export type ActivityRow = {
  id: string;
  title: string;
  lifecycle: string;
  feeType: string;
  feeCents: number;
  startAt: string | null;
  endAt: string | null;
  removeReason: string | null;
  owner: { id: string; nickname: string | null };
};

export function listActivities(lifecycle?: string) {
  const q = lifecycle ? `?lifecycle=${encodeURIComponent(lifecycle)}` : "";
  return apiRequest<ActivityRow[]>(`/admin/activities${q}`);
}

export function removeActivity(id: string, reason: string) {
  return apiRequest<ActivityRow>(`/admin/activities/${id}/remove`, {
    method: "POST",
    body: { reason },
  });
}

export type AuditLogRow = {
  id: string;
  createdAt: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  actor: { id: string; displayName: string | null; email: string | null };
  target: { id: string; label: string };
};

export type ListAuditLogsParams = {
  action?: string;
  targetType?: string;
  targetId?: string;
  from?: string;
  to?: string;
  page?: number;
};

export function listAuditLogs(params: ListAuditLogsParams = {}) {
  const q = new URLSearchParams();
  if (params.action) q.set("action", params.action);
  if (params.targetType) q.set("targetType", params.targetType);
  if (params.targetId) q.set("targetId", params.targetId);
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  if (params.page) q.set("page", String(params.page));
  const qs = q.toString();
  return apiRequest<{
    items: AuditLogRow[];
    total: number;
    page: number;
    pageSize: number;
  }>(`/admin/audit-logs${qs ? `?${qs}` : ""}`);
}

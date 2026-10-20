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

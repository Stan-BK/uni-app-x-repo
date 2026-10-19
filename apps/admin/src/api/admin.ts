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

export type OrganizerRow = {
  id: string;
  ownerUserId: string;
  name: string;
  type: string;
  description: string | null;
  publishStatus: string;
  applyReason: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export function adminLogin(email: string, password: string) {
  return apiRequest<AdminLoginResult>("/admin/auth/login", {
    method: "POST",
    body: { email, password },
    auth: false,
  });
}

export function listOrganizers(status = "pending") {
  const q = new URLSearchParams({ status });
  return apiRequest<OrganizerRow[]>(`/admin/organizers?${q}`);
}

export function approveOrganizer(id: string, note?: string) {
  return apiRequest<OrganizerRow>(`/admin/organizers/${id}/approve`, {
    method: "POST",
    body: { note },
  });
}

export function rejectOrganizer(id: string, reason: string) {
  return apiRequest<OrganizerRow>(`/admin/organizers/${id}/reject`, {
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
  organizer: { id: string; name: string };
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

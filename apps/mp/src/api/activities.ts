import { request } from "@/utils/request";

export type Activity = {
  id: string;
  title: string;
  coverUrl: string;
  category: string;
  description?: string | null;
  rules: string;
  startAt?: string | null;
  endAt?: string | null;
  place: string;
  capacity: number;
  feeType: "free" | "paid";
  feeCents: number;
  feeNote?: string | null;
  lifecycle: "draft" | "published" | "cancelled" | "removed" | "ended";
  cancelReason?: string | null;
  removeReason?: string | null;
};

export type UpsertBody = Partial<{
  title: string;
  coverUrl: string;
  category: string;
  description: string;
  rules: string;
  startAt: string;
  endAt: string;
  place: string;
  capacity: number;
  feeType: "free" | "paid";
  feeCents: number;
  feeNote: string;
  publish: boolean;
}>;

export function createActivity(body: UpsertBody) {
  return request<Activity>("/organizer/activities", {
    method: "POST",
    data: body,
  });
}

export function listMyActivities(lifecycle?: string) {
  const q = lifecycle ? `?lifecycle=${encodeURIComponent(lifecycle)}` : "";
  return request<{ items: Activity[]; total: number }>(
    `/organizer/activities${q}`,
  );
}

export function getActivity(id: string) {
  return request<Activity>(`/organizer/activities/${id}`);
}

export function updateActivity(id: string, body: UpsertBody) {
  return request<Activity>(`/organizer/activities/${id}`, {
    method: "PATCH",
    data: body,
  });
}

export function publishActivity(id: string) {
  return request<Activity>(`/organizer/activities/${id}/publish`, {
    method: "POST",
  });
}

export function unpublishActivity(id: string) {
  return request<Activity>(`/organizer/activities/${id}/unpublish`, {
    method: "POST",
  });
}

export function cancelActivity(id: string, reason?: string) {
  return request<Activity>(`/organizer/activities/${id}/cancel`, {
    method: "POST",
    data: { reason },
  });
}

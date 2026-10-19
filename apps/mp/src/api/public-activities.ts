import { request } from "@/utils/request";

export type PublicActivity = {
  id: string;
  title: string;
  coverUrl: string;
  category: string;
  description?: string | null;
  rules?: string;
  startAt?: string | null;
  endAt?: string | null;
  place: string;
  placeLat?: number | null;
  placeLng?: number | null;
  capacity: number;
  feeType: "free" | "paid";
  feeCents: number;
  feeNote?: string | null;
  lifecycle: string;
  displayStatus: "upcoming" | "open" | "ended";
  publishedAt?: string | null;
  organizer: { displayName: string };
};

export type ListPublicParams = {
  q?: string;
  sort?: "startAt" | "publishedAt";
  page?: number;
  pageSize?: number;
};

export function listPublicActivities(params: ListPublicParams = {}) {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.sort) qs.set("sort", params.sort);
  if (params.page) qs.set("page", String(params.page));
  if (params.pageSize) qs.set("pageSize", String(params.pageSize));
  const q = qs.toString();
  return request<{
    items: PublicActivity[];
    total: number;
    page: number;
    pageSize: number;
  }>(`/public/activities${q ? `?${q}` : ""}`, { auth: false });
}

export function getPublicActivity(id: string) {
  return request<PublicActivity>(`/public/activities/${encodeURIComponent(id)}`, {
    auth: false,
  });
}

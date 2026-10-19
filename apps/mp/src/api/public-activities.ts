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
  displayStatus: "upcoming" | "open" | "ended" | "full";
  publishedAt?: string | null;
  organizer: { displayName: string };
};

export type ListPublicParams = {
  q?: string;
  sort?: "startAt" | "publishedAt";
  order?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

/** 小程序运行时无 URLSearchParams，手动拼查询串 */
function toQuery(params: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    parts.push(
      `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
    );
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

export function listPublicActivities(params: ListPublicParams = {}) {
  const q = toQuery({
    q: params.q,
    sort: params.sort,
    order: params.order,
    page: params.page,
    pageSize: params.pageSize,
  });
  return request<{
    items: PublicActivity[];
    total: number;
    page: number;
    pageSize: number;
  }>(`/public/activities${q}`, { auth: false });
}

export function getPublicActivity(id: string) {
  return request<PublicActivity>(`/public/activities/${encodeURIComponent(id)}`, {
    auth: false,
  });
}

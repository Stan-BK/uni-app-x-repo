import { request } from "@/utils/request";

export type Registration = {
  id: string;
  activityId: string;
  userId: string;
  name: string;
  phone: string;
  status: string;
  cancelledAt?: string | null;
  createdAt: string;
  activity?: {
    id: string;
    title: string;
    coverUrl: string;
    startAt?: string | null;
    place: string;
    displayStatus?: string;
  };
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

export function createRegistration(body: {
  activityId: string;
  name: string;
  phone: string;
}) {
  return request<Registration>("/registrations", { method: "POST", data: body });
}

export function cancelRegistration(id: string) {
  return request<Registration>(`/registrations/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
  });
}

export function listMyRegistrations(
  params: {
    page?: number;
    pageSize?: number;
    status?: string;
  } = {},
) {
  return request<{
    items: Registration[];
    total: number;
    page: number;
    pageSize: number;
  }>(`/registrations/me${toQuery(params)}`);
}

export function listOrganizerRegistrations(
  activityId: string,
  params: { page?: number; pageSize?: number } = {},
) {
  return request<{
    items: Registration[];
    total: number;
    page: number;
    pageSize: number;
  }>(
    `/organizer/activities/${encodeURIComponent(activityId)}/registrations${toQuery(params)}`,
  );
}

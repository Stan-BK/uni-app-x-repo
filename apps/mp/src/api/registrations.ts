import { request } from "@/utils/request";

export type RegistrationPayParams = {
  timeStamp: string;
  nonceStr: string;
  package: string;
  signType: "RSA";
  paySign: string;
};

export type Registration = {
  id: string;
  activityId: string;
  userId: string;
  name: string;
  phone: string;
  alreadyRegistered?: boolean;
  status: string;
  cancelledAt?: string | null;
  createdAt: string;
  paymentStatus?: "pending" | "paid" | null;
  pay?: RegistrationPayParams | null;
  nickname?: string | null;
  avatarUrl?: string | null;
  activity?: {
    id: string;
    title: string;
    coverUrl: string;
    startAt?: string | null;
    endAt?: string | null;
    place: string;
    displayStatus?: string;
    allowUserCancel?: boolean;
    refundable?: boolean;
    registrationDeadlineAt?: string | null;
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

export type CreateRegistrationResult = Registration & {
  alreadyRegistered: boolean;
  pay?: RegistrationPayParams | null;
  paymentStatus?: "pending" | "paid" | null;
};

export type RegistrationPaymentSyncResult = Registration & {
  paymentStatus?: "pending" | "paid" | null;
};

export function createRegistration(body: {
  activityId: string;
  name: string;
  phone: string;
}) {
  return request<CreateRegistrationResult>("/registrations", {
    method: "POST",
    data: body,
  });
}

export function syncRegistrationPayment(id: string) {
  return request<RegistrationPaymentSyncResult>(
    `/registrations/${encodeURIComponent(id)}/payment-sync`,
    { method: "POST" },
  );
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
    activityId?: string;
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
  params: { page?: number; pageSize?: number; status?: string } = {},
) {
  return request<{
    items: Registration[];
    total: number;
    page: number;
    pageSize: number;
  }>(
    `/me/activities/${encodeURIComponent(activityId)}/registrations${toQuery(params)}`,
  );
}

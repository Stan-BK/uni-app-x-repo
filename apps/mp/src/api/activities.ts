import { ApiError, getApiBase, getUserToken, request } from "@/utils/request";

export type Activity = {
  id: string;
  title: string;
  coverUrl: string;
  category: string;
  description?: string | null;
  rules: string;
  startAt?: string | null;
  endAt?: string | null;
  registrationDeadlineAt?: string | null;
  allowUserCancel?: boolean;
  refundable?: boolean;
  place: string;
  placeLat?: number | null;
  placeLng?: number | null;
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
  registrationDeadlineAt: string;
  allowUserCancel: boolean;
  refundable: boolean;
  place: string;
  placeLat: number | null;
  placeLng: number | null;
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

/** 本地选图后上传封面，返回可公网访问的 URL */
export function uploadCover(filePath: string): Promise<{ url: string }> {
  const token = getUserToken();
  return new Promise((resolve, reject) => {
    uni.uploadFile({
      url: `${getApiBase()}/organizer/uploads/cover`,
      filePath,
      name: "file",
      header: token ? { Authorization: `Bearer ${token}` } : {},
      success: (res) => {
        if (res.statusCode === 401) {
          reject(new ApiError(401, "请重新登录"));
          return;
        }
        let body: unknown = res.data;
        if (typeof body === "string") {
          try {
            body = JSON.parse(body);
          } catch {
            reject(new Error("上传响应无效"));
            return;
          }
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const msg =
            typeof body === "object" &&
            body !== null &&
            "message" in body &&
            (body as { message: unknown }).message != null
              ? String((body as { message: string }).message)
              : `上传失败 HTTP ${res.statusCode}`;
          reject(new ApiError(res.statusCode, msg));
          return;
        }
        const url = (body as { url?: string }).url;
        if (!url) {
          reject(new Error("上传成功但未返回地址"));
          return;
        }
        resolve({ url });
      },
      fail: (err) => reject(new Error(err.errMsg || "上传失败")),
    });
  });
}

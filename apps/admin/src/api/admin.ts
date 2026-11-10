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

export type AdminCommunityPost = {
  id: string;
  body: string;
  author: { id: string; nickname: string; avatarUrl: string | null };
  images: { url: string; sortOrder: number }[];
  activities: { id: string; title: string }[];
  likeCount: number;
  commentCount: number;
  createdAt: string;
};

export type AdminCommunityComment = {
  id: string;
  postId: string;
  parentId: string | null;
  body: string;
  imageUrl: string | null;
  author: { id: string; nickname: string; avatarUrl: string | null };
  replyTo: { id: string; nickname: string; avatarUrl: string | null } | null;
  likeCount: number;
  createdAt: string;
  replies: AdminCommunityComment[];
};

export type ListAdminCommunityPostsParams = {
  q?: string;
  page?: number;
  pageSize?: number;
};

export function listAdminCommunityPosts(
  params: ListAdminCommunityPostsParams = {},
) {
  const q = new URLSearchParams();
  if (params.q) q.set("q", params.q);
  if (params.page) q.set("page", String(params.page));
  if (params.pageSize) q.set("pageSize", String(params.pageSize));
  const qs = q.toString();
  return apiRequest<{
    items: AdminCommunityPost[];
    total: number;
    page: number;
    pageSize: number;
  }>(`/admin/community/posts${qs ? `?${qs}` : ""}`);
}

export function getAdminCommunityPost(id: string) {
  return apiRequest<AdminCommunityPost>(
    `/admin/community/posts/${encodeURIComponent(id)}`,
  );
}

export function listAdminCommunityComments(
  postId: string,
  params: { page?: number; pageSize?: number } = {},
) {
  const q = new URLSearchParams();
  if (params.page) q.set("page", String(params.page));
  if (params.pageSize) q.set("pageSize", String(params.pageSize));
  const qs = q.toString();
  return apiRequest<{
    items: AdminCommunityComment[];
    total: number;
    page: number;
    pageSize: number;
  }>(
    `/admin/community/posts/${encodeURIComponent(postId)}/comments${
      qs ? `?${qs}` : ""
    }`,
  );
}

export function softDeleteAdminCommunityPost(id: string) {
  return apiRequest<void>(
    `/admin/community/posts/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

export function softDeleteAdminCommunityComment(id: string) {
  return apiRequest<void>(
    `/admin/community/comments/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

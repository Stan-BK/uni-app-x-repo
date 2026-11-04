import { request } from "@/utils/request";
import { uploadImageFile } from "./me";

export type CommunityPostSortKey = "latest" | "hot";

export type CommunityPost = {
  id: string;
  body: string;
  author: { id: string; nickname: string; avatarUrl: string | null };
  images: { url: string; sortOrder: number }[];
  activities: { id: string; title: string }[];
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  createdAt: string;
};

export type CommunityPostPage = {
  items: CommunityPost[];
  total: number;
  page: number;
  pageSize: number;
};

export type ActivityCandidate = { id: string; title: string };

export type ActivityCandidatePage = {
  items: ActivityCandidate[];
  total: number;
  page: number;
  pageSize: number;
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

export function listCommunityPosts(
  params: { sort?: CommunityPostSortKey; page?: number; pageSize?: number } = {},
) {
  return request<CommunityPostPage>(`/community/posts${toQuery(params)}`);
}

export function listMyCommunityPosts(
  params: { page?: number; pageSize?: number } = {},
) {
  return request<CommunityPostPage>(`/community/posts/mine${toQuery(params)}`);
}

export function getCommunityPost(id: string) {
  return request<CommunityPost>(`/community/posts/${encodeURIComponent(id)}`);
}

export function createCommunityPost(body: {
  body: string;
  imageUrls: string[];
  activityIds: string[];
}) {
  return request<CommunityPost>("/community/posts", {
    method: "POST",
    data: body,
  });
}

export function deleteCommunityPost(id: string) {
  return request<void>(`/community/posts/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function listActivityCandidates(
  params: { q?: string; page?: number } = {},
) {
  return request<ActivityCandidatePage>(
    `/community/activity-candidates${toQuery(params)}`,
  );
}

/** 本地选图后上传社区配图，返回可公网访问的 URL */
export function uploadCommunityImage(filePath: string): Promise<{ url: string }> {
  return uploadImageFile("/me/uploads/community", filePath);
}

export type CommunityCommentAuthor = {
  id: string;
  nickname: string;
  avatarUrl: string | null;
};

export type CommunityComment = {
  id: string;
  postId: string;
  parentId: string | null;
  body: string;
  imageUrl: string | null;
  author: CommunityCommentAuthor;
  /** 回复对象；一级评论为 null */
  replyTo: CommunityCommentAuthor | null;
  likeCount: number;
  likedByMe: boolean;
  createdAt: string;
};

export type CommunityCommentWithReplies = CommunityComment & {
  replies: CommunityComment[];
};

export type CommunityCommentPage = {
  items: CommunityCommentWithReplies[];
  total: number;
  page: number;
  pageSize: number;
};

export type CommunityLikeTargetType = "post" | "comment";

export type CommunityNotificationType =
  | "like_post"
  | "like_comment"
  | "comment_post"
  | "reply_comment";

export type CommunityNotification = {
  id: string;
  type: CommunityNotificationType;
  postId: string;
  commentId: string | null;
  actor: { id: string; nickname: string; avatarUrl: string | null };
  readAt: string | null;
  createdAt: string;
};

export type CommunityNotificationPage = {
  items: CommunityNotification[];
  total: number;
  page: number;
  pageSize: number;
};

export function listCommunityComments(
  postId: string,
  params: { page?: number; pageSize?: number } = {},
) {
  return request<CommunityCommentPage>(
    `/community/posts/${encodeURIComponent(postId)}/comments${toQuery(params)}`,
  );
}

export function createCommunityComment(
  postId: string,
  body: { body?: string; imageUrl?: string; parentId?: string },
) {
  return request<CommunityComment>(
    `/community/posts/${encodeURIComponent(postId)}/comments`,
    { method: "POST", data: body },
  );
}

export function deleteCommunityComment(id: string) {
  return request<void>(`/community/comments/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function likeCommunityTarget(
  targetType: CommunityLikeTargetType,
  targetId: string,
) {
  return request<{ liked: boolean; likeCount: number }>("/community/likes", {
    method: "POST",
    data: { targetType, targetId },
  });
}

export function unlikeCommunityTarget(
  targetType: CommunityLikeTargetType,
  targetId: string,
) {
  return request<{ liked: boolean; likeCount: number }>("/community/likes", {
    method: "DELETE",
    data: { targetType, targetId },
  });
}

export function listCommunityNotifications(
  params: { page?: number; pageSize?: number } = {},
) {
  return request<CommunityNotificationPage>(
    `/community/notifications${toQuery(params)}`,
  );
}

export function getCommunityUnreadCount() {
  return request<{ count: number }>("/community/notifications/unread-count");
}

export function markCommunityNotificationsRead(
  body: { ids?: string[]; all?: boolean },
) {
  return request<{ updated: number }>("/community/notifications/read", {
    method: "POST",
    data: body,
  });
}

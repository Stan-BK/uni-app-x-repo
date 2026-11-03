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

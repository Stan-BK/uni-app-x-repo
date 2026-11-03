import { ApiError, getApiBase, getUserToken, request } from "../utils/request";

export type MeResult = {
  id: string;
  nickname: string | null;
  avatarUrl: string | null;
  realName: string | null;
  phone: string | null;
  canPublish: boolean;
};

export function patchMe(body: {
  nickname?: string | null;
  avatarUrl?: string | null;
  realName?: string | null;
  phone?: string | null;
}) {
  return request<MeResult>("/me", { method: "PATCH", data: body });
}

/** 本地选图后上传头像，返回可公网访问的 URL */
export function uploadAvatar(filePath: string): Promise<{ url: string }> {
  return uploadImageFile("/me/uploads/avatar", filePath);
}

/** multipart 单文件上传（字段名 file），返回服务端公网 URL。头像、社区配图共用。 */
export function uploadImageFile(
  path: string,
  filePath: string,
): Promise<{ url: string }> {
  const token = getUserToken();
  return new Promise((resolve, reject) => {
    uni.uploadFile({
      url: `${getApiBase()}${path}`,
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

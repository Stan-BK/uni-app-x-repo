/** 分享适配：条件编译收口在此，业务页只调统一接口。 */

export type ActivityShareSource = {
  id: string;
  title: string;
  coverUrl?: string | null;
  lifecycle: string;
};

export type MpShareMessage = {
  title: string;
  path: string;
  imageUrl?: string;
};

export function canShareActivity(activity: ActivityShareSource | null | undefined): boolean {
  return activity?.lifecycle === "published";
}

export function buildActivitySharePath(id: string): string {
  return `/pages/activity/detail?id=${encodeURIComponent(id)}`;
}

export function getActivityShareMessage(
  activity: ActivityShareSource,
): MpShareMessage {
  const msg: MpShareMessage = {
    title: activity.title || "活动详情",
    path: buildActivitySharePath(activity.id),
  };
  if (activity.coverUrl?.trim()) {
    msg.imageUrl = activity.coverUrl.trim();
  }
  return msg;
}

function buildH5ShareUrl(id: string): string {
  // #ifdef H5
  const path = buildActivitySharePath(id);
  return `${window.location.origin}${window.location.pathname}#${path}`;
  // #endif
  // #ifndef H5
  return buildActivitySharePath(id);
  // #endif
}

async function copyText(text: string): Promise<void> {
  // #ifdef H5
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // #endif
  await new Promise<void>((resolve, reject) => {
    uni.setClipboardData({
      data: text,
      success: () => resolve(),
      fail: (err) => reject(err),
    });
  });
}

/**
 * 主动分享（按钮点击）。
 * - 微信小程序：需配合 `open-type="share"`，本函数一般不主动调用系统分享。
 * - H5：优先 Web Share API，否则复制链接。
 */
export async function shareActivity(
  activity: ActivityShareSource,
): Promise<"shared" | "copied" | "mp-menu"> {
  if (!canShareActivity(activity)) {
    throw new Error("仅已发布活动可分享");
  }

  // #ifdef MP-WEIXIN
  uni.showToast({ title: "请使用右上角或分享按钮", icon: "none" });
  return "mp-menu";
  // #endif

  // #ifdef H5
  const url = buildH5ShareUrl(activity.id);
  const title = activity.title || "活动详情";
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text: title, url });
      return "shared";
    } catch (err: unknown) {
      // 用户取消不提示
      if (err instanceof DOMException && err.name === "AbortError") {
        throw err;
      }
    }
  }
  await copyText(url);
  uni.showToast({ title: "链接已复制", icon: "none" });
  return "copied";
  // #endif

  // 其它端：复制小程序路径作为兜底
  await copyText(buildActivitySharePath(activity.id));
  uni.showToast({ title: "链接已复制", icon: "none" });
  return "copied";
}

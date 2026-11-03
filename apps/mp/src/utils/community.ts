/** 动态时间：1 小时内相对时间，其后 MM-DD HH:mm（跨年带年份）。 */
export function formatPostTime(iso?: string | null, now = Date.now()): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diff = now - d.getTime();
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  const pad = (n: number) => String(n).padStart(2, "0");
  const md = `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return d.getFullYear() === new Date(now).getFullYear()
    ? md
    : `${d.getFullYear()}-${md}`;
}

const NOTIFICATION_TEXT: Record<string, string> = {
  like_post: "赞了你的动态",
  like_comment: "赞了你的评论",
  comment_post: "评论了你的动态",
  reply_comment: "回复了你的评论",
};

export function notificationText(type: string): string {
  return NOTIFICATION_TEXT[type] ?? "有新的互动";
}

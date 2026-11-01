const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** 2026/09/18 19:24 */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return dateTimeFormatter.format(date).replace(/\//g, "/");
}

/** 相对时间，用于审计日志等「刚刚 / 3 小时前」场景。 */
export function formatRelative(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const diff = Date.now() - date.getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "刚刚";
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;
  return formatDateTime(value);
}

/** 分 → ¥12.00；免费返回「免费」 */
export function formatFee(feeType: string, feeCents: number): string {
  if (feeType === "free" || feeCents <= 0) return "免费";
  return `¥${(feeCents / 100).toFixed(2)}`;
}

/** 展示名：优先昵称，回退「用户」 */
export function displayName(nickname: string | null | undefined): string {
  return nickname?.trim() || "用户";
}

/** 头像占位字符（支持中文取尾字，英文取首字母） */
export function initialOf(name: string): string {
  const text = name.trim();
  if (!text) return "?";
  return text.slice(0, 1).toUpperCase();
}

/** 头像底色：按名字哈希到一组柔和色，保证同一用户颜色稳定 */
const AVATAR_COLORS = ["#1e9b88", "#3a5a78", "#b94e2d", "#e56f3e", "#157a6a", "#a6752a"];

export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]!;
}

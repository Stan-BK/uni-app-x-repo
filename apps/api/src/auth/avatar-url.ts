export function isAllowedAvatarUrl(value: string): boolean {
  if (!value || /^\s*$/.test(value)) return false;
  if (/^(wxfile:|file:|weixin:)/i.test(value)) return false;
  try {
    const pathname = new URL(value).pathname;
    if (pathname.includes("..")) return false;
    return pathname.includes("/uploads/avatars/");
  } catch {
    return false;
  }
}

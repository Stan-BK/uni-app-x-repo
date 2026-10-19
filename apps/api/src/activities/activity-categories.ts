/**
 * 与 packages/shared ActivityCategory 保持一致。
 * Nest 运行时暂不直接 import ESM shared（无扩展名解析会失败）。
 */
export const ACTIVITY_CATEGORIES = ["观赛"] as const;

export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

export function isActivityCategory(value: string): value is ActivityCategory {
  return (ACTIVITY_CATEGORIES as readonly string[]).includes(value);
}

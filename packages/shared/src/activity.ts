export const ActivityLifecycleStatus = {
  Draft: "draft",
  Published: "published",
  Cancelled: "cancelled",
  Removed: "removed",
  Ended: "ended",
} as const;
export type ActivityLifecycleStatus =
  (typeof ActivityLifecycleStatus)[keyof typeof ActivityLifecycleStatus];

export const FeeType = {
  Free: "free",
  Paid: "paid",
} as const;
export type FeeType = (typeof FeeType)[keyof typeof FeeType];

/** 活动分类（固定枚举；展示文案即存库值） */
export const ActivityCategory = {
  Spectating: "观赛",
} as const;
export type ActivityCategory =
  (typeof ActivityCategory)[keyof typeof ActivityCategory];

export const ACTIVITY_CATEGORY_OPTIONS: ReadonlyArray<{
  text: string;
  value: ActivityCategory;
}> = Object.values(ActivityCategory).map((value) => ({
  text: value,
  value,
}));

export function isActivityCategory(value: string): value is ActivityCategory {
  return (Object.values(ActivityCategory) as string[]).includes(value);
}

export const RegistrationStatus = {
  PendingReview: "pending_review",
  Confirmed: "confirmed",
  Rejected: "rejected",
  Cancelled: "cancelled",
} as const;
export type RegistrationStatus =
  (typeof RegistrationStatus)[keyof typeof RegistrationStatus];

/** 公开展示态（由 startAt/endAt 计算；满员 full 留 P0-4） */
export const ActivityDisplayStatus = {
  Upcoming: "upcoming",
  Open: "open",
  Ended: "ended",
  // Full: "full", // P0-4
} as const;
export type ActivityDisplayStatus =
  (typeof ActivityDisplayStatus)[keyof typeof ActivityDisplayStatus];

export const PublicActivitySort = {
  StartAt: "startAt",
  PublishedAt: "publishedAt",
} as const;
export type PublicActivitySort =
  (typeof PublicActivitySort)[keyof typeof PublicActivitySort];

/** 公开列表排序方向；未传时 startAt 默认 asc、publishedAt 默认 desc */
export const PublicActivityOrder = {
  Asc: "asc",
  Desc: "desc",
} as const;
export type PublicActivityOrder =
  (typeof PublicActivityOrder)[keyof typeof PublicActivityOrder];

export const PublicActivityErrorCode = {
  Cancelled: "ACTIVITY_CANCELLED",
  Removed: "ACTIVITY_REMOVED",
} as const;
export type PublicActivityErrorCode =
  (typeof PublicActivityErrorCode)[keyof typeof PublicActivityErrorCode];

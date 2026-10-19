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

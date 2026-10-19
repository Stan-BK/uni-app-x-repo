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

export const RegistrationStatus = {
  PendingReview: "pending_review",
  Confirmed: "confirmed",
  Rejected: "rejected",
  Cancelled: "cancelled",
} as const;
export type RegistrationStatus =
  (typeof RegistrationStatus)[keyof typeof RegistrationStatus];

/** Shared enums and constants for mp / api / admin. Expand via ADR-0005+. */

export * from "./identity";

export const ActivityReviewStatus = {
  NotRequired: "not_required",
  Pending: "pending",
  Approved: "approved",
  Rejected: "rejected",
} as const;

export type ActivityReviewStatus =
  (typeof ActivityReviewStatus)[keyof typeof ActivityReviewStatus];

export const ActivityLifecycleStatus = {
  Draft: "draft",
  Published: "published",
  Cancelled: "cancelled",
  Removed: "removed",
  Ended: "ended",
} as const;

export type ActivityLifecycleStatus =
  (typeof ActivityLifecycleStatus)[keyof typeof ActivityLifecycleStatus];

export const RegistrationStatus = {
  PendingReview: "pending_review",
  Confirmed: "confirmed",
  Rejected: "rejected",
  Cancelled: "cancelled",
} as const;

export type RegistrationStatus =
  (typeof RegistrationStatus)[keyof typeof RegistrationStatus];

export const FeeType = {
  Free: "free",
  Paid: "paid",
} as const;

export type FeeType = (typeof FeeType)[keyof typeof FeeType];

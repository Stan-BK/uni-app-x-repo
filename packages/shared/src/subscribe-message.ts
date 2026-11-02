export const SubscribeMessageKind = {
  RegistrationConfirmed: "registration_confirmed",
  ActivityStarting: "activity_starting",
} as const;
export type SubscribeMessageKind =
  (typeof SubscribeMessageKind)[keyof typeof SubscribeMessageKind];

export const SubscribeMessageJobStatus = {
  Pending: "pending",
  Sent: "sent",
  Skipped: "skipped",
  Cancelled: "cancelled",
} as const;
export type SubscribeMessageJobStatus =
  (typeof SubscribeMessageJobStatus)[keyof typeof SubscribeMessageJobStatus];

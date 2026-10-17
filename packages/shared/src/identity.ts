export const IdentityProvider = {
  Weixin: "weixin",
  Toutiao: "toutiao",
  Xhs: "xhs",
} as const;
export type IdentityProvider =
  (typeof IdentityProvider)[keyof typeof IdentityProvider];

export const PublishStatus = {
  None: "none",
  Pending: "pending",
  Approved: "approved",
  Rejected: "rejected",
  Frozen: "frozen",
} as const;
export type PublishStatus =
  (typeof PublishStatus)[keyof typeof PublishStatus];

export const AdminRole = {
  Operator: "operator",
  Admin: "admin",
} as const;
export type AdminRole = (typeof AdminRole)[keyof typeof AdminRole];

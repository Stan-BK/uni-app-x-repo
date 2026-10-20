export const IdentityProvider = {
  Weixin: "weixin",
  Toutiao: "toutiao",
  Xhs: "xhs",
} as const;
export type IdentityProvider =
  (typeof IdentityProvider)[keyof typeof IdentityProvider];

export const AdminRole = {
  Operator: "operator",
  Admin: "admin",
} as const;
export type AdminRole = (typeof AdminRole)[keyof typeof AdminRole];

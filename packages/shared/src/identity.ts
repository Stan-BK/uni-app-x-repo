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

/** 用户自助展示昵称最大长度（Unicode 码元，trim 后） */
export const NICKNAME_MAX_LENGTH = 32;

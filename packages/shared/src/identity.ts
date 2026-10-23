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

/** 报名姓名 / User.realName 最大长度（Unicode 码元，trim 后） */
export const REAL_NAME_MAX_LENGTH = 32;

/** 中国大陆 11 位手机号（报名与用户默认联系人共用） */
export const PHONE_PATTERN = /^1\d{10}$/;

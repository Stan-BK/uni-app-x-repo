/** 跨端系统级 HTTP 业务码（非领域错误）。 */
export const SystemErrorCode = {
  /** 发版短停机：Nginx 维护窗，见 deploy/ctl.sh release */
  Maintenance: "MAINTENANCE",
} as const;
export type SystemErrorCode =
  (typeof SystemErrorCode)[keyof typeof SystemErrorCode];

export const MAINTENANCE_MESSAGE = "系统升级中，请稍后再试";

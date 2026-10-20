export const AuditAction = {
  FreezePublish: "freeze_publish",
  UnfreezePublish: "unfreeze_publish",
  Remove: "remove",
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export const AuditTargetType = {
  User: "user",
  Activity: "activity",
} as const;
export type AuditTargetType =
  (typeof AuditTargetType)[keyof typeof AuditTargetType];

export const AuditActionLabel: Record<AuditAction, string> = {
  freeze_publish: "冻结发布权",
  unfreeze_publish: "恢复发布权",
  remove: "下架活动",
};

export function auditActionLabel(action: string): string {
  if (action in AuditActionLabel) {
    return AuditActionLabel[action as AuditAction];
  }
  return action;
}

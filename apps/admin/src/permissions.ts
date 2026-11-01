import { AdminRole } from "@activity/shared";
import { getAdminProfile } from "./api/http";

/**
 * 后台能力表（「能做什么」，不是「哪个页面」）。
 * 前端只做入口隐藏与交互保护，**真正的鉴权永远在后端**（见 ADR-0004）。
 */
export const Capability = {
  /** 查看审计日志 */
  AuditRead: "audit:read",
  /** 冻结 / 恢复用户发布权 */
  ManagePublish: "user:publish:manage",
  /** 下架活动 */
  RemoveActivity: "activity:remove",
} as const;

export type Capability = (typeof Capability)[keyof typeof Capability];

/** 角色 → 能力映射：要调整权限只改这一张表 */
const ROLE_CAPABILITIES: Record<string, readonly Capability[]> = {
  [AdminRole.Admin]: [
    Capability.AuditRead,
    Capability.ManagePublish,
    Capability.RemoveActivity,
  ],
  [AdminRole.Operator]: [Capability.ManagePublish, Capability.RemoveActivity],
};

export function currentRole(): string {
  return getAdminProfile()?.role ?? "";
}

export function isAdmin(): boolean {
  return currentRole() === AdminRole.Admin;
}

export function hasRole(role: string | readonly string[]): boolean {
  const roles = typeof role === "string" ? [role] : role;
  return roles.includes(currentRole());
}

/** 满足任意一项能力即通过；未知角色 / 未知能力一律拒绝 */
export function can(capability: Capability | readonly Capability[]): boolean {
  const granted = ROLE_CAPABILITIES[currentRole()] ?? [];
  const required = typeof capability === "string" ? [capability] : capability;
  return required.some((item) => granted.includes(item));
}

/** 必须同时满足全部能力 */
export function canAll(capabilities: readonly Capability[]): boolean {
  const granted = ROLE_CAPABILITIES[currentRole()] ?? [];
  return capabilities.every((item) => granted.includes(item));
}

/**
 * 页面内使用的权限 API：
 * ```ts
 * const { can, isAdmin } = usePermission();
 * can(Capability.AuditRead);
 * ```
 * 模板中更推荐直接写 `v-auth="Capability.RemoveActivity"`。
 */
export function usePermission() {
  return { role: currentRole(), isAdmin, hasRole, can, canAll };
}

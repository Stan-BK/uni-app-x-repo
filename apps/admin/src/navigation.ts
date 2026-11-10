import { AdminRole } from "@activity/shared";
import { Calendar, ChatDotRound, Document, User } from "@element-plus/icons-vue";
import type { Component } from "vue";
import { Capability } from "./permissions";

export type NavItem = {
  path: string;
  title: string;
  icon: Component;
  /** 为空表示所有登录管理员可见 */
  capability?: Capability;
};

/** 侧边栏菜单；顺序即展示顺序 */
export const navItems: NavItem[] = [
  { path: "/users", title: "用户发布权", icon: User },
  { path: "/activities", title: "活动列表", icon: Calendar },
  { path: "/community", title: "社区动态", icon: ChatDotRound },
  {
    path: "/audit-logs",
    title: "审计日志",
    icon: Document,
    capability: Capability.AuditRead,
  },
];

export const ADMIN_ROLE_LABEL: Record<string, string> = {
  [AdminRole.Admin]: "管理员",
  [AdminRole.Operator]: "运营",
};

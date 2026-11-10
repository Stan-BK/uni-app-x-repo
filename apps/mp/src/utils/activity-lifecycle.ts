import type { Activity } from "@/api/activities";

/** 组织者货架用：published 且已过 endAt 视为 ended（ADR-0005 读时计算） */
export type EffectiveLifecycle = Activity["lifecycle"];

export function isTimeEnded(
  endAt?: string | null,
  now: Date = new Date(),
): boolean {
  if (!endAt) return false;
  const t = new Date(endAt);
  if (Number.isNaN(t.getTime())) return false;
  return now.getTime() >= t.getTime();
}

export function effectiveLifecycle(
  activity: Pick<Activity, "lifecycle" | "endAt">,
  now: Date = new Date(),
): EffectiveLifecycle {
  if (activity.lifecycle === "ended") return "ended";
  if (activity.lifecycle === "published" && isTimeEnded(activity.endAt, now)) {
    return "ended";
  }
  return activity.lifecycle;
}

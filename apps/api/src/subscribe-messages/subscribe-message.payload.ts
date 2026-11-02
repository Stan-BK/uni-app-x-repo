import { SubscribeMessageKind } from "@activity/shared";

export const SUBSCRIBE_DATA_KEYS = {
  title: "thing1",
  startAt: "time2",
  place: "thing3",
  status: "phrase4",
} as const;

const TITLE_MAX = 20;
const PLACE_MAX = 20;

export type SubscribeDataFields = Record<string, { value: string }>;

function clip(value: string, max: number): string {
  return Array.from(value).slice(0, max).join("");
}

function formatStartAt(startAt: Date | null): string {
  if (!startAt) {
    return "时间待定";
  }
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(startAt);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${pick("year")}年${pick("month")}月${pick("day")}日 ${pick("hour")}:${pick("minute")}`;
}

export function buildSubscribeData(input: {
  kind: (typeof SubscribeMessageKind)[keyof typeof SubscribeMessageKind];
  title: string;
  startAt: Date | null;
  place: string | null;
}): SubscribeDataFields {
  const status =
    input.kind === SubscribeMessageKind.RegistrationConfirmed
      ? "报名成功"
      : "即将开始";
  const place = input.place?.trim() ? input.place.trim() : "地点待定";
  return {
    [SUBSCRIBE_DATA_KEYS.title]: { value: clip(input.title.trim() || "活动", TITLE_MAX) },
    [SUBSCRIBE_DATA_KEYS.startAt]: { value: formatStartAt(input.startAt) },
    [SUBSCRIBE_DATA_KEYS.place]: { value: clip(place, PLACE_MAX) },
    [SUBSCRIBE_DATA_KEYS.status]: { value: status },
  };
}

export function subscribePage(activityId: string): string {
  return `pages/activity/detail?id=${encodeURIComponent(activityId)}`;
}

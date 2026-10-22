import {
  ActivityDisplayStatus,
  type ActivityDisplayStatus as DisplayStatus,
} from "@activity/shared";
import type { Activity, FeeType } from "@prisma/client";

export type PublicActivityDto = {
  id: string;
  title: string;
  coverUrl: string;
  category: string;
  description: string | null;
  rules?: string;
  startAt: string | null;
  endAt: string | null;
  registrationDeadlineAt: string | null;
  allowUserCancel: boolean;
  refundable: boolean;
  place: string;
  placeLat: number | null;
  placeLng: number | null;
  capacity: number;
  feeType: FeeType;
  feeCents: number;
  feeNote: string | null;
  lifecycle: string;
  displayStatus: DisplayStatus;
  publishedAt: string | null;
  hostName: string;
  attendees?: { nickname: string; avatarUrl: string | null }[];
  confirmedCount?: number;
};

export function hostNameFromNickname(
  nickname: string | null | undefined,
): string {
  const n = nickname?.trim();
  return n ? n : "用户";
}

export function computeDisplayStatus(
  startAt: Date | null,
  endAt: Date | null,
  confirmedCount: number,
  capacity: number,
  now = new Date(),
  registrationDeadlineAt?: Date | null,
): DisplayStatus {
  if (endAt && now >= endAt) return ActivityDisplayStatus.Ended;
  if (confirmedCount >= capacity) return ActivityDisplayStatus.Full;
  const deadline = registrationDeadlineAt ?? startAt;
  if (deadline && now >= deadline) return ActivityDisplayStatus.Closed;
  return ActivityDisplayStatus.Open;
}

type ActivityWithOwner = Activity & { owner: { nickname: string | null } };

export function toPublicDto(
  row: ActivityWithOwner,
  opts: {
    includeRules: boolean;
    confirmedCount: number;
    now?: Date;
    attendees?: { nickname: string; avatarUrl: string | null }[];
  },
): PublicActivityDto {
  const dto: PublicActivityDto = {
    id: row.id,
    title: row.title,
    coverUrl: row.coverUrl,
    category: row.category,
    description: row.description,
    startAt: row.startAt?.toISOString() ?? null,
    endAt: row.endAt?.toISOString() ?? null,
    registrationDeadlineAt:
      (row.registrationDeadlineAt ?? row.startAt)?.toISOString() ?? null,
    allowUserCancel: row.allowUserCancel,
    refundable: row.refundable,
    place: row.place,
    placeLat: row.placeLat,
    placeLng: row.placeLng,
    capacity: row.capacity,
    feeType: row.feeType,
    feeCents: row.feeCents,
    feeNote: row.feeNote,
    lifecycle: row.lifecycle,
    displayStatus: computeDisplayStatus(
      row.startAt,
      row.endAt,
      opts.confirmedCount,
      row.capacity,
      opts.now,
      row.registrationDeadlineAt,
    ),
    publishedAt: row.publishedAt?.toISOString() ?? null,
    hostName: hostNameFromNickname(row.owner.nickname),
  };
  if (opts.includeRules) {
    dto.rules = row.rules;
    dto.confirmedCount = opts.confirmedCount;
  }
  if (opts.attendees) dto.attendees = opts.attendees;
  return dto;
}

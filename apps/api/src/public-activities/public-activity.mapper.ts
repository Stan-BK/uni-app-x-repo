import {
  ActivityDisplayStatus,
  type ActivityDisplayStatus as DisplayStatus,
} from "@activity/shared";
import type { Activity, FeeType, Organizer } from "@prisma/client";

export type PublicActivityDto = {
  id: string;
  title: string;
  coverUrl: string;
  category: string;
  description: string | null;
  rules?: string;
  startAt: string | null;
  endAt: string | null;
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
  organizer: { displayName: string };
};

export function computeDisplayStatus(
  startAt: Date | null,
  endAt: Date | null,
  now = new Date(),
): DisplayStatus {
  if (endAt && now >= endAt) return ActivityDisplayStatus.Ended;
  if (startAt && now < startAt) return ActivityDisplayStatus.Upcoming;
  return ActivityDisplayStatus.Open;
}

type ActivityWithOrg = Activity & { organizer: Pick<Organizer, "name"> };

export function toPublicDto(
  row: ActivityWithOrg,
  opts: { includeRules: boolean; now?: Date },
): PublicActivityDto {
  const dto: PublicActivityDto = {
    id: row.id,
    title: row.title,
    coverUrl: row.coverUrl,
    category: row.category,
    description: row.description,
    startAt: row.startAt?.toISOString() ?? null,
    endAt: row.endAt?.toISOString() ?? null,
    place: row.place,
    placeLat: row.placeLat,
    placeLng: row.placeLng,
    capacity: row.capacity,
    feeType: row.feeType,
    feeCents: row.feeCents,
    feeNote: row.feeNote,
    lifecycle: row.lifecycle,
    displayStatus: computeDisplayStatus(row.startAt, row.endAt, opts.now),
    publishedAt: row.publishedAt?.toISOString() ?? null,
    organizer: { displayName: row.organizer.name },
  };
  if (opts.includeRules) dto.rules = row.rules;
  return dto;
}

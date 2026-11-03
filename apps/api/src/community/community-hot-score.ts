import {
  COMMUNITY_HOT_AGE_OFFSET_HOURS,
  COMMUNITY_HOT_GRAVITY,
  COMMUNITY_HOT_HALF_LIFE_HOURS,
} from "@activity/shared";

export function communityHotScore(input: {
  likeCount: number;
  commentCount: number;
  ageHours: number;
}): number {
  const engagement = input.likeCount + input.commentCount;
  if (engagement <= 0) return 0;
  const denom = Math.pow(
    (input.ageHours + COMMUNITY_HOT_AGE_OFFSET_HOURS) /
      COMMUNITY_HOT_HALF_LIFE_HOURS,
    COMMUNITY_HOT_GRAVITY,
  );
  return engagement / denom;
}

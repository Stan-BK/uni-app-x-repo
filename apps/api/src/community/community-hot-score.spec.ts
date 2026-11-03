import { describe, expect, it } from "vitest";
import { communityHotScore } from "./community-hot-score";

describe("communityHotScore", () => {
  it("年龄为 0 且无互动时分数为 0", () => {
    expect(
      communityHotScore({
        likeCount: 0,
        commentCount: 0,
        ageHours: 0,
      }),
    ).toBe(0);
  });

  it("同等互动下更旧的帖分数更低", () => {
    const newer = communityHotScore({
      likeCount: 10,
      commentCount: 2,
      ageHours: 1,
    });
    const older = communityHotScore({
      likeCount: 10,
      commentCount: 2,
      ageHours: 48,
    });
    expect(newer).toBeGreaterThan(older);
  });
});

import { SubscribeMessageKind } from "@activity/shared";
import { describe, expect, it } from "vitest";
import { computeJobDueAt } from "./subscribe-message.schedule";

describe("computeJobDueAt", () => {
  const now = new Date("2030-06-01T12:00:00.000Z");

  it("sets registration_confirmed to now", () => {
    const due = computeJobDueAt({
      kind: SubscribeMessageKind.RegistrationConfirmed,
      now,
      startAt: new Date("2030-06-02T12:00:00.000Z"),
    });
    expect(due).toBeInstanceOf(Date);
    expect(due!.toISOString()).toBe(now.toISOString());
  });

  it("sets activity_starting to startAt minus 1h", () => {
    const startAt = new Date("2030-06-02T12:00:00.000Z");
    const due = computeJobDueAt({
      kind: SubscribeMessageKind.ActivityStarting,
      now,
      startAt,
    });
    expect(due).toBeInstanceOf(Date);
    expect(due!.toISOString()).toBe("2030-06-02T11:00:00.000Z");
  });

  it("staggers activity_starting at least 60s after confirmed when start is soon", () => {
    const startAt = new Date("2030-06-01T12:30:00.000Z");
    const due = computeJobDueAt({
      kind: SubscribeMessageKind.ActivityStarting,
      now,
      startAt,
    });
    expect(due).toBeInstanceOf(Date);
    expect(due!.toISOString()).toBe("2030-06-01T12:01:00.000Z");
  });

  it("returns null activity_starting without startAt", () => {
    expect(
      computeJobDueAt({
        kind: SubscribeMessageKind.ActivityStarting,
        now,
        startAt: null,
      }),
    ).toBeNull();
  });
});

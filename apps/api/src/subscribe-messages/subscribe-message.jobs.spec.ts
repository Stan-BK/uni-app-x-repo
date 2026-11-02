import { SubscribeMessageKind } from "@activity/shared";
import { SubscribeMessageJobStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SubscribeMessageJobs } from "./subscribe-message.jobs";

describe("SubscribeMessageJobs", () => {
  const tx = {
    subscribeMessageJob: {
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  const prismaMock = {
    subscribeMessageJob: {
      updateMany: vi.fn(),
    },
  };
  const jobs = new SubscribeMessageJobs(prismaMock as never);
  const now = new Date("2030-06-01T12:00:00.000Z");

  beforeEach(() => {
    vi.clearAllMocks();
    tx.subscribeMessageJob.upsert.mockResolvedValue({});
    tx.subscribeMessageJob.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.subscribeMessageJob.updateMany.mockResolvedValue({ count: 1 });
  });

  it("enqueues confirmed and starting when startAt exists", async () => {
    await jobs.enqueueForConfirmed(tx as never, {
      registrationId: "r1",
      startAt: new Date("2030-06-02T12:00:00.000Z"),
      now,
    });
    expect(tx.subscribeMessageJob.upsert).toHaveBeenCalledTimes(2);
    const kinds = tx.subscribeMessageJob.upsert.mock.calls.map(
      (call) => (call[0] as { create: { kind: string } }).create.kind,
    );
    expect(kinds).toEqual([
      SubscribeMessageKind.RegistrationConfirmed,
      SubscribeMessageKind.ActivityStarting,
    ]);
  });

  it("skips activity_starting without startAt", async () => {
    await jobs.enqueueForConfirmed(tx as never, {
      registrationId: "r1",
      startAt: null,
      now,
    });
    expect(tx.subscribeMessageJob.upsert).toHaveBeenCalledTimes(1);
    expect(
      (tx.subscribeMessageJob.upsert.mock.calls[0][0] as { create: { kind: string } })
        .create.kind,
    ).toBe(SubscribeMessageKind.RegistrationConfirmed);
  });

  it("cancels pending jobs for a registration", async () => {
    await jobs.cancelPendingForRegistration(tx as never, "r1");
    expect(tx.subscribeMessageJob.updateMany).toHaveBeenCalledWith({
      where: {
        registrationId: "r1",
        status: SubscribeMessageJobStatus.pending,
      },
      data: { status: SubscribeMessageJobStatus.cancelled },
    });
  });

  it("cancels pending jobs for an activity", async () => {
    await jobs.cancelPendingForActivity(tx as never, "act1");
    expect(tx.subscribeMessageJob.updateMany).toHaveBeenCalledWith({
      where: {
        status: SubscribeMessageJobStatus.pending,
        registration: { activityId: "act1" },
      },
      data: { status: SubscribeMessageJobStatus.cancelled },
    });
  });

  it("cancels pending jobs for an activity id without tx", async () => {
    await jobs.cancelPendingForActivityId("act1");
    expect(prismaMock.subscribeMessageJob.updateMany).toHaveBeenCalledWith({
      where: {
        status: SubscribeMessageJobStatus.pending,
        registration: { activityId: "act1" },
      },
      data: { status: SubscribeMessageJobStatus.cancelled },
    });
  });
});

import { SubscribeMessageKind } from "@activity/shared";
import {
  ActivityLifecycle,
  RegistrationStatus,
  SubscribeMessageJobStatus,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeWeixinSubscribe } from "./fake-weixin-subscribe";
import { WeixinSubscribeSendError } from "./subscribe-message.port";
import { SubscribeMessageService } from "./subscribe-message.service";

type JobRow = ReturnType<typeof makeJob>;

function makeJob(
  overrides: {
    id?: string;
    openId?: string | null;
    kind?: string;
    attemptCount?: number;
    registrationStatus?: RegistrationStatus;
    lifecycle?: ActivityLifecycle;
    endAt?: Date | null;
  } = {},
) {
  const openId = overrides.openId === undefined ? "oid-1" : overrides.openId;
  return {
    id: overrides.id ?? "job-1",
    registrationId: "reg-1",
    kind: overrides.kind ?? SubscribeMessageKind.RegistrationConfirmed,
    dueAt: new Date("2030-06-01T11:00:00.000Z"),
    status: SubscribeMessageJobStatus.pending,
    attemptCount: overrides.attemptCount ?? 0,
    lastError: null,
    sentAt: null,
    registration: {
      id: "reg-1",
      status: overrides.registrationStatus ?? RegistrationStatus.confirmed,
      activity: {
        id: "act-1",
        title: "周末羽毛球",
        startAt: new Date("2030-06-02T12:00:00.000Z"),
        endAt: overrides.endAt === undefined ? null : overrides.endAt,
        place: "体育馆",
        lifecycle: overrides.lifecycle ?? ActivityLifecycle.published,
      },
      user: {
        identities:
          openId === null
            ? []
            : [{ provider: "weixin", openId }],
      },
    },
  };
}

describe("SubscribeMessageService", () => {
  const now = new Date("2030-06-01T12:00:00.000Z");
  const prisma = {
    subscribeMessageJob: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  const config = {
    get: vi.fn((key: string) => {
      const env: Record<string, string> = {
        WEIXIN_SUBSCRIBE_TMPL_REGISTRATION_CONFIRMED: "tmpl-confirmed",
        WEIXIN_SUBSCRIBE_TMPL_ACTIVITY_STARTING: "tmpl-starting",
        WEIXIN_SUBSCRIBE_MINIPROGRAM_STATE: "developer",
      };
      return env[key];
    }),
  };
  let weixin: FakeWeixinSubscribe;
  let service: SubscribeMessageService;

  function seed(jobs: JobRow[]) {
    prisma.subscribeMessageJob.findMany.mockResolvedValue(jobs);
  }

  function lastUpdateData(index = 0) {
    return (
      prisma.subscribeMessageJob.updateMany.mock.calls[index][0] as {
        where: { id: string; status: string };
        data: Record<string, unknown>;
      }
    ).data;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.subscribeMessageJob.updateMany.mockResolvedValue({ count: 1 });
    weixin = new FakeWeixinSubscribe();
    service = new SubscribeMessageService(prisma as never, weixin, config as never);
  });

  it("marks sent on success", async () => {
    seed([makeJob()]);
    await service.scan(now);
    expect(weixin.sent).toHaveLength(1);
    expect(weixin.sent[0]).toMatchObject({
      openId: "oid-1",
      templateId: "tmpl-confirmed",
      page: "pages/activity/detail?id=act-1",
      miniprogramState: "developer",
    });
    expect(lastUpdateData()).toMatchObject({
      status: SubscribeMessageJobStatus.sent,
      sentAt: now,
    });
  });

  it("skips 43101 without retry", async () => {
    seed([makeJob()]);
    weixin.nextError = new WeixinSubscribeSendError(43101);
    await service.scan(now);
    expect(lastUpdateData()).toMatchObject({
      status: SubscribeMessageJobStatus.skipped,
    });
  });

  it("skips after 3 retryable failures", async () => {
    seed([makeJob({ attemptCount: 2 })]);
    weixin.nextError = new WeixinSubscribeSendError(43108);
    await service.scan(now);
    expect(lastUpdateData()).toMatchObject({
      status: SubscribeMessageJobStatus.skipped,
      attemptCount: 3,
    });
  });

  it("keeps pending and increments attemptCount on retryable failure", async () => {
    seed([makeJob({ attemptCount: 0 })]);
    weixin.nextError = new WeixinSubscribeSendError(43108);
    await service.scan(now);
    const data = lastUpdateData();
    expect(data.status).toBeUndefined();
    expect(data).toMatchObject({ attemptCount: 1 });
    expect(String(data.lastError).length).toBeLessThanOrEqual(120);
  });

  it("cancels when registration not confirmed", async () => {
    seed([makeJob({ registrationStatus: RegistrationStatus.cancelled })]);
    await service.scan(now);
    expect(weixin.sent).toHaveLength(0);
    expect(lastUpdateData()).toMatchObject({
      status: SubscribeMessageJobStatus.cancelled,
    });
  });

  it("skips when no weixin openId", async () => {
    seed([makeJob({ openId: null })]);
    await service.scan(now);
    expect(weixin.sent).toHaveLength(0);
    expect(lastUpdateData()).toMatchObject({
      status: SubscribeMessageJobStatus.skipped,
    });
  });

  it("sends only one job per openId per tick", async () => {
    seed([
      makeJob({ id: "job-1" }),
      makeJob({ id: "job-2", kind: SubscribeMessageKind.ActivityStarting }),
    ]);
    await service.scan(now);
    expect(weixin.sent).toHaveLength(1);
    expect(prisma.subscribeMessageJob.updateMany).toHaveBeenCalledTimes(1);
  });

  it("guards updates with status pending and tolerates 0 rows", async () => {
    seed([makeJob()]);
    prisma.subscribeMessageJob.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.scan(now)).resolves.toBeUndefined();
    expect(weixin.sent).toHaveLength(1);
    const arg = prisma.subscribeMessageJob.updateMany.mock.calls[0][0] as {
      where: { id: string; status: string };
    };
    expect(arg.where).toEqual({
      id: "job-1",
      status: SubscribeMessageJobStatus.pending,
    });
  });
});

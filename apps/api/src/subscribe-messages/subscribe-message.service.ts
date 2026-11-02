import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SubscribeMessageKind } from "@activity/shared";
import {
  ActivityLifecycle,
  type Prisma,
  IdentityProvider,
  RegistrationStatus,
  SubscribeMessageJobStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  LAST_ERROR_MAX_LENGTH,
  SUBSCRIBE_MAX_ATTEMPTS,
  SUBSCRIBE_SCAN_BATCH_SIZE,
} from "./subscribe-message.constants";
import { buildSubscribeData, subscribePage } from "./subscribe-message.payload";
import {
  WEIXIN_SUBSCRIBE_PORT,
  WeixinSubscribeSendError,
  type WeixinSubscribePort,
  type WeixinSubscribeSendInput,
} from "./subscribe-message.port";

/** 用户未订阅 / 次数用完；模板或字段非法：不重试。 */
const NO_RETRY_ERRCODES = new Set([43101, 40037, 47003]);

const TEMPLATE_ENV_BY_KIND: Record<string, string> = {
  [SubscribeMessageKind.RegistrationConfirmed]:
    "WEIXIN_SUBSCRIBE_TMPL_REGISTRATION_CONFIRMED",
  [SubscribeMessageKind.ActivityStarting]:
    "WEIXIN_SUBSCRIBE_TMPL_ACTIVITY_STARTING",
};

type JobWithRelations = Prisma.SubscribeMessageJobGetPayload<{
  include: {
    registration: {
      include: { activity: true; user: { include: { identities: true } } };
    };
  };
}>;

type MiniprogramState = WeixinSubscribeSendInput["miniprogramState"];

@Injectable()
export class SubscribeMessageService {
  private readonly logger = new Logger(SubscribeMessageService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(WEIXIN_SUBSCRIBE_PORT) private readonly weixin: WeixinSubscribePort,
    private readonly config: ConfigService,
  ) {}

  async scan(now = new Date()): Promise<void> {
    const jobs = await this.prisma.subscribeMessageJob.findMany({
      where: {
        status: SubscribeMessageJobStatus.pending,
        dueAt: { lte: now },
      },
      orderBy: { dueAt: "asc" },
      take: SUBSCRIBE_SCAN_BATCH_SIZE,
      include: {
        registration: {
          include: {
            activity: true,
            user: { include: { identities: true } },
          },
        },
      },
    });

    const usedOpenIds = new Set<string>();

    for (const job of jobs) {
      try {
        await this.processJob(job, now, usedOpenIds);
      } catch (error) {
        this.logger.warn(
          `subscribe job ${job.id} failed: ${error instanceof Error ? error.name : "unknown"}`,
        );
      }
    }
  }

  private async processJob(
    job: JobWithRelations,
    now: Date,
    usedOpenIds: Set<string>,
  ): Promise<void> {
    const { registration } = job;
    const { activity } = registration;

    const stale =
      registration.status !== RegistrationStatus.confirmed ||
      activity.lifecycle !== ActivityLifecycle.published ||
      (activity.endAt != null && now >= activity.endAt);
    if (stale) {
      await this.mark(job.id, { status: SubscribeMessageJobStatus.cancelled });
      return;
    }

    const openId = registration.user.identities.find(
      (identity) => identity.provider === IdentityProvider.weixin,
    )?.openId;
    const templateId = this.templateIdFor(job.kind);
    if (!openId || !templateId) {
      await this.mark(job.id, { status: SubscribeMessageJobStatus.skipped });
      return;
    }

    if (usedOpenIds.has(openId)) {
      return;
    }
    usedOpenIds.add(openId);

    try {
      await this.weixin.send({
        openId,
        templateId,
        page: subscribePage(activity.id),
        data: buildSubscribeData({
          kind: job.kind as (typeof SubscribeMessageKind)[keyof typeof SubscribeMessageKind],
          title: activity.title,
          startAt: activity.startAt,
          place: activity.place,
        }),
        miniprogramState: this.miniprogramState(),
      });
    } catch (error) {
      await this.handleSendFailure(job, error);
      return;
    }

    await this.mark(job.id, {
      status: SubscribeMessageJobStatus.sent,
      sentAt: now,
    });
  }

  private async handleSendFailure(
    job: { id: string; attemptCount: number },
    error: unknown,
  ): Promise<void> {
    const errcode =
      error instanceof WeixinSubscribeSendError ? error.errcode : undefined;
    if (errcode !== undefined && NO_RETRY_ERRCODES.has(errcode)) {
      await this.mark(job.id, {
        status: SubscribeMessageJobStatus.skipped,
        lastError: this.formatError(errcode),
      });
      return;
    }

    const attemptCount = job.attemptCount + 1;
    const lastError = this.formatError(errcode);
    if (attemptCount >= SUBSCRIBE_MAX_ATTEMPTS) {
      await this.mark(job.id, {
        status: SubscribeMessageJobStatus.skipped,
        attemptCount,
        lastError,
      });
      return;
    }
    await this.mark(job.id, { attemptCount, lastError });
  }

  private formatError(errcode: number | undefined): string {
    const text = errcode === undefined ? "errcode:unknown" : `errcode:${errcode}`;
    return text.slice(0, LAST_ERROR_MAX_LENGTH);
  }

  private templateIdFor(kind: string): string | undefined {
    const key = TEMPLATE_ENV_BY_KIND[kind];
    if (!key) {
      return undefined;
    }
    const value = this.config.get<string>(key)?.trim();
    return value ? value : undefined;
  }

  private miniprogramState(): MiniprogramState {
    const value = this.config.get<string>("WEIXIN_SUBSCRIBE_MINIPROGRAM_STATE");
    if (value === "developer" || value === "trial" || value === "formal") {
      return value;
    }
    return "formal";
  }

  private async mark(
    id: string,
    data: {
      status?: SubscribeMessageJobStatus;
      attemptCount?: number;
      lastError?: string;
      sentAt?: Date;
    },
  ): Promise<void> {
    // 仅 pending 可被更新：并发取消后不会被改回 sent/skipped；count 为 0 属正常，不抛错。
    await this.prisma.subscribeMessageJob.updateMany({
      where: { id, status: SubscribeMessageJobStatus.pending },
      data,
    });
  }
}

import { Injectable } from "@nestjs/common";
import { SubscribeMessageKind } from "@activity/shared";
import {
  Prisma,
  SubscribeMessageJobStatus,
  SubscribeMessageKind as PrismaSubscribeKind,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { computeJobDueAt } from "./subscribe-message.schedule";

@Injectable()
export class SubscribeMessageJobs {
  constructor(private readonly prisma: PrismaService) {}

  async enqueueForConfirmed(
    tx: Prisma.TransactionClient,
    input: { registrationId: string; startAt: Date | null; now: Date },
  ): Promise<void> {
    await this.upsertKind(tx, {
      registrationId: input.registrationId,
      kind: SubscribeMessageKind.RegistrationConfirmed,
      dueAt: computeJobDueAt({
        kind: SubscribeMessageKind.RegistrationConfirmed,
        now: input.now,
        startAt: input.startAt,
      }),
    });
    const reminderDue = computeJobDueAt({
      kind: SubscribeMessageKind.ActivityStarting,
      now: input.now,
      startAt: input.startAt,
    });
    if (!reminderDue) {
      return;
    }
    await this.upsertKind(tx, {
      registrationId: input.registrationId,
      kind: SubscribeMessageKind.ActivityStarting,
      dueAt: reminderDue,
    });
  }

  async cancelPendingForRegistration(
    tx: Prisma.TransactionClient,
    registrationId: string,
  ): Promise<void> {
    await tx.subscribeMessageJob.updateMany({
      where: {
        registrationId,
        status: SubscribeMessageJobStatus.pending,
      },
      data: { status: SubscribeMessageJobStatus.cancelled },
    });
  }

  async cancelPendingForActivity(
    tx: Prisma.TransactionClient,
    activityId: string,
  ): Promise<void> {
    await tx.subscribeMessageJob.updateMany({
      where: {
        status: SubscribeMessageJobStatus.pending,
        registration: { activityId },
      },
      data: { status: SubscribeMessageJobStatus.cancelled },
    });
  }

  async cancelPendingForActivityId(activityId: string): Promise<void> {
    await this.prisma.subscribeMessageJob.updateMany({
      where: {
        status: SubscribeMessageJobStatus.pending,
        registration: { activityId },
      },
      data: { status: SubscribeMessageJobStatus.cancelled },
    });
  }

  private async upsertKind(
    tx: Prisma.TransactionClient,
    input: {
      registrationId: string;
      kind: (typeof SubscribeMessageKind)[keyof typeof SubscribeMessageKind];
      dueAt: Date | null;
    },
  ): Promise<void> {
    if (!input.dueAt) {
      return;
    }
    await tx.subscribeMessageJob.upsert({
      where: {
        registrationId_kind: {
          registrationId: input.registrationId,
          kind: input.kind as PrismaSubscribeKind,
        },
      },
      create: {
        registrationId: input.registrationId,
        kind: input.kind as PrismaSubscribeKind,
        dueAt: input.dueAt,
        status: SubscribeMessageJobStatus.pending,
        attemptCount: 0,
        lastError: null,
        sentAt: null,
      },
      update: {
        dueAt: input.dueAt,
        status: SubscribeMessageJobStatus.pending,
        attemptCount: 0,
        lastError: null,
        sentAt: null,
      },
    });
  }
}

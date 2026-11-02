import { SubscribeMessageKind } from "@activity/shared";
import {
  SUBSCRIBE_REMINDER_LEAD_MS,
  SUBSCRIBE_STAGGER_MS,
} from "./subscribe-message.constants";

export function computeJobDueAt(input: {
  kind: (typeof SubscribeMessageKind)[keyof typeof SubscribeMessageKind];
  now: Date;
  startAt: Date | null;
}): Date | null {
  if (input.kind === SubscribeMessageKind.RegistrationConfirmed) {
    return input.now;
  }
  if (!input.startAt) {
    return null;
  }
  const reminderAt = new Date(
    input.startAt.getTime() - SUBSCRIBE_REMINDER_LEAD_MS,
  );
  const minDue = new Date(input.now.getTime() + SUBSCRIBE_STAGGER_MS);
  return reminderAt > input.now ? reminderAt : minDue;
}

import { Logger } from "@nestjs/common";
import type { BusinessEvent } from "@activity/shared";

const logger = new Logger("BusinessEvent");

export function logBusinessEvent(input: {
  event: BusinessEvent;
  actorId: string;
  targetId?: string;
}): void {
  logger.log(
    JSON.stringify({
      event: input.event,
      actorId: input.actorId,
      ...(input.targetId ? { targetId: input.targetId } : {}),
      at: new Date().toISOString(),
    }),
  );
}

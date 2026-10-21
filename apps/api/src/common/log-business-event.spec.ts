import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BusinessEvent } from "@activity/shared";
import { logBusinessEvent } from "./log-business-event";

describe("logBusinessEvent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs JSON with event, actorId, at; omits empty targetId", () => {
    const spy = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    logBusinessEvent({ event: BusinessEvent.UserLogin, actorId: "u1" });
    expect(spy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(spy.mock.calls[0]?.[0]));
    expect(payload).toMatchObject({ event: "user.login", actorId: "u1" });
    expect(payload.targetId).toBeUndefined();
    expect(payload.at).toBe(new Date(payload.at).toISOString());
  });

  it("includes targetId when provided", () => {
    const spy = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    logBusinessEvent({
      event: BusinessEvent.RegistrationCreate,
      actorId: "u1",
      targetId: "r1",
    });
    const payload = JSON.parse(String(spy.mock.calls[0]?.[0]));
    expect(payload.targetId).toBe("r1");
  });
});

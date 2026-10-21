import { describe, expect, it } from "vitest";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  it("returns ok and ISO time", () => {
    const result = new HealthController().check();
    expect(result.status).toBe("ok");
    expect(result.time).toBe(new Date(result.time).toISOString());
  });
});

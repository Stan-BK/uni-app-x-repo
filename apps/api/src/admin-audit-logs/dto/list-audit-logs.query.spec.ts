import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { ListAuditLogsQuery } from "./list-audit-logs.query";

describe("ListAuditLogsQuery", () => {
  it("accepts known action and ISO dates", async () => {
    const dto = plainToInstance(ListAuditLogsQuery, {
      action: "freeze_publish",
      targetType: "user",
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-10-20T00:00:00.000Z",
    });
    expect(await validate(dto)).toEqual([]);
  });

  it("rejects unknown action", async () => {
    const dto = plainToInstance(ListAuditLogsQuery, { action: "nope" });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "action")).toBe(true);
  });

  it("rejects invalid date", async () => {
    const dto = plainToInstance(ListAuditLogsQuery, { from: "not-a-date" });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "from")).toBe(true);
  });

  it("treats blank action as omitted", async () => {
    const dto = plainToInstance(ListAuditLogsQuery, { action: "  " });
    expect(dto.action).toBeUndefined();
    expect(await validate(dto)).toEqual([]);
  });
});

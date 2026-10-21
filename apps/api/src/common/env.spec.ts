import { describe, expect, it } from "vitest";
import { assertRequiredEnv } from "./env";

describe("assertRequiredEnv", () => {
  it("throws listing missing keys", () => {
    expect(() => assertRequiredEnv({})).toThrow(
      /Missing required env: DATABASE_URL, JWT_USER_SECRET, JWT_ADMIN_SECRET/,
    );
  });

  it("ignores blank values", () => {
    expect(() =>
      assertRequiredEnv({
        DATABASE_URL: "  ",
        JWT_USER_SECRET: "s",
        JWT_ADMIN_SECRET: "a",
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it("passes when all three are present", () => {
    expect(() =>
      assertRequiredEnv({
        DATABASE_URL: "postgresql://localhost/activity",
        JWT_USER_SECRET: "u",
        JWT_ADMIN_SECRET: "a",
      }),
    ).not.toThrow();
  });
});

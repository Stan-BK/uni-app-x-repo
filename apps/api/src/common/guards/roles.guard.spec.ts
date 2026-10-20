import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RolesGuard } from "./roles.guard";

function mockContext(role?: string): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => (role ? { admin: { adminId: "a1", role } } : {}),
    }),
  } as ExecutionContext;
}

describe("RolesGuard", () => {
  const reflector = { getAllAndOverride: vi.fn() };
  let guard: RolesGuard;

  beforeEach(() => {
    vi.clearAllMocks();
    guard = new RolesGuard(reflector as unknown as Reflector);
    reflector.getAllAndOverride.mockReturnValue(["admin"]);
  });

  it("allows admin", () => {
    expect(guard.canActivate(mockContext("admin"))).toBe(true);
  });

  it("forbids operator", () => {
    expect(() => guard.canActivate(mockContext("operator"))).toThrow(
      ForbiddenException,
    );
  });

  it("forbids missing role", () => {
    expect(() => guard.canActivate(mockContext())).toThrow(ForbiddenException);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SubscribeMessageScanner } from "./subscribe-message.scanner";

describe("SubscribeMessageScanner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VITEST", "");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("skips a tick while the previous scan is still running", async () => {
    let release!: () => void;
    const scan = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const scanner = new SubscribeMessageScanner({ scan } as never);
    scanner.onModuleInit();

    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(scan).toHaveBeenCalledTimes(1);

    release();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(scan).toHaveBeenCalledTimes(2);

    release();
    scanner.onModuleDestroy();
  });
});

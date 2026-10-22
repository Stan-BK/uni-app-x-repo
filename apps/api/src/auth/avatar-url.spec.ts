import { describe, expect, it } from "vitest";
import { isAllowedAvatarUrl } from "./avatar-url";

describe("isAllowedAvatarUrl", () => {
  it("accepts this service avatar path", () => {
    expect(
      isAllowedAvatarUrl("http://192.168.1.3:3000/api/uploads/avatars/a.jpg"),
    ).toBe(true);
    expect(
      isAllowedAvatarUrl("https://example.com/api/uploads/avatars/a.webp"),
    ).toBe(true);
  });

  it("rejects temp, cover, and traversal paths", () => {
    expect(isAllowedAvatarUrl("wxfile://tmp_a.png")).toBe(false);
    expect(isAllowedAvatarUrl("http://tmp/foo.png")).toBe(false);
    expect(
      isAllowedAvatarUrl("http://192.168.1.3:3000/api/uploads/covers/a.jpg"),
    ).toBe(false);
    expect(
      isAllowedAvatarUrl(
        "http://192.168.1.3:3000/api/uploads/avatars/../covers/a.jpg",
      ),
    ).toBe(false);
    expect(isAllowedAvatarUrl("not-a-url")).toBe(false);
    expect(isAllowedAvatarUrl("")).toBe(false);
  });
});

import { SubscribeMessageKind } from "@activity/shared";
import { describe, expect, it } from "vitest";
import { buildSubscribeData } from "./subscribe-message.payload";

describe("buildSubscribeData", () => {
  it("truncates title and place to 20 code units and maps status", () => {
    const data = buildSubscribeData({
      kind: SubscribeMessageKind.RegistrationConfirmed,
      title: "一二三四五六七八九十abcdefghijk",
      startAt: new Date("2030-06-01T04:05:00.000Z"),
      place: "",
    });
    expect(data.thing1.value).toHaveLength(20);
    expect(data.thing3.value).toBe("地点待定");
    expect(data.phrase4.value).toBe("报名成功");
    expect(data.time2.value).toContain("年");
  });

  it("uses 即将开始 for activity_starting", () => {
    const data = buildSubscribeData({
      kind: SubscribeMessageKind.ActivityStarting,
      title: "夜跑",
      startAt: null,
      place: "滨江",
    });
    expect(data.phrase4.value).toBe("即将开始");
    expect(data.time2.value).toBe("时间待定");
    expect(data.thing3.value).toBe("滨江");
  });
});

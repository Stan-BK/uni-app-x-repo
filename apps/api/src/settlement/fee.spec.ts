import { describe, expect, it } from "vitest";
import { settlementAmounts } from "./fee";

describe("settlementAmounts", () => {
  it("rounds half up to cents", () => {
    expect(settlementAmounts(1001, 0, 150)).toEqual({
      collectedCents: 1001,
      feeCents: 15,
      netCents: 986,
    });
  });

  it("treats null and negative bps as 0", () => {
    expect(settlementAmounts(500, 100, null).feeCents).toBe(0);
    expect(settlementAmounts(500, 0, -1).netCents).toBe(500);
  });

  it("caps bps at 10000 and never returns a negative net", () => {
    expect(settlementAmounts(200, 50, 20000)).toEqual({
      collectedCents: 150,
      feeCents: 150,
      netCents: 0,
    });
  });
});

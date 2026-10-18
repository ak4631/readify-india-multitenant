import { describe, expect, it } from "vitest";
import { launchPlansReady } from "@/lib/launch-plans";
describe("Library publication plan requirements", () => {
  const flex = {
    isFlexible: true,
    durationUnit: "HOURS",
    durationValue: 1,
    dailyHours: 2,
    dailyStart: null,
  };
  const monthly = {
    isFlexible: false,
    durationUnit: "MONTHS",
    durationValue: 1,
    dailyHours: 2,
    dailyStart: "08:00",
  };
  const quarterly = { ...monthly, durationValue: 3 };
  const yearly = { ...monthly, durationUnit: "YEARS" };
  it("requires all launch products rather than treating any one plan as complete", () => {
    expect(launchPlansReady([flex, monthly, yearly])).toBe(false);
    expect(launchPlansReady([flex, monthly, quarterly, yearly])).toBe(true);
  });
  it("does not accept a subscription without its owner-defined daily window", () => {
    expect(
      launchPlansReady([
        flex,
        { ...monthly, dailyStart: null },
        quarterly,
        yearly,
      ]),
    ).toBe(false);
  });
});

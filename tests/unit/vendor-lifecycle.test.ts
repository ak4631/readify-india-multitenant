import { describe, expect, it } from "vitest";
import { assertTransition, canTransition } from "@/lib/vendor-lifecycle";

describe("vendor lifecycle", () => {
  it("allows the documented happy path", () => {
    expect(canTransition("DRAFT", "SUBMITTED")).toBe(true);
    expect(canTransition("SUBMITTED", "UNDER_REVIEW")).toBe(true);
    expect(canTransition("UNDER_REVIEW", "APPROVED")).toBe(true);
    expect(canTransition("APPROVED", "PUBLISHED")).toBe(true);
    expect(canTransition("PUBLISHED", "SUSPENDED")).toBe(true);
  });

  it("allows rejection from under review back to draft", () => {
    expect(canTransition("UNDER_REVIEW", "REJECTED")).toBe(true);
    expect(canTransition("REJECTED", "DRAFT")).toBe(true);
  });

  it("rejects skipping states", () => {
    expect(canTransition("DRAFT", "APPROVED")).toBe(false);
    expect(canTransition("DRAFT", "PUBLISHED")).toBe(false);
    expect(canTransition("SUBMITTED", "PUBLISHED")).toBe(false);
  });

  it("treats suspended as terminal", () => {
    expect(canTransition("SUSPENDED", "PUBLISHED")).toBe(false);
    expect(canTransition("SUSPENDED", "DRAFT")).toBe(false);
  });

  it("assertTransition throws on an invalid transition", () => {
    expect(() => assertTransition("DRAFT", "APPROVED")).toThrow(
      /Invalid vendor status transition/,
    );
  });

  it("assertTransition does not throw on a valid transition", () => {
    expect(() => assertTransition("DRAFT", "SUBMITTED")).not.toThrow();
  });
});

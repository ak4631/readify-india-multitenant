import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  captureDisposition,
  refundEligible,
  validSignature,
} from "@/lib/payment-policy";

describe("payment and cancellation boundaries", () => {
  const start = new Date("2030-01-01T10:00:00Z");
  it("refunds customer cancellations strictly before the reserved start", () => {
    expect(
      refundEligible(start, new Date(start.getTime() - 1), "customer"),
    ).toBe(true);
    expect(refundEligible(start, start, "customer")).toBe(false);
    expect(
      refundEligible(start, new Date(start.getTime() + 1), "customer"),
    ).toBe(false);
  });
  it("refunds partner cancellations even after the start", () => {
    expect(refundEligible(start, new Date("2030-01-02"), "partner")).toBe(true);
  });
  it("does not reactivate expired or cancelled holds on late capture", () => {
    expect(
      captureDisposition("CREATED", start, new Date(start.getTime() - 1)),
    ).toBe("confirm");
    expect(captureDisposition("CREATED", start, start)).toBe("refund");
    expect(
      captureDisposition("CANCELLED", start, new Date(start.getTime() - 1)),
    ).toBe("refund");
    expect(captureDisposition("CAPTURED", start, start)).toBe("unchanged");
    expect(captureDisposition("REFUNDED", start, start)).toBe("unchanged");
  });
  it("authenticates the original webhook bytes and rejects tampering or malformed signatures", () => {
    const raw = '{"event":"payment.captured"}';
    const signature = createHmac("sha256", "test-secret")
      .update(raw)
      .digest("hex");
    expect(validSignature(raw, signature, "test-secret")).toBe(true);
    expect(validSignature(`${raw} `, signature, "test-secret")).toBe(false);
    expect(validSignature(raw, "invalid", "test-secret")).toBe(false);
    expect(validSignature(raw, "00".repeat(32), "test-secret")).toBe(false);
  });
});

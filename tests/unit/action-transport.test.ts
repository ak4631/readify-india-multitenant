import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { PublicActionError } from "@/lib/public-action-error";
vi.mock("next/navigation", () => ({
  unstable_rethrow: (error: unknown) => {
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      String(error.digest).startsWith("NEXT_REDIRECT")
    )
      throw error;
  },
}));
import { invokeAction } from "@/server/actions/invoke.actions";
import { getActionErrorMessage } from "@/lib/action-error-message";
import { MAX_UPLOAD_SIZE_BYTES, validateUploadFile } from "@/lib/upload-limits";

describe("server action error transport", () => {
  it("returns intended business failures as serializable data", async () => {
    const response = await invokeAction(async () => {
      throw new PublicActionError("Verify the owner ID before approval.");
    }, []);
    expect(response).toEqual({
      success: false,
      message: "Verify the owner ID before approval.",
    });
  });
  it("recognizes business errors constructed by a separately loaded bundle", async () => {
    vi.resetModules();
    const { PublicActionError: OtherBundleError } =
      await import("@/lib/public-action-error");
    const error = new OtherBundleError("Resolve the document status first.");
    expect(error).not.toBeInstanceOf(PublicActionError);
    expect(
      await invokeAction(async () => {
        throw error;
      }, []),
    ).toEqual({
      success: false,
      message: "Resolve the document status first.",
    });
  });
  it("returns input validation details without a production exception", async () => {
    const result = await invokeAction(
      async () =>
        z
          .object({ name: z.string().min(2, "Enter a plan name.") })
          .parse({ name: "" }),
      [],
    );
    expect(result).toEqual({ success: false, message: "Enter a plan name." });
  });
  it("logs an unexpected failure with a reference without exposing its contents", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const error = new Error("private database connection details");
      const response = await invokeAction(async () => {
        throw error;
      }, []);
      expect(response.success).toBe(false);
      if (response.success) throw Error("Expected failure");
      expect(response.message).not.toContain("private database");
      const reference = response.message.match(
        /[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/,
      )?.[0];
      expect(reference).toBeTruthy();
      expect(log).toHaveBeenCalledWith("Server action failed", {
        reference,
        error,
      });
    } finally {
      log.mockRestore();
    }
  });
  it("preserves successful results and dates, normalizing nested Prisma decimals", async () => {
    const date = new Date("2026-11-13T00:00:00Z");
    expect(
      await invokeAction(
        async (id: string) => ({
          id,
          date,
          plans: [{ price: new Prisma.Decimal("1400.50") }],
        }),
        ["plan"],
      ),
    ).toEqual({
      success: true,
      value: { id: "plan", date, plans: [{ price: 1400.5 }] },
    });
  });
  it("preserves framework redirects", async () => {
    const redirect = Object.assign(new Error("redirect"), {
      digest: "NEXT_REDIRECT;replace;/login;307;",
    });
    await expect(
      invokeAction(async () => {
        throw redirect;
      }, []),
    ).rejects.toBe(redirect);
  });
});

describe("error messages and upload boundaries", () => {
  it.each([
    { status: 413 },
    { statusCode: 413 },
    { message: "Body exceeded 1 MB limit" },
    { message: "FUNCTION_PAYLOAD_TOO_LARGE" },
  ])("explains oversized requests: %j", (error) => {
    expect(getActionErrorMessage(error)).toContain("4 MB or less");
  });
  it("replaces React's redacted error with a readable message and its reference", () => {
    const message = getActionErrorMessage({
      message: "Minified React error #441",
      digest: "1955996324@E394",
    });
    expect(message).not.toContain("441");
    expect(message).toContain("1955996324@E394");
  });
  it("handles a transport outage without discarding a legitimate message", () => {
    expect(getActionErrorMessage(new TypeError("Failed to fetch"))).toContain(
      "connection",
    );
    expect(
      getActionErrorMessage(
        new Error("The daily window must fit every open day."),
      ),
    ).toBe("The daily window must fit every open day.");
  });
  it("accepts files larger than the old limit and rejects files beyond the hosting-safe limit", () => {
    expect(
      validateUploadFile(
        new File([new Uint8Array(2 * 1024 * 1024)], "proof.pdf", {
          type: "application/pdf",
        }),
        ["application/pdf"],
      ),
    ).toBeNull();
    expect(
      validateUploadFile(
        new File([new Uint8Array(MAX_UPLOAD_SIZE_BYTES)], "proof.pdf", {
          type: "application/pdf",
        }),
        ["application/pdf"],
      ),
    ).toBeNull();
    expect(
      validateUploadFile(
        new File([new Uint8Array(MAX_UPLOAD_SIZE_BYTES + 1)], "proof.pdf", {
          type: "application/pdf",
        }),
        ["application/pdf"],
      ),
    ).toContain("4 MB");
  });
});

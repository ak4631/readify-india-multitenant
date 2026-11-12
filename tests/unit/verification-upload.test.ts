import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VendorStatus } from "@/generated/prisma/enums";
import { canUploadVerificationDocuments } from "@/lib/verification-upload-policy";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  superAdmin: vi.fn(),
  listing: vi.fn(),
  lock: vi.fn(),
  queue: vi.fn(),
  upload: vi.fn(),
  audit: vi.fn(),
  revalidate: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  rolledBack: vi.fn(),
  tx: {
    listingRevision: { update: vi.fn() },
    listingChange: { create: vi.fn() },
  },
}));
vi.mock("@/lib/rbac", () => ({
  requireVendorAccess: mocks.authorize,
  requireSuperAdminPermission: mocks.superAdmin,
}));
vi.mock("@/lib/listing-changes", async (original) => ({
  ...(await original<typeof import("@/lib/listing-changes")>()),
  lockListing: mocks.lock,
  queueListingChange: mocks.queue,
}));
vi.mock("@/lib/imagekit", () => ({
  uploadVendorDocument: mocks.upload,
  getSignedDocumentUrl: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: mocks.audit }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    vendor: { findUniqueOrThrow: mocks.listing },
    vendorVerification: { update: mocks.update },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      try {
        return await callback({
          ...mocks.tx,
          vendorVerification: { create: mocks.create },
        });
      } catch (error) {
        mocks.rolledBack();
        throw error;
      }
    },
  },
}));
import {
  uploadVerificationDocument,
  reviewVerificationDocument,
} from "@/server/actions/vendor-verification.actions";

function uploadData(
  type = "ADDRESS_PROOF",
  file = new File(["example"], "proof.pdf", { type: "application/pdf" }),
) {
  const data = new FormData();
  data.set("vendorId", "listing");
  data.set("documentType", type);
  data.set("file", file);
  return data;
}

describe("private verification uploads independent of listing revisions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({ user: { id: "partner" } });
    mocks.listing.mockResolvedValue({ status: "PUBLISHED" });
    mocks.lock.mockResolvedValue({ status: "PUBLISHED", partnerId: "org" });
    mocks.upload.mockResolvedValue("private-file-reference");
    mocks.create.mockResolvedValue({
      id: "document",
      vendorId: "listing",
      status: "PENDING",
    });
    mocks.audit.mockResolvedValue(undefined);
  });

  it.each(["ADDRESS_PROOF", "OWNER_ID"])(
    "makes %s available for verification without altering a submitted plan revision",
    async (type) => {
      expect(await uploadVerificationDocument(uploadData(type))).toEqual({
        ok: true,
      });
      expect(mocks.authorize).toHaveBeenCalledWith(
        "listing",
        "verification.upload",
      );
      expect(mocks.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          vendorId: "listing",
          documentType: type,
          status: "PENDING",
          documentUrl: "private-file-reference",
        }),
      });
      expect(mocks.queue).not.toHaveBeenCalled();
      expect(mocks.tx.listingRevision.update).not.toHaveBeenCalled();
      expect(mocks.tx.listingChange.create).not.toHaveBeenCalled();
      expect(mocks.audit).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: "UPLOAD_VERIFICATION_DOCUMENT",
          partnerId: "org",
          entityId: "document",
        }),
      );
      expect(mocks.revalidate).toHaveBeenCalledWith("/vendors/listing");
      expect(mocks.revalidate).toHaveBeenCalledWith("/approvals");
    },
  );

  it.each(["SUBMITTED", "UNDER_REVIEW"])(
    "preserves the immutable initial submission while %s",
    async (status) => {
      mocks.listing.mockResolvedValue({ status });
      expect(await uploadVerificationDocument(uploadData())).toEqual({
        ok: false,
        message: expect.stringContaining("initial submission"),
      });
      expect(mocks.upload).not.toHaveBeenCalled();
      expect(mocks.create).not.toHaveBeenCalled();
    },
  );

  it("rechecks the initial review freeze after acquiring the write lock", async () => {
    mocks.lock.mockResolvedValue({ status: "UNDER_REVIEW", partnerId: "org" });
    expect(await uploadVerificationDocument(uploadData())).toEqual({
      ok: false,
      message: expect.stringContaining("initial submission"),
    });
    expect(mocks.rolledBack).toHaveBeenCalledOnce();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("denies unauthorized uploads before sending a file to storage", async () => {
    mocks.authorize.mockRejectedValue(new Error("Access denied"));
    await expect(uploadVerificationDocument(uploadData())).rejects.toThrow(
      "Access denied",
    );
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects invalid files before storage", async () => {
    expect(
      (
        await uploadVerificationDocument(
          uploadData(
            "OWNER_ID",
            new File(["text"], "bad.txt", { type: "text/plain" }),
          ),
        )
      ).ok,
    ).toBe(false);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("rolls back a document if the audit write fails", async () => {
    mocks.audit.mockRejectedValue(new Error("audit unavailable"));
    await expect(uploadVerificationDocument(uploadData())).rejects.toThrow(
      "audit unavailable",
    );
    expect(mocks.rolledBack).toHaveBeenCalledOnce();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("still requires Super Admin permission to verify an upload", async () => {
    mocks.superAdmin.mockRejectedValue(new Error("Super Admin required"));
    await expect(
      reviewVerificationDocument({
        verificationId: "document",
        decision: "VERIFIED",
      }),
    ).rejects.toThrow("Super Admin required");
    expect(mocks.superAdmin).toHaveBeenCalledWith("verification.review");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each([
    "DRAFT",
    "APPROVED",
    "PUBLISHED",
    "SUSPENDED",
    "REJECTED",
  ] as VendorStatus[])(
    "allows the Documents form for %s listings",
    (status) => {
      expect(canUploadVerificationDocuments(status)).toBe(true);
    },
  );
});

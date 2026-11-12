import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/server/actions/invoke.actions", () => ({
  invokeAction: mocks.invoke,
}));
import { actionClient } from "@/lib/action-client";
import { MAX_UPLOAD_SIZE_BYTES } from "@/lib/upload-limits";
beforeEach(() => vi.clearAllMocks());
it("preserves action arguments and success values", async () => {
  const action = vi.fn(async (id: string) => ({ id }));
  mocks.invoke.mockResolvedValue({ success: true, value: { id: "result" } });
  expect(await actionClient(action)("id")).toEqual({ id: "result" });
  expect(mocks.invoke).toHaveBeenCalledWith(action, ["id"]);
});
it("throws a local readable error so existing forms cannot report false success", async () => {
  mocks.invoke.mockResolvedValue({
    success: false,
    message: "This revision is awaiting review.",
  });
  await expect(actionClient(async () => undefined)()).rejects.toThrow(
    "This revision is awaiting review.",
  );
});
it("blocks oversized files before making a server request", async () => {
  const data = new FormData();
  data.set(
    "file",
    new File([new Uint8Array(MAX_UPLOAD_SIZE_BYTES + 1)], "proof.pdf", {
      type: "application/pdf",
    }),
  );
  await expect(
    actionClient(async (form: FormData) => form.get("file"))(data),
  ).rejects.toThrow("4 MB");
  expect(mocks.invoke).not.toHaveBeenCalled();
});
it("normalizes request failures that occur before the action executes", async () => {
  mocks.invoke.mockRejectedValue(
    Object.assign(new Error("Request failed"), { statusCode: 413 }),
  );
  await expect(actionClient(async () => undefined)()).rejects.toThrow(
    "4 MB or less",
  );
});

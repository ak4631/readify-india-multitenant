import { beforeEach, afterEach, expect, it, vi } from "vitest";
const s = vi.hoisted(() => ({ decode: vi.fn() }));
vi.mock("jsqr", () => ({ default: s.decode }));
import { startQrCamera, cameraErrorMessage } from "@/lib/qr-camera";
const stop = vi.fn();
const getUserMedia = vi.fn();
const tracks = () =>
  ({ getTracks: () => [{ stop }] }) as unknown as MediaStream;
const video = () =>
  ({
    srcObject: null,
    play: vi.fn(async () => {}),
    readyState: 2,
    videoWidth: 2,
    videoHeight: 2,
  }) as unknown as HTMLVideoElement;
const flush = async () => {
  await vi.dynamicImportSettled();
  await Promise.resolve();
  await Promise.resolve();
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal("window", { isSecureContext: true });
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  vi.stubGlobal("document", {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: vi.fn(),
        getImageData: () => ({
          data: new Uint8ClampedArray(16),
          width: 2,
          height: 2,
        }),
      }),
    }),
  });
  getUserMedia.mockResolvedValue(tracks());
  s.decode.mockReturnValue(null);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("delivers a decoded subscription QR once and releases the camera immediately", async () => {
  s.decode.mockReturnValue({ data: " subscription:123 " });
  const scanned = vi.fn();
  const failed = vi.fn();
  const preview = video();
  const cleanup = startQrCamera(preview, scanned, failed);
  await flush();
  expect(scanned).toHaveBeenCalledExactlyOnceWith("subscription:123");
  expect(stop).toHaveBeenCalledOnce();
  expect(preview.srcObject).toBe(null);
  await vi.advanceTimersByTimeAsync(1000);
  expect(scanned).toHaveBeenCalledOnce();
  cleanup();
});
it("stops a camera granted after the scanner has closed without scanning", async () => {
  let resolve: (stream: MediaStream) => void = () => {};
  getUserMedia.mockImplementation(
    () =>
      new Promise<MediaStream>((done) => {
        resolve = done;
      }),
  );
  const scanned = vi.fn();
  const cleanup = startQrCamera(video(), scanned, vi.fn());
  await flush();
  cleanup();
  resolve(tracks());
  await flush();
  expect(stop).toHaveBeenCalledOnce();
  expect(scanned).not.toHaveBeenCalled();
});
it("explains camera permission denial and keeps manual entry available", async () => {
  getUserMedia.mockRejectedValue(new DOMException("Denied", "NotAllowedError"));
  const error = vi.fn();
  startQrCamera(video(), vi.fn(), error);
  await flush();
  expect(error).toHaveBeenCalledWith(expect.stringContaining("Booking ID"));
});
it("releases an active camera and cancels subsequent scans on cleanup", async () => {
  const scanned = vi.fn();
  const preview = video();
  const cleanup = startQrCamera(preview, scanned, vi.fn());
  await flush();
  expect(s.decode).toHaveBeenCalledOnce();
  cleanup();
  await vi.advanceTimersByTimeAsync(1000);
  expect(s.decode).toHaveBeenCalledOnce();
  expect(stop).toHaveBeenCalledOnce();
  expect(preview.srcObject).toBe(null);
});
it("rejects oversized non-booking QR values without calling the booking action", async () => {
  s.decode.mockReturnValue({ data: "x".repeat(101) });
  const scanned = vi.fn();
  const error = vi.fn();
  startQrCamera(video(), scanned, error);
  await flush();
  expect(scanned).not.toHaveBeenCalled();
  expect(error).toHaveBeenCalledWith(
    expect.stringContaining("not a booking code"),
  );
  expect(stop).toHaveBeenCalledOnce();
});
it("provides an actionable message when no camera is available", () => {
  expect(
    cameraErrorMessage(new DOMException("Missing", "NotFoundError")),
  ).toContain("Booking ID");
});

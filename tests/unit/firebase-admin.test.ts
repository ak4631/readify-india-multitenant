import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  cert: vi.fn(),
  adc: vi.fn(),
  apps: vi.fn(),
  initialize: vi.fn(),
  messaging: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("firebase-admin/app", () => ({
  cert: mocks.cert,
  applicationDefault: mocks.adc,
  getApps: mocks.apps,
  initializeApp: mocks.initialize,
}));
vi.mock("firebase-admin/messaging", () => ({ getMessaging: mocks.messaging }));
import { firebasePushMessaging } from "@/lib/firebase-admin";
beforeEach(() => {
  vi.clearAllMocks();
  for (const name of [
    "FIREBASE_PROJECT_ID",
    "FIREBASE_CLIENT_EMAIL",
    "FIREBASE_PRIVATE_KEY",
    "FIREBASE_USE_APPLICATION_DEFAULT_CREDENTIALS",
  ])
    vi.stubEnv(name, "");
  mocks.apps.mockReturnValue([]);
  mocks.cert.mockReturnValue({ kind: "certificate" });
  mocks.adc.mockReturnValue({ kind: "adc" });
  mocks.initialize.mockReturnValue({ name: "zerotham-push" });
  mocks.messaging.mockReturnValue({ send: vi.fn() });
});
afterEach(() => vi.unstubAllEnvs());
function credentials(key = "line-one\\nline-two") {
  vi.stubEnv("FIREBASE_PROJECT_ID", "zerotham");
  vi.stubEnv("FIREBASE_CLIENT_EMAIL", "service@example.test");
  vi.stubEnv("FIREBASE_PRIVATE_KEY", key);
}
it("initializes from separate environment credentials and normalizes escaped newlines", () => {
  credentials();
  firebasePushMessaging();
  expect(mocks.cert).toHaveBeenCalledWith({
    projectId: "zerotham",
    clientEmail: "service@example.test",
    privateKey: "line-one\nline-two",
  });
  expect(mocks.adc).not.toHaveBeenCalled();
});
it("preserves actual multiline keys", () => {
  credentials("line-one\nline-two");
  firebasePushMessaging();
  expect(mocks.cert).toHaveBeenCalledWith(
    expect.objectContaining({ privateKey: "line-one\nline-two" }),
  );
});
it("rejects incomplete credentials instead of falling back to a file", () => {
  vi.stubEnv("FIREBASE_CLIENT_EMAIL", "service@example.test");
  expect(firebasePushMessaging).toThrow(/requires FIREBASE_PROJECT_ID/);
  expect(mocks.adc).not.toHaveBeenCalled();
});
it("does not expose credential values through validation errors", () => {
  credentials();
  mocks.cert.mockImplementationOnce(() => {
    throw new Error("sensitive private key material");
  });
  expect(firebasePushMessaging).toThrow(
    "Firebase Admin environment credentials are invalid",
  );
});
it("reports unconfigured when no environment credentials or workload identity are provided", () => {
  vi.stubEnv("FIREBASE_PROJECT_ID", "zerotham");
  expect(firebasePushMessaging()).toBeNull();
  expect(mocks.initialize).not.toHaveBeenCalled();
});
it("supports explicitly enabled workload identity", () => {
  vi.stubEnv("FIREBASE_USE_APPLICATION_DEFAULT_CREDENTIALS", "true");
  firebasePushMessaging();
  expect(mocks.adc).toHaveBeenCalled();
  expect(mocks.cert).not.toHaveBeenCalled();
});
it("reuses an initialized Firebase app", () => {
  credentials();
  mocks.apps.mockReturnValue([{ name: "zerotham-push" }]);
  firebasePushMessaging();
  expect(mocks.initialize).not.toHaveBeenCalled();
  expect(mocks.cert).not.toHaveBeenCalled();
});

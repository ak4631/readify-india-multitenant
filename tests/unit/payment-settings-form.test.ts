import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/action-client", () => ({
  actionClient: (action: unknown) => action,
}));
vi.mock("@/server/actions/payment-settings.actions", () => ({
  savePaymentSettings: vi.fn(),
}));
import { PaymentSettingsForm } from "@/components/subscriptions/payment-settings-form";

it("renders Save as a native submit button so clicking it reaches the form handler", () => {
  const html = renderToStaticMarkup(
    createElement(PaymentSettingsForm, {
      initial: {
        onlineEnabled: false,
        offlineEnabled: true,
        offlineHoldHours: 24,
      },
    }),
  );
  const save = html.match(/<button\b[^>]*>Save payment options<\/button>/)?.[0];
  expect(save).toBeDefined();
  expect(save).toContain('type="submit"');
  expect(save).not.toMatch(/\sdisabled(?:=|\s|>)/);
});

it("keeps Save disabled if both payment methods are turned off", () => {
  const html = renderToStaticMarkup(
    createElement(PaymentSettingsForm, {
      initial: {
        onlineEnabled: false,
        offlineEnabled: false,
        offlineHoldHours: 24,
      },
    }),
  );
  const save = html.match(/<button\b[^>]*>Save payment options<\/button>/)?.[0];
  expect(save).toMatch(/\sdisabled(?:=|\s|>)/);
  expect(html).toContain("Keep at least one payment method enabled.");
});

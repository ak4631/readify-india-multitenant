"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { actionClient } from "@/lib/action-client";
import {
  createMarketingCampaign as serverAction_createMarketingCampaign,
  cancelMarketingCampaign as serverAction_cancelMarketingCampaign,
  previewMarketingAudience as serverAction_previewMarketingAudience,
} from "@/server/actions/marketing.actions";
const preview = actionClient(serverAction_previewMarketingAudience);
const create = actionClient(serverAction_createMarketingCampaign);
const cancel = actionClient(serverAction_cancelMarketingCampaign);
type Campaign = {
  id: string;
  title: string;
  body: string;
  status: string;
  scheduledAt: string;
  queuedAt: string | null;
  recipientCount: number;
  targetCity: string | null;
  targetArea: string | null;
  targetService: string | null;
};
export function CampaignManager({
  campaigns,
  listings,
  services,
  initialAudience,
}: {
  initialAudience: { recipients: number; pushUsers: number };
  campaigns: Campaign[];
  listings: { id: string; name: string }[];
  services: { id: string; name: string }[];
}) {
  const [pending, start] = useTransition();
  const [mode, setMode] = useState("now");
  const [destination, setDestination] = useState("none");
  const formRef = useRef<HTMLFormElement>(null);
  const [audience, setAudience] = useState<typeof initialAudience | null>(
    initialAudience,
  );
  const [version, setVersion] = useState(0);
  const router = useRouter();
  const input = "mt-1 w-full rounded-lg border bg-background p-3";
  const button =
    "rounded-lg bg-primary px-4 py-3 text-primary-foreground disabled:opacity-50";
  function run(action: () => Promise<void>, success?: string) {
    start(async () => {
      try {
        await action();
        if (success) toast.success(success);
        router.refresh();
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Could not update campaign",
        );
      }
    });
  }
  return (
    <div className="space-y-8">
      <form
        key={version}
        ref={formRef}
        onChange={(event) => {
          const target = event.target;
          const name =
            target instanceof HTMLInputElement ||
            target instanceof HTMLSelectElement
              ? target.name
              : "";
          if (["targetCity", "targetArea", "targetService"].includes(name))
            setAudience(null);
        }}
        className="grid gap-5 rounded-xl border p-5 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          for (const field of ["vendorId", "serviceCategory", "destinationUrl"])
            if (!form.has(field)) form.set(field, "");
          if (mode === "schedule")
            form.set(
              "scheduledAt",
              new Date(String(form.get("scheduledAt"))).toISOString(),
            );
          run(async () => {
            const receipt = await create(form);
            toast.success(
              receipt.status === "QUEUED"
                ? `One-time notification queued for ${receipt.recipientCount} active users`
                : "One-time notification scheduled",
            );
            if (receipt.pushStatus === "unavailable")
              toast.message(
                "Notification is available in app inboxes. Push delivery is not configured on this server.",
              );
            if (receipt.pushStatus === "pending")
              toast.message(
                "Notification is available in app inboxes. Device delivery will retry through the background worker.",
              );
            setVersion((v) => v + 1);
            setAudience(initialAudience);
          });
        }}
      >
        <h2 className="text-lg font-semibold md:col-span-2">
          New promotional notification
        </h2>
        <label>
          Title
          <input
            className={input}
            name="title"
            required
            minLength={3}
            maxLength={150}
          />
        </label>
        <label>
          Image (optional, JPG / PNG / WEBP, up to 4 MB)
          <input
            className={input}
            name="file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
          />
        </label>
        <label className="md:col-span-2">
          Message / offer details
          <textarea
            className={input}
            name="body"
            required
            minLength={3}
            maxLength={1000}
            rows={3}
          />
        </label>
        <label>
          Tap destination (optional)
          <select
            className={input}
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          >
            <option value="none">Notification inbox — no link</option>
            <option value="listing">Listing</option>
            <option value="service">Service</option>
            <option value="offer">Offer page (HTTPS link)</option>
          </select>
        </label>
        {destination === "listing" ? (
          <label>
            Listing
            <select className={input} name="vendorId" required>
              <option value="">Choose a listing</option>
              {listings.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        ) : destination === "service" ? (
          <label>
            Service
            <select className={input} name="serviceCategory" required>
              <option value="">Choose a service</option>
              {services
                .filter((s) =>
                  ["library", "gym", "co_working_space", "exam_hub"].includes(
                    s.id,
                  ),
                )
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </label>
        ) : destination === "offer" ? (
          <label>
            Offer URL
            <input
              className={input}
              name="destinationUrl"
              type="url"
              placeholder="https://…"
              required
            />
          </label>
        ) : null}
        <h3 className="font-semibold md:col-span-2">
          Audience — all active users by default
        </h3>
        <label>
          City
          <input
            className={input}
            name="targetCity"
            maxLength={100}
            placeholder="All cities"
          />
        </label>
        <label>
          Area
          <input
            className={input}
            name="targetArea"
            maxLength={100}
            placeholder="All areas in selected city"
          />
        </label>
        <label>
          Relevant service
          <select className={input} name="targetService">
            <option value="">All customers</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <p className="self-center text-sm text-muted-foreground">
          Filters combine. City and area match saved address segments. Service
          matches customers with a captured purchase in that service. Leave
          filters blank to reach all active app users, including users without
          bookings.
        </p>
        <div className="space-y-2 md:col-span-2" aria-live="polite">
          <p>
            {audience
              ? `${audience.recipients} active users match · ${audience.pushUsers} with push-enabled devices`
              : "Audience filters changed. Check matching users for the current count."}
          </p>
          <button
            type="button"
            disabled={pending}
            className="rounded-lg border px-3 py-2 disabled:opacity-50"
            onClick={() =>
              run(async () => {
                if (formRef.current)
                  setAudience(await preview(new FormData(formRef.current)));
              })
            }
          >
            Check matching users
          </button>
          <p className="text-sm text-muted-foreground">
            Every matching user receives this once in their app inbox. Push
            notifications require a registered device.
          </p>
        </div>
        <label>
          Delivery
          <select
            className={input}
            name="mode"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="now">Send now</option>
            <option value="schedule">Schedule once</option>
          </select>
        </label>
        {mode === "schedule" && (
          <label>
            Delivery date and time
            <input
              className={input}
              name="scheduledAt"
              type="datetime-local"
              required
            />
            <span className="text-xs text-muted-foreground">
              Uses your browser’s local timezone.
            </span>
          </label>
        )}
        <p className="text-sm text-muted-foreground md:col-span-2">
          {mode === "now"
            ? "Send now creates inbox notifications immediately and starts device delivery. It does not create a future schedule."
            : "The background job delivers this notification once at or after the selected time."}
        </p>
        <button className={button} type="submit" disabled={pending}>
          {pending
            ? "Saving…"
            : mode === "now"
              ? "Send notification"
              : "Schedule notification"}
        </button>
      </form>
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent campaigns</h2>
          <button
            type="button"
            className="text-sm underline"
            onClick={() => router.refresh()}
          >
            Refresh status
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          Queued means inbox notifications were created and device delivery is
          pending. Showing the latest 100 campaigns.
        </p>
        {!campaigns.length && <p>No promotional notifications yet.</p>}
        {campaigns.map((c) => (
          <article key={c.id} className="space-y-2 rounded-xl border p-5">
            <div className="flex justify-between gap-4">
              <h3 className="font-semibold">{c.title}</h3>
              <span className="text-sm">
                {c.status === "SCHEDULED"
                  ? "Scheduled once"
                  : c.status === "QUEUED"
                    ? "Queued once"
                    : "Cancelled"}
              </span>
            </div>
            <p className="whitespace-pre-wrap">{c.body}</p>
            <p className="text-sm text-muted-foreground">
              {c.status === "QUEUED" ? "Queued: " : "Delivery: "}
              {new Date(c.queuedAt ?? c.scheduledAt).toLocaleString()} ·{" "}
              {[c.targetCity, c.targetArea, c.targetService]
                .filter(Boolean)
                .join(" / ") || "All active customers"}{" "}
              · {c.recipientCount} recipients queued
            </p>
            {c.status === "SCHEDULED" && (
              <button
                type="button"
                disabled={pending}
                className="rounded-lg border px-3 py-2 disabled:opacity-50"
                onClick={() => run(() => cancel(c.id), "Campaign cancelled")}
              >
                Cancel campaign
              </button>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}

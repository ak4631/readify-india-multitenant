"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { PromotionalBanner } from "@/generated/prisma/client";
import { actionClient } from "@/lib/action-client";
import {
  savePromotionalBanner as serverAction_savePromotionalBanner,
  deactivatePromotionalBanner as serverAction_deactivatePromotionalBanner,
} from "@/server/actions/promotions.actions";
const save = actionClient(serverAction_savePromotionalBanner);
const deactivate = actionClient(serverAction_deactivatePromotionalBanner);
type Banner = Omit<
  PromotionalBanner,
  "startsAt" | "endsAt" | "createdAt" | "updatedAt"
> & { startsAt: string; endsAt: string; createdAt: string; updatedAt: string };
function localDate(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function PromotionManager({
  banners,
  listings,
}: {
  banners: Banner[];
  listings: { id: string; name: string }[];
}) {
  const [editing, setEditing] = useState<Banner | null>(null);
  const [version, setVersion] = useState(0);
  const [pending, start] = useTransition();
  const router = useRouter();
  function run(action: () => Promise<void>) {
    start(async () => {
      try {
        await action();
        toast.success("Banner updated");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not update banner");
      }
    });
  }
  const input = "w-full rounded-lg border bg-background p-3";
  const button =
    "rounded-lg bg-primary px-4 py-3 text-primary-foreground disabled:opacity-50";
  return (
    <div className="space-y-6">
      <form
        key={`${editing?.id ?? "new"}-${version}`}
        className="grid gap-4 rounded-xl border p-5 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          for (const field of ["startsAt", "endsAt"])
            form.set(field, new Date(String(form.get(field))).toISOString());
          run(async () => {
            await save(form);
            setEditing(null);
            setVersion((v) => v + 1);
          });
        }}
      >
        <h2 className="font-semibold md:col-span-2">
          {editing ? "Edit promotion" : "New promotion"}
        </h2>
        <input type="hidden" name="id" value={editing?.id ?? ""} />
        <label>
          Title / accessible image description
          <input
            className={input}
            name="title"
            defaultValue={editing?.title}
            minLength={3}
            maxLength={150}
            required
          />
        </label>
        <label>
          Banner image (JPG, PNG, WEBP, up to 4 MB)
          <input
            className={input}
            name="file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            required={!editing}
          />
        </label>
        <label>
          Destination listing
          <select
            className={input}
            name="vendorId"
            defaultValue={editing?.vendorId ?? ""}
          >
            <option value="">Use HTTPS link instead</option>
            {listings.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Or destination HTTPS link
          <input
            className={input}
            name="destinationUrl"
            type="url"
            placeholder="https://…"
            defaultValue={editing?.destinationUrl ?? ""}
          />
        </label>
        <label>
          Target city
          <input
            className={input}
            name="targetCity"
            defaultValue={editing?.targetCity ?? ""}
            maxLength={100}
            placeholder="All cities"
          />
        </label>
        <label>
          Target area
          <input
            className={input}
            name="targetArea"
            defaultValue={editing?.targetArea ?? ""}
            maxLength={100}
            placeholder="All areas in city"
          />
        </label>
        <p className="text-sm text-muted-foreground md:col-span-2">
          City and area match complete comma-separated parts of the customer&apos;s
          saved address. For a precise location, also set a map centre and
          radius. Leave all targeting fields empty for everyone.
        </p>
        {(
          [
            ["latitude", "Latitude", -90, 90],
            ["longitude", "Longitude", -180, 180],
            ["radiusKm", "Radius (km)", 0.1, 500],
          ] as const
        ).map(([name, label, min, max]) => (
          <label key={name}>
            {label}
            <input
              className={input}
              type="number"
              step="any"
              name={name}
              min={min}
              max={max}
              defaultValue={editing?.[name] ?? ""}
            />
          </label>
        ))}
        <label>
          Display priority (lowest first)
          <input
            className={input}
            type="number"
            name="sortOrder"
            min={0}
            max={10000}
            defaultValue={editing?.sortOrder ?? 0}
            required
          />
        </label>
        <label>
          Start (local time)
          <input
            className={input}
            name="startsAt"
            type="datetime-local"
            defaultValue={localDate(editing?.startsAt)}
            required
          />
        </label>
        <label>
          End (local time)
          <input
            className={input}
            name="endsAt"
            type="datetime-local"
            defaultValue={localDate(editing?.endsAt)}
            required
          />
        </label>
        <label>
          <input
            name="isActive"
            type="checkbox"
            defaultChecked={editing?.isActive ?? true}
          />{" "}
          Active
        </label>
        <div className="flex gap-3">
          <button disabled={pending} className={button}>
            Save promotion
          </button>
          {editing && (
            <button type="button" onClick={() => setEditing(null)}>
              Cancel
            </button>
          )}
        </div>
      </form>
      {!banners.length && <p>No promotions yet.</p>}
      {banners.map((b) => (
        <article
          key={b.id}
          className="flex flex-wrap items-center gap-4 rounded-xl border p-4"
        >
          {/* Uploaded images are public CDN assets; preserve their original banner ratio. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={b.imageUrl}
            alt={b.title}
            className="h-24 w-48 rounded-lg object-cover"
          />
          <div className="flex-1">
            <h3 className="font-semibold">{b.title}</h3>
            <p>
              {b.isActive ? "Active" : "Inactive"} ·{" "}
              {b.targetCity || "All cities"}
              {b.targetArea ? ` / ${b.targetArea}` : ""}
            </p>
            <p className="text-sm">
              {new Date(b.startsAt).toLocaleString()} –{" "}
              {new Date(b.endsAt).toLocaleString()}
            </p>
          </div>
          <button
            disabled={pending}
            className={button}
            onClick={() => setEditing(b)}
          >
            Edit
          </button>
          {b.isActive && (
            <button
              disabled={pending}
              className="rounded-lg border p-3"
              onClick={() => run(() => deactivate(b.id))}
            >
              Deactivate
            </button>
          )}
        </article>
      ))}
    </div>
  );
}

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Hallmark · pre-emit critique: P4 H4 E4 S4 R5 V3
export function RecordFilters({
  path,
  params,
  listings,
  statuses,
  searchPlaceholder,
  dateLabel = "Date",
}: {
  path: string;
  params: {
    partnerId?: string;
    q?: string;
    vendorId?: string;
    status?: string;
    date?: string;
  };
  listings: { id: string; name: string }[];
  statuses: { value: string; label: string }[];
  searchPlaceholder: string;
  dateLabel?: string;
}) {
  return (
    <form
      key={JSON.stringify(params)}
      action={path}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-muted/40 p-4"
    >
      {params.partnerId && (
        <input type="hidden" name="partnerId" value={params.partnerId} />
      )}
      <label className="min-w-0 flex-1 basis-56 space-y-1 text-sm font-medium">
        <span>Search</span>
        <Input
          name="q"
          placeholder={searchPlaceholder}
          defaultValue={params.q}
        />
      </label>
      <label className="min-w-0 flex-1 basis-44 space-y-1 text-sm font-medium">
        <span>Listing</span>
        <select
          name="vendorId"
          defaultValue={params.vendorId ?? ""}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All listings</option>
          {listings.map((listing) => (
            <option key={listing.id} value={listing.id}>
              {listing.name}
            </option>
          ))}
        </select>
      </label>
      <label className="min-w-0 flex-1 basis-40 space-y-1 text-sm font-medium">
        <span>Status</span>
        <select
          name="status"
          defaultValue={params.status ?? "all"}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          {statuses.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </select>
      </label>
      <label className="min-w-0 flex-1 basis-40 space-y-1 text-sm font-medium">
        <span>{dateLabel}</span>
        <Input type="date" name="date" defaultValue={params.date} />
      </label>
      <Button type="submit">Apply filters</Button>
      <Link
        href={path}
        className="inline-flex h-9 items-center whitespace-nowrap text-sm text-primary underline"
      >
        Clear filters
      </Link>
    </form>
  );
}

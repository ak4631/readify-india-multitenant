import Link from "next/link";
import { z } from "zod";
import { VendorStatus } from "@/generated/prisma/enums";
import { PageHeader } from "@/components/layout/page-header";
import { ListPagination } from "@/components/layout/list-pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VendorFilters } from "@/components/vendors/vendor-filters";
import { ServiceTable } from "@/components/vendors/service-table";
import { parsePage } from "@/lib/pagination";
import { partnerPath } from "@/lib/partner-path";
import { listVendorsPage } from "@/server/actions/vendors.actions";
import { listVendorCategories } from "@/server/actions/vendor-categories.actions";

export default async function ServiceManagement({
  searchParams,
}: {
  searchParams: Promise<{
    partnerId?: string;
    date?: string;
    page?: string;
    q?: string;
    categoryId?: string;
    status?: string;
    city?: string;
  }>;
}) {
  const params = await searchParams;
  const status = z.enum(VendorStatus).safeParse(params.status);
  const parsedDate = z.iso.date().safeParse(params.date);
  const date = parsedDate.success ? parsedDate.data : undefined;
  const [vendors, categories] = await Promise.all([
    listVendorsPage({
      partnerId: params.partnerId,
      q: params.q,
      categoryId: params.categoryId,
      status: status.success ? status.data : undefined,
      city: params.city,
      page: parsePage(params.page),
    }),
    listVendorCategories(),
  ]);
  const path = partnerPath(params.partnerId, "service-management");
  const filters = {
    ...params,
    date,
    status: status.success ? status.data : undefined,
  };
  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        title="Service management"
        description="Find a listing and open its service tools. View library availability on demand using the same reservation ledger as customer checkout."
      />
      <section className="min-w-0 space-y-4 rounded-xl border bg-card p-4 sm:p-6">
        <VendorFilters categories={categories} />
        <form
          action={path}
          key={date ?? "today"}
          className="flex flex-wrap items-end gap-3"
        >
          {Object.entries(filters)
            .filter(([key, value]) => !["date", "page"].includes(key) && value)
            .map(([key, value]) => (
              <input key={key} type="hidden" name={key} value={value} />
            ))}
          <label className="min-w-0 space-y-1 text-sm font-medium">
            <span>Occupancy date</span>
            <Input
              aria-describedby="occupancy-date-hint"
              name="date"
              type="date"
              defaultValue={date}
            />
          </label>
          <Button type="submit">Apply date</Button>
          {date && (
            <Link
              href={`${path}?${new URLSearchParams(Object.entries(filters).filter(([key, value]) => !["date", "page"].includes(key) && value) as [string, string][]).toString()}`}
              className="inline-flex h-9 items-center whitespace-nowrap text-sm text-primary underline"
            >
              Use today
            </Link>
          )}
          <p
            id="occupancy-date-hint"
            className="w-full text-xs text-muted-foreground"
          >
            Used when opening a library’s occupancy view. Defaults to today in
            the listing’s time zone.
          </p>
        </form>
        <ServiceTable listings={vendors.items} date={date} />
        <ListPagination
          page={vendors}
          path={path}
          params={filters}
          noun="listings"
        />
      </section>
    </div>
  );
}

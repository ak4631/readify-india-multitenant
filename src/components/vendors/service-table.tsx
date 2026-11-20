import Link from "next/link";
import type {
  Vendor,
  VendorAddress,
  VendorCategory,
} from "@/generated/prisma/client";
import { VendorStatusBadge } from "@/components/vendors/vendor-status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ServiceListing = Pick<Vendor, "id" | "name" | "capacity" | "status"> & {
  category: Pick<VendorCategory, "name" | "slug">;
  address: Pick<VendorAddress, "city"> | null;
};

// Hallmark · pre-emit critique: P4 H4 E4 S4 R5 V3
export function ServiceTable({
  listings,
  date,
}: {
  listings: ServiceListing[];
  date?: string;
}) {
  if (!listings.length) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No service listings match your filters.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {[
            "Listing",
            "Service",
            "City",
            "Configured capacity",
            "Status",
            "Service tools",
          ].map((label) => (
            <TableHead key={label}>{label}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {listings.map((listing) => {
          const base = `/vendors/${encodeURIComponent(listing.id)}`;
          const tool =
            listing.category.slug === "library"
              ? "Configure seats"
              : listing.category.slug === "gym"
                ? "Configure trainers and capacity"
                : listing.category.slug === "exam-hub"
                  ? "Configure academics and capacity"
                  : "Configure menu and capacity";
          return (
            <TableRow key={listing.id}>
              <TableCell className="font-medium">
                <Link href={base} className="text-primary hover:underline">
                  {listing.name}
                </Link>
              </TableCell>
              <TableCell>{listing.category.name}</TableCell>
              <TableCell>{listing.address?.city ?? "—"}</TableCell>
              <TableCell>{listing.capacity ?? "Not set"}</TableCell>
              <TableCell>
                <VendorStatusBadge status={listing.status} />
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  <Link
                    href={`${base}?tab=category`}
                    className="whitespace-nowrap text-primary hover:underline"
                    aria-label={`${tool} for ${listing.name}`}
                  >
                    {tool}
                  </Link>
                  {listing.category.slug === "library" && (
                    <Link
                      href={`${base}?tab=occupancy${date ? `&date=${encodeURIComponent(date)}` : ""}`}
                      className="whitespace-nowrap text-primary hover:underline"
                      aria-label={`View occupancy for ${listing.name}`}
                    >
                      View occupancy
                    </Link>
                  )}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

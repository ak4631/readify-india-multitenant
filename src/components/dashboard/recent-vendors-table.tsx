import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { VendorStatusBadge } from "@/components/vendors/vendor-status-badge";
import type { Vendor, VendorCategory } from "@/generated/prisma/client";

type RecentVendor = Vendor & { category: VendorCategory };

export function RecentVendorsTable({ vendors }: { vendors: RecentVendor[] }) {
  return (
    <Card>
      <CardHeader className="border-b border-border">
        <p className="text-xs font-semibold tracking-[0.08em] text-primary uppercase">
          Pipeline
        </p>
        <CardTitle className="text-xl">Recent partner listings</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Partner listing</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vendors.map((vendor) => (
              <TableRow key={vendor.id}>
                <TableCell className="font-semibold">
                  <Link
                    href={`/vendors/${vendor.id}`}
                    className="text-primary hover:text-primary/80"
                  >
                    {vendor.name}
                  </Link>
                </TableCell>
                <TableCell>{vendor.category.name}</TableCell>
                <TableCell>
                  <VendorStatusBadge status={vendor.status} />
                </TableCell>
              </TableRow>
            ))}
            {vendors.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="text-center text-muted-foreground"
                >
                  No vendors yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

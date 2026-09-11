import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { VendorStatusBadge, VerificationStatusBadge } from "@/components/vendors/vendor-status-badge";
import type { Vendor, VendorAddress, VendorCategory } from "@/generated/prisma/client";

type VendorRow = Vendor & { category: VendorCategory; address: VendorAddress | null };

export function VendorTable({ vendors }: { vendors: VendorRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>City</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Verification</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {vendors.map((vendor) => (
          <TableRow key={vendor.id}>
            <TableCell className="font-medium">
                  <Link href={`/vendors/${vendor.id}`} className="text-primary hover:text-primary/80">
                {vendor.name}
              </Link>
            </TableCell>
            <TableCell>{vendor.category.name}</TableCell>
            <TableCell>{vendor.address?.city ?? "—"}</TableCell>
            <TableCell>
              <VendorStatusBadge status={vendor.status} />
            </TableCell>
            <TableCell>
              <VerificationStatusBadge status={vendor.verificationStatus} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

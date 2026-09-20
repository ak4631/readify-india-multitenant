import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CustomerProfile } from "@/lib/profiles";

export function CustomerTable({ customers }: { customers: CustomerProfile[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Joined</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {customers.map((customer) => (
          <TableRow key={customer.id}>
            <TableCell className="font-medium">
              {customer.fullName ?? "—"}
            </TableCell>
            <TableCell>{customer.email ?? "—"}</TableCell>
            <TableCell>{customer.role}</TableCell>
            <TableCell>
              <Badge variant={customer.isActive ? "default" : "secondary"}>
                {customer.isActive ? "Active" : "Inactive"}
              </Badge>
            </TableCell>
            <TableCell>
              {customer.createdAt.toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </TableCell>
          </TableRow>
        ))}
        {customers.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} className="text-muted-foreground text-center">
              No customers yet.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CustomerRow, CustomersResult } from "@/server/actions/customers.actions";

function formatDate(date: Date) {
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function CustomerTable({
  customers,
  scope,
}: {
  customers: CustomerRow[];
  scope: CustomersResult["scope"];
}) {
  const columnCount = scope === "partner" ? 6 : 5;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          {scope === "partner" ? (
            <>
              <TableHead>Bookings</TableHead>
              <TableHead>Active subscriptions</TableHead>
              <TableHead>Total spend</TableHead>
              <TableHead>Last activity</TableHead>
            </>
          ) : (
            <>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
            </>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {customers.map((customer) => (
          <TableRow key={customer.id}>
            <TableCell className="font-medium">
              {customer.fullName ?? "—"}
            </TableCell>
            <TableCell>{customer.email ?? "—"}</TableCell>
            {scope === "partner" ? (
              <>
                <TableCell>{customer.totalBookings ?? 0}</TableCell>
                <TableCell>
                  {(customer.activeSubscriptions ?? 0) > 0 ? (
                    <Badge>{customer.activeSubscriptions}</Badge>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </TableCell>
                <TableCell>
                  ₹{(customer.totalSpent ?? 0).toLocaleString("en-IN")}
                </TableCell>
                <TableCell>
                  {customer.lastActivityAt ? formatDate(customer.lastActivityAt) : "—"}
                </TableCell>
              </>
            ) : (
              <>
                <TableCell>{customer.role}</TableCell>
                <TableCell>
                  <Badge variant={customer.isActive ? "default" : "secondary"}>
                    {customer.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell>{formatDate(customer.joinedAt)}</TableCell>
              </>
            )}
          </TableRow>
        ))}
        {customers.length === 0 && (
          <TableRow>
            <TableCell colSpan={columnCount} className="text-muted-foreground text-center">
              {scope === "partner"
                ? "No customers have booked or subscribed with your listings yet."
                : "No customers yet."}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

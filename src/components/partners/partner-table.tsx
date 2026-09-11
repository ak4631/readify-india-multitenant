"use client";

import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Partner } from "@/generated/prisma/client";
import { usePermission } from "@/hooks/use-permission";
import { setPartnerActive } from "@/server/actions/partners.actions";

type PartnerRow = Partner & { _count: { users: number; vendors: number } };

export function PartnerTable({ partners }: { partners: PartnerRow[] }) {
  const [pending, startTransition] = useTransition();
  const canChangeStatus = usePermission("partner.status");

  function toggle(partner: PartnerRow) {
    startTransition(async () => {
      try {
        await setPartnerActive(partner.id, partner.status !== "ACTIVE");
        toast.success(
          partner.status === "ACTIVE"
            ? "Partner deactivated"
            : "Partner activated",
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Action failed");
      }
    });
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Organization</TableHead>
          <TableHead>Listings</TableHead>
          <TableHead>Team</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {partners.map((partner) => (
          <TableRow key={partner.id}>
            <TableCell>
              <Link
                href={`/partners/${partner.id}`}
                className="font-semibold text-primary hover:underline"
              >
                {partner.name}
              </Link>
              <p className="mt-1 text-xs text-muted-foreground">
                {partner.email ?? "No contact email"}
              </p>
            </TableCell>
            <TableCell>{partner._count.vendors}</TableCell>
            <TableCell>{partner._count.users}</TableCell>
            <TableCell>
              <Badge
                variant={partner.status === "ACTIVE" ? "default" : "secondary"}
              >
                {partner.status}
              </Badge>
            </TableCell>
            <TableCell className="text-right">
              {canChangeStatus && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => toggle(partner)}
                >
                  {partner.status === "ACTIVE" ? "Deactivate" : "Activate"}
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

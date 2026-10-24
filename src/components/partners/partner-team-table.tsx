"use client";

import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PartnerUserEditDialog } from "@/components/partners/partner-user-edit-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserStatusBadge } from "@/components/users/user-status-badge";
import type { Role, User, UserRole } from "@/generated/prisma/client";
import { usePermission } from "@/hooks/use-permission";
import { setPartnerUserActive } from "@/server/actions/partners.actions";

type TeamUser = Omit<User, "passwordHash"> & {
  roles: (UserRole & { role: Role })[];
  partner?: { id: string; name: string } | null;
};

export function PartnerTeamTable({
  users,
  showOrganization = false,
}: {
  users: TeamUser[];
  showOrganization?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const canManage = usePermission("partnerUser.status");
  const canEdit = usePermission("partnerUser.update");
  function toggle(user: TeamUser) {
    startTransition(async () => {
      try {
        await setPartnerUserActive(user.id, user.status !== "ACTIVE");
        toast.success(
          user.status === "ACTIVE"
            ? "Account deactivated"
            : "Account activated",
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
          <TableHead>Name</TableHead>
          {showOrganization && <TableHead>Organization</TableHead>}
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => (
          <TableRow key={user.id}>
            <TableCell className="font-medium">{user.name}</TableCell>
            {showOrganization && (
              <TableCell>
                {user.partner ? (
                  <Link
                    href={`/partners/${user.partner.id}`}
                    className="text-primary hover:underline"
                  >
                    {user.partner.name}
                  </Link>
                ) : (
                  "—"
                )}
              </TableCell>
            )}
            <TableCell>{user.email}</TableCell>
            <TableCell>
              {user.roles
                .map(({ role }) => role.name.replace(/_/g, " "))
                .join(", ")}
            </TableCell>
            <TableCell>
              <UserStatusBadge status={user.status} />
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">
                {canEdit && <PartnerUserEditDialog user={user} />}
                {canManage && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    aria-busy={pending}
                    onClick={() => toggle(user)}
                  >
                    {user.status === "ACTIVE" ? "Deactivate" : "Activate"}
                  </Button>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
        {!users.length && (
          <TableRow>
            <TableCell
              colSpan={showOrganization ? 6 : 5}
              className="py-8 text-center text-muted-foreground"
            >
              No team members yet.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

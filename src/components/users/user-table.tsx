"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserStatusBadge } from "@/components/users/user-status-badge";
import type { User, UserRole, Role } from "@/generated/prisma/client";
import { activateUser, suspendUser } from "@/server/actions/users.actions";
import { usePermission } from "@/hooks/use-permission";

type UserRow = User & { roles: (UserRole & { role: Role })[] };

export function UserTable({ users }: { users: UserRow[] }) {
  const [isPending, startTransition] = useTransition();
  const canSuspend = usePermission("user.suspend");
  const canActivate = usePermission("user.activate");

  function handleToggle(user: UserRow) {
    startTransition(async () => {
      try {
        if (user.status === "ACTIVE") {
          await suspendUser({ userId: user.id });
          toast.success(`${user.name} suspended`);
        } else {
          await activateUser({ userId: user.id });
          toast.success(`${user.name} activated`);
        }
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
          <TableHead>Email</TableHead>
          <TableHead>Roles</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => (
          <TableRow key={user.id}>
            <TableCell className="font-medium">{user.name}</TableCell>
            <TableCell>{user.email}</TableCell>
            <TableCell>
              {user.roles.map((r) => r.role.name).join(", ") || "—"}
            </TableCell>
            <TableCell>
              <UserStatusBadge status={user.status} />
            </TableCell>
            <TableCell className="text-right">
              {user.status === "ACTIVE" && canSuspend && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  aria-busy={isPending}
                  onClick={() => handleToggle(user)}
                >
                  Suspend
                </Button>
              )}
              {user.status === "SUSPENDED" && canActivate && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  aria-busy={isPending}
                  onClick={() => handleToggle(user)}
                >
                  Activate
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

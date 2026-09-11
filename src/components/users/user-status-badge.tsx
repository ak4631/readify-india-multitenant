import { Badge } from "@/components/ui/badge";
import type { UserStatus } from "@/generated/prisma/enums";

const VARIANTS: Record<UserStatus, "default" | "secondary" | "destructive"> = {
  ACTIVE: "default",
  SUSPENDED: "destructive",
  DELETED: "secondary",
};

export function UserStatusBadge({ status }: { status: UserStatus }) {
  return <Badge variant={VARIANTS[status]}>{status}</Badge>;
}

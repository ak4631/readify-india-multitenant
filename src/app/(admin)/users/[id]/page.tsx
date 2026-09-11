import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { UserStatusBadge } from "@/components/users/user-status-badge";
import { getUserById } from "@/server/actions/users.actions";

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getUserById(id);

  if (!user) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader
        eyebrow="Users"
        title={user.name}
        description="Account details, roles, and status for this user."
      />
      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-muted/50 px-4 py-3">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Email</p>
            <p className="mt-1 font-medium">{user.email}</p>
          </div>
          <div className="rounded-xl bg-muted/50 px-4 py-3">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Phone</p>
            <p className="mt-1 font-medium">{user.phone ?? "—"}</p>
          </div>
          <div className="rounded-xl bg-muted/50 px-4 py-3">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Status</p>
            <div className="mt-1">
              <UserStatusBadge status={user.status} />
            </div>
          </div>
          <div className="rounded-xl bg-muted/50 px-4 py-3">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Roles</p>
            <p className="mt-1 font-medium">{user.roles.map((r) => r.role.name).join(", ") || "—"}</p>
          </div>
          <div className="rounded-xl bg-muted/50 px-4 py-3 sm:col-span-2">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Joined</p>
            <p className="mt-1 font-medium">{user.createdAt.toLocaleDateString()}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

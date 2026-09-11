import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { UserTable } from "@/components/users/user-table";
import { listUsers } from "@/server/actions/users.actions";

export default async function UsersPage() {
  const users = await listUsers();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Users"
        title="Accounts"
        description={`${users.length} registered users across admin and consumer roles.`}
      />
      <Card>
        <CardContent>
          <UserTable users={users} />
        </CardContent>
      </Card>
    </div>
  );
}

import { PageHeader } from "@/components/layout/page-header";
import { ListPagination } from "@/components/layout/list-pagination";
import { Card, CardContent } from "@/components/ui/card";
import { UserTable } from "@/components/users/user-table";
import { parsePage } from "@/lib/pagination";
import { listUsers } from "@/server/actions/users.actions";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const users = await listUsers(parsePage(params.page));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Users"
        title="Accounts"
        description={`${users.total} portal sign-in accounts: platform staff and every partner organization's team. Suspending an account blocks its sign-in. App customers are listed under Customers.`}
      />
      <Card>
        <CardContent>
          <UserTable users={users.items} />
          <ListPagination
            page={users}
            path="/users"
            params={params}
            noun="accounts"
          />
        </CardContent>
      </Card>
    </div>
  );
}

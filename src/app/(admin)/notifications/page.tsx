import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { ListPagination } from "@/components/layout/list-pagination";
import { parsePage } from "@/lib/pagination";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  listPortalNotifications,
  markPortalNotificationRead,
} from "@/server/actions/notifications.actions";

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = await listPortalNotifications(parsePage(params.page));
  const notifications = page.items;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Updates about your listings, applications and account."
      />
      {!page.total && <p>No notifications yet.</p>}
      {notifications.map((item) => (
        <Card key={item.id}>
          <CardContent className="space-y-3 pt-6">
            <p className="font-semibold">{item.title}</p>
            <p>{item.body}</p>
            <div className="flex items-center gap-4">
              {item.href && (
                <Link href={item.href} className="text-primary underline">
                  Open
                </Link>
              )}
              {!item.readAt && (
                <form
                  action={async () => {
                    "use server";
                    await markPortalNotificationRead(item.id);
                  }}
                >
                  <Button type="submit" variant="outline" size="sm">
                    Mark read
                  </Button>
                </form>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
      <ListPagination
        page={page}
        path="/notifications"
        params={params}
        noun="notifications"
      />
    </div>
  );
}

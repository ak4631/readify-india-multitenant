import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  listPortalNotifications,
  markPortalNotificationRead,
} from "@/server/actions/notifications.actions";

export default async function NotificationsPage() {
  const notifications = await listPortalNotifications();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Updates about your listings and account."
      />
      {!notifications.length && <p>No notifications yet.</p>}
      {notifications.map((item) => (
        <Card key={item.id}>
          <CardContent className="space-y-3 pt-6">
            <p className="font-semibold">{item.title}</p>
            <p>{item.body}</p>
            <div className="flex items-center gap-4">
              {item.href && (
                <Link href={item.href} className="text-primary underline">
                  View listing
                </Link>
              )}
              {!item.readAt && (
                <form
                  action={async () => {
                    "use server";
                    await markPortalNotificationRead(item.id);
                  }}
                >
                  <Button variant="outline" size="sm">
                    Mark read
                  </Button>
                </form>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

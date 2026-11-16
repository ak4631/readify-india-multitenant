import "server-only";
import { prisma } from "@/lib/prisma";
import { firebasePushMessaging } from "@/lib/firebase-admin";

const invalidTokenCodes = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);
export async function deliverCustomerPushes() {
  const messaging = firebasePushMessaging();
  if (!messaging) return { configured: false, sent: 0, failed: 0 };
  await prisma.customerPushDelivery.updateMany({
    where: { status: "PENDING", expiresAt: { lte: new Date() } },
    data: { status: "EXPIRED", lockedUntil: null },
  });
  // Leases permit another worker to retry after a process crash without claiming the same batch concurrently.
  const jobs = await prisma.$queryRaw<
    {
      id: string;
      notification_id: string;
      token: string;
      user_id: string;
      expires_at: Date;
      attempts: number;
    }[]
  >`
    UPDATE admin.customer_push_deliveries SET locked_until=now()+interval '2 minutes',attempts=attempts+1
    WHERE id IN (SELECT id FROM admin.customer_push_deliveries WHERE status='PENDING' AND attempts<5 AND next_attempt_at<=now() AND expires_at>now() AND (locked_until IS NULL OR locked_until<now()) ORDER BY next_attempt_at LIMIT 20 FOR UPDATE SKIP LOCKED)
    RETURNING id,notification_id,token,user_id,expires_at,attempts`;
  let sent = 0,
    failed = 0;
  await Promise.all(
    jobs.map(async (job) => {
      try {
        const [notification, tokens] = await Promise.all([
          prisma.customerNotification.findUnique({
            where: { id: job.notification_id },
          }),
          prisma.$queryRaw<
            { token: string }[]
          >`SELECT t.token FROM admin.customer_push_tokens t JOIN public.profiles p ON p.id=t.user_id AND p.is_active WHERE t.token=${job.token} AND t.user_id=${job.user_id}::uuid`,
        ]);
        if (
          !notification ||
          notification.userId !== job.user_id ||
          notification.readAt ||
          !tokens.length ||
          job.expires_at <= new Date()
        ) {
          await prisma.customerPushDelivery.updateMany({
            where: { id: job.id },
            data: { status: "EXPIRED", lockedUntil: null },
          });
          return;
        }
        if (notification.eventKey.startsWith("booking-reminder:")) {
          const reservations = await prisma.$queryRaw<
            { valid: boolean }[]
          >`SELECT EXISTS(
          SELECT 1 FROM admin.seat_reservations r JOIN admin.payment_orders o ON o.target_id=r.source_id AND o.status='CAPTURED'
          WHERE lower(r."window")>now() AND 'booking-reminder:'||r.source_id||':'||extract(epoch FROM lower(r."window"))::text=${notification.eventKey}
        ) AS valid`;
          if (!reservations[0]?.valid) {
            await prisma.customerPushDelivery.updateMany({
              where: { id: job.id },
              data: { status: "EXPIRED", lockedUntil: null },
            });
            return;
          }
        }
        await messaging.send({
          token: job.token,
          notification: { title: notification.title, body: notification.body },
          data: { notificationId: notification.id, screen: "Notifications" },
          android: {
            priority: "high",
            ttl: Math.max(0, job.expires_at.getTime() - Date.now()),
            restrictedPackageName: "com.zerotham",
            notification: {
              channelId: "zerotham_updates",
              icon: "ic_notification",
              tag: notification.id,
            },
          },
        });
        await prisma.customerPushDelivery.updateMany({
          where: { id: job.id },
          data: {
            status: "SENT",
            sentAt: new Date(),
            lockedUntil: null,
            lastError: null,
          },
        });
        sent++;
      } catch (error) {
        const code =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          typeof error.code === "string"
            ? error.code
            : "push/send-failed";
        if (invalidTokenCodes.has(code)) {
          await prisma.customerPushToken.deleteMany({
            where: { token: job.token, userId: job.user_id },
          });
        } else {
          await prisma.customerPushDelivery.updateMany({
            where: { id: job.id },
            data: {
              status: job.attempts >= 5 ? "FAILED" : "PENDING",
              lockedUntil: null,
              lastError: code,
              nextAttemptAt: new Date(
                Date.now() + 2 ** (job.attempts - 1) * 60000,
              ),
            },
          });
        }
        failed++;
      }
    }),
  );
  return { configured: true, sent, failed };
}

# Booking payments and digital memberships

New purchases support ONLINE (existing Razorpay integration) and OFFLINE (Pay at Partner). Super Admin → Settings → Booking payment options controls availability and the offline payment deadline (1–72 hours after booked start, default 24). At least one method must remain enabled. Settings affect new reservations; existing gateway orders and callbacks continue to settle normally. Existing orders retain their original verification rules.

Customers choose an enabled payment method before capacity is reserved. Online holds retain the existing 15-minute deadline. Offline holds expire using the existing authenticated payment job and checkout cleanup. Run the payment job at least once per minute, as already required for reminders and reservation expiry.

Partners use Verify / activate in booking and subscription tables, or enter/scan the existing code in attendance controls. Scan QR opens the phone/browser camera over HTTPS and reads frames locally; it stops after a successful scan, on close, or when the page is hidden. Manual Booking ID entry remains available when camera permission is denied or a camera is unavailable. They review the customer, plan, location and amount, verify identity in person, upload a JPG/PNG selfie (maximum 4 MB), and explicitly confirm offline payment received. Online orders require gateway capture; a partner cannot mark them paid. Confirmation, activation, card creation, audit history and notification commit together. Repeated confirmation returns the existing card. Failed activation removes the new private photo where possible.

Subscription validity starts on the later of the booked calendar day and payment confirmation day, in the location timezone. The purchased month count is snapshotted so late payment preserves the calendar term. Flex reservations retain their number of days; fixed stay-extension windows remain fixed. The reservation ledger rechecks overlaps and active seats, and activation rechecks opening hours. If the revised span cannot be allocated, activation fails and the partner must resolve the reservation before collecting payment.

Subscription Booking IDs are displayed before payment in the customer app and in the partner subscription table. They use the existing `subscription:<id>` QR value; no Booking ID or QR regeneration is performed.

The partner dashboard shows the five earliest pending payments, with a full paginated Payment Pending list under Payments & Revenue. This includes subscriptions and day/Flex bookings, excludes paid/cancelled/expired holds, and is scoped to the partner’s accessible locations.

Cards appear in the existing mobile Subscriptions/Membership section for all verified purchases. They show category-specific titles, ZEROTHAM branding, location, customer, unique Membership ID, private verified photo, plan, validity, daily slot and verifier/activation details. They reuse the existing booking code, or `subscription:<id>` for subscriptions. Stored end dates remain exclusive; card validity displays the last included day. Status is read live on the server and checked against location midnight on the device. Check-in always checks live payment, verification and reserved access windows.

Offline cancellations never invoke Razorpay refunds. Customers are directed to the partner for any refund. Existing online cancellation and late-capture refund behavior remains in place.

## Rollout

1. Back up the database and apply `20261120100000_offline_memberships` using the repository's existing migration process. It adds tables/columns and extends the customer payment view; it does not rewrite existing purchases.
2. Deploy the portal/API together with its regenerated Prisma client. Existing ImageKit private-upload configuration is used for selfies and short-lived signed photo URLs. Keep the payment job running.
3. Release the mobile update. Test an offline booking, selfie upload, activation, card refresh and QR check-in at a test location; test a gateway purchase when online payments are enabled.
4. In Super Admin Settings, disable Online Payment if desired and retain Pay at Partner. Both methods are initially enabled to preserve the existing gateway option.

The migration has been tested against an isolated PostgreSQL-compatible database. Production migration, live Razorpay/ImageKit transactions and physical-device validation are separate rollout steps.

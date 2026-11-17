# Setup

The admin portal and customer API share the `admin` Postgres schema. Supabase Auth identifies mobile customers. Existing `public` data belongs to earlier work; do not reset it.

## Local development

Copy `.env.example` to your local environment and supply credentials privately. Run `npm ci`, `npm run prisma:generate`, then `npm run dev`. Seed only a deliberately selected development database using `npm run prisma:seed`; seeding writes roles, permissions and initial records.

ImageKit supplies document and gallery storage. LocationIQ supplies server-side address lookup. NextAuth requires its own secret and URL. Mobile token verification requires the Supabase project URL and publishable key. Never put database, ImageKit or Razorpay secrets in the mobile app.

## Database changes

Use reviewed SQL migrations. **Do not use `prisma db push`, accept a reset prompt, or mark unapplied SQL as applied.** Prisma alone cannot represent the reservation exclusion constraint, triggers, views and security rules.

Migration history tables can exist in different schemas. Inspect the target database and its applied history before changing it. Set `MIGRATION_HISTORY_SCHEMA` to the actual history schema when needed; the runner refuses ambiguous histories. `DIRECT_URL` must point to the intended database with migration privileges. Back up and rehearse restoration before a release.

Apply one reviewed migration with `npm run prisma:apply -- <exact_migration_directory_name>`. The runner applies SQL and records its checksum in one transaction under a migration lock. It refuses changed checksums, incomplete history and out-of-order October release migrations. Each command commits separately: the new subscription enum value must commit before subsequent migrations use it.

For the October release, first reconcile existing history through `20260928120000_flexible_day_pass`, then apply every `20261018*` directory in lexical order, from `20261018100000_listing_change_review` through `20261018210000_occupancy_summary`. Do not blindly replay the baseline or historical September deltas against an existing database. September history contains a baseline-overlapping delta and PostgreSQL-version-specific cosmetic constraint renames; assess these against the actual target version and history.

The reservation migration intentionally aborts on conflicting reservations or existing active/pending Flex passes stored as subscriptions. Audit and explicitly migrate those records before retrying. Audit legacy unpaid bookings/subscriptions too: they must not be assumed to be verified Razorpay purchases. Afterwards regenerate Prisma and verify Supabase exposed schemas, view permissions and customer JWT access in staging.

## Razorpay and recurring jobs

Start with test keys. Set the Razorpay key ID, key secret, webhook secret, `CHECKOUT_SIGNING_SECRET`, `CHECKOUT_BASE_URL` and `CRON_SECRET`. The checkout base must be HTTPS and reachable from a phone. Configure the Razorpay webhook at `/api/payments/webhook`; subscribe to `payment.captured` (refund settlement is reconciled by the recurring job). Signatures are checked against the raw request body. Configure automatic capture consistently with the checkout flow.

Schedule authenticated `POST /api/jobs/payments` calls with `Authorization: Bearer <CRON_SECRET>` at least once per minute. This expires holds/subscriptions, retries pending refunds, and queues each paid daily access reminder once, about one hour before the slot. Reminders appear in the customer app notification inbox. After Firebase Admin credentials and the push migration are configured, this job also dispatches Android push notifications. Monitor non-200 results and refund records that remain pending; provider failures require investigation. Browser return alone never confirms payment.

Set the native app's `API_BASE_URL` to this deployment and rebuild the app. The phone must reach both the API and hosted checkout. Run a complete test payment, webhook replay, interrupted checkout recovery, cancellation/refund and same-seat extension on a physical device before switching to live keys.

## Verification

Admin: `npm test`, `npm run test:integration`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.

Integration tests default to an isolated PGlite database. The older live onboarding suite runs only with both `ALLOW_LIVE_DATABASE_TESTS=1` and `TEST_DATABASE_URL`; use a disposable database. The isolated replay strips two cosmetic PostgreSQL 18 constraint-renaming statements and omits one baseline-overlapping historical delta. It does not prove production migration compatibility or simultaneous transactions on deployed PostgreSQL.

See `../../plan/IMPLEMENTATION_HANDOFF.md` for policy and release limitations.

## Customer launch improvements

Apply `20261114120000_launch_customer_improvements` before releasing the updated mobile app or opening `/promotions`. It adds the selected daily-hours booking API (4, 6, 8, 12, 16, 18, 24), wishlist ownership policies, customer support tickets, banner scheduling/targeting, and reminder enqueueing. The old booking signatures remain available for existing app builds. This migration bootstraps `public.user_locations` if the mobile location migration has not already created it.

Super Admins manage banners at `/promotions`: upload JPG/PNG/WEBP images up to 4 MB using the existing ImageKit configuration; choose a published listing for native booking navigation or an HTTPS destination; set activation, priority, start/end dates, and optional city/area or coordinate/radius targeting. City and area match complete comma-separated address components, case-insensitively. No saved location means only untargeted banners appear. The app respects a location cleared on the device. Up to four matching banners appear above search and advance every five seconds, with pause and swipe controls. Active clients refresh banner eligibility every minute and when returning Home. Paid placement billing and promotion analytics are future work.

Customer support tickets are available in the mobile Account section and in the platform `/support` page for SUPER_ADMIN, ADMIN and SUPPORT roles. Replies also create an inbox notification. Customer tickets and wishlist data are scoped to the authenticated customer; partners cannot read customer support tickets.

## Firebase Android push notifications

The Android Firebase project is `zerotham` and package is `com.zerotham`. Its client config lives at `application-readify/android/app/google-services.json`; the Android Google Services Gradle plugin and React Native Firebase app/messaging modules read this file automatically. This JSON config is not a server service-account key.

1. Apply `20261114130000_firebase_push` after the customer launch migration and regenerate Prisma.
2. On the backend, set the server-only `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` environment variables from the service account's `project_id`, `client_email` and `private_key` fields. Use the complete PEM private key, including BEGIN/END lines; actual newlines and literal `\n` sequences are both supported. No service-account JSON file is required at runtime. For workload identity instead, set `FIREBASE_USE_APPLICATION_DEFAULT_CREDENTIALS=true`. The identity must have Firebase Cloud Messaging send permission in this project and the FCM HTTP v1 API must be enabled. Never add these credentials to the mobile app or commit them.
3. Rebuild and install Android (`npm run android`), sign in, and grant notification permission. Android 13+ shows the runtime permission prompt. The Notifications screen reports registration status and links to Android settings. Development builds show a selectable FCM token for Console testing. iOS is excluded from these native Firebase modules until its own plist/APNs setup is completed.
4. In Firebase Console → Messaging, send a test **notification** to that device token, first with the app backgrounded, then foregrounded. Background notifications use the Android `zerotham_updates` channel; foreground messages use the in-app dialog. Tapping a notification opens the Notifications inbox after authentication. A Console test does not create a server inbox record. Delivery requires Google Play Services on the phone/emulator. Force-stopped apps must be reopened.
5. Keep the authenticated `POST /api/jobs/payments` job running every minute. Inspect `push.configured`, `push.sent`, and `push.failed` in its response. Each new server inbox notification queues delivery to currently registered devices; older inbox records are not backfilled to new installations. Up to 20 jobs are dispatched concurrently per run, with worker leases, exponential retries (up to five attempts), invalid-token cleanup, and an expiry deadline. Reminder pushes expire at the booked start and are rechecked against a current paid reservation before sending. FCM submission is at-least-once; Android notification tags reduce duplicate tray entries.

Device tokens refresh automatically and are unregistered/revoked on logout. Support replies and payment updates use the same inbox-to-push queue. End-to-end server delivery still requires real credentials, applied migrations, a running scheduler and a registered test device; unit/database tests use mocks or isolated PostgreSQL and do not send real notifications.

### Hosted backend (Vercel)

The mobile app currently points to `https://readify-india-multitenant.vercel.app`. In the Vercel project's server environment variables, set `FIREBASE_PROJECT_ID=zerotham`, `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` from the corresponding service-account fields. Paste each value without adding shell quotes in the Vercel dashboard. Remove the old `GOOGLE_APPLICATION_CREDENTIALS` and `FIREBASE_SERVICE_ACCOUNT_JSON` settings. Redeploy the backend with the updated push delivery code; no credential JSON file needs uploading. Restart the local backend after changing its `.env`. Confirm the authenticated minute-by-minute jobs scheduler is configured; a local `.env` change does not configure hosted environment variables or schedule a cloud job.

After deployment, install/rebuild the Android app, sign in, grant notification permission, and check that Notifications reports the device as registered. A real push delivery test requires a registered phone or compatible Google Play emulator.


## Super Admin marketing notifications

The Marketing navigation tab (`/marketing`) is available only to Super Admins. Admins and partners cannot access the page or its server mutations. Home banner management remains linked at `/promotions`.

Apply `20261117100000_marketing_notifications` and regenerate Prisma before deploying this backend or rebuilding the customer app. This additive migration was applied to the configured application database on 17 November 2026; table, function and customer-view column checks passed. No campaigns were created or sent during verification.

Campaigns support a title, offer message, optional JPG/PNG/WEBP image up to 4 MB, and an optional destination: a currently published listing, a service category or an HTTPS offer URL. With no destination, taps open the notification inbox. Leave audience fields blank for all active customer profiles. City and area match whole comma-separated saved-address segments, ignoring case; area requires city. Service audience targeting selects customers with a captured purchase in that service. Filters combine, and customers without saved locations are excluded from location-filtered campaigns.

Send now creates inbox records immediately, records the campaign as QUEUED in the same transaction, and attempts a campaign-scoped push batch immediately. Future scheduled delivery and remaining/retried push batches use the existing authenticated minute job (`POST /api/jobs/payments`); its response includes `marketingRecipientsQueued`. The job queues up to ten due campaigns per invocation. Row locks and unique campaign/customer event keys prevent duplicate inbox entries on retries. Each campaign is delivered once; scheduled campaigns can be cancelled until queued. Send now rejects an empty matching audience without saving a campaign. The audience preview uses the same database eligibility function as delivery and distinguishes active app users from users with registered push devices. Campaign history shows the recipient count and QUEUED status, which means inbox records exist, not that every push was delivered. Existing delivery retries and device registration rules continue to apply.

The mobile inbox displays campaign images and opens destinations on tap. Android push taps resolve their notification ID through the signed-in customer's inbox before following a destination. Unavailable listings and invalid links are blocked. External offer links open through the OS browser; listing and service destinations open inside the app. Existing automatic notifications continue to use the same inbox and delivery worker. iOS push delivery still requires separate Firebase/APNs configuration.

Release requires deploying the web backend, keeping its authenticated scheduler running, rebuilding/installing the Android customer app and verifying with a registered device. Local unit/integration checks do not establish live device delivery. Browser visual verification was unavailable in this session because computer-use permissions were not granted.


### Marketing send-now correction (17 November 2026)

Applied `20261117110000_marketing_send_now` to the configured database. It permits broadcasts without any destination and adds a shared active-user audience function plus a single-campaign queue entry point. Postflight audience verification found 8 active users and 2 users with registered push devices. No existing campaigns were queued, resent or cancelled during verification. The previous Send now behavior left campaigns SCHEDULED until the background job ran; only the explicit Schedule once option now waits for that job. These changes require updating the backend/web portal; the existing Android 1.0.1 build already supports inbox-only notifications and does not need rebuilding for this correction.

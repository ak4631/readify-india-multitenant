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

Schedule authenticated `POST /api/jobs/payments` calls with `Authorization: Bearer <CRON_SECRET>` at least once per minute. This expires holds/subscriptions and retries pending refunds. Monitor non-200 results and refund records that remain pending; provider failures require investigation. Browser return alone never confirms payment.

Set the native app's `API_BASE_URL` to this deployment and rebuild the app. The phone must reach both the API and hosted checkout. Run a complete test payment, webhook replay, interrupted checkout recovery, cancellation/refund and same-seat extension on a physical device before switching to live keys.

## Verification

Admin: `npm test`, `npm run test:integration`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.

Integration tests default to an isolated PGlite database. The older live onboarding suite runs only with both `ALLOW_LIVE_DATABASE_TESTS=1` and `TEST_DATABASE_URL`; use a disposable database. The isolated replay strips two cosmetic PostgreSQL 18 constraint-renaming statements and omits one baseline-overlapping historical delta. It does not prove production migration compatibility or simultaneous transactions on deployed PostgreSQL.

See `../../plan/IMPLEMENTATION_HANDOFF.md` for policy and release limitations.

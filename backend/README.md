# ZEROTHAM backend

This is an independently built and deployed Node.js API service for the existing admin portal and React Native app. It retains the current Prisma models, SQL booking/seat functions, permissions, tenant checks, Razorpay flows, jobs, registration, ImageKit uploads and Firebase delivery.

The admin portal stays a Next.js server application. In split mode it calls the backend for data and actions and needs **no database or payment credentials**. The mobile app's `lib/supabase.ts` keeps Supabase Auth, while its data queries and RPCs use `API_BASE_URL` and the new backend. Supabase is still the customer identity provider; this change does not introduce a replacement password, OTP or email service.

## Local setup

Run commands from `readify-india-multitenant`, using Node.js 24 or later and the checked-in lockfile.

1. Install dependencies: `npm ci`.
2. Copy `backend/.env.example` to `backend/.env`. Set `DATABASE_URL` and `DIRECT_URL` to your PostgreSQL database. For the supplied local container, both are `postgresql://zerotham:PASSWORD@localhost:5432/zerotham`. Use a URL-safe development password or percent-encode it in the connection URLs.
3. Set the same independently generated `BACKEND_SHARED_SECRET` (at least 32 characters) and `NEXTAUTH_SECRET` on the frontend and backend. Generate each with `openssl rand -hex 32`. On both processes set `NEXTAUTH_URL=http://localhost:3000`. Leave `BACKEND_URL` absent from `backend/.env`.
4. Start PostgreSQL: `POSTGRES_PASSWORD=PASSWORD docker compose -f compose.backend.yaml up -d postgres`.
5. For a **new empty database**, run `npm run backend:migrate -- --bootstrap`. Subsequent deployments use `npm run backend:migrate` without that flag. Bootstrap refuses existing identity or application tables.
6. Configure `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` in `backend/.env`, then run `npm run backend:seed`. Configure the remaining service credentials for features you use. Production booking OTP defaults to disabled; configure the existing verified OTP workflow before enabling real checkout.
7. Start the backend: `npm run backend:dev` (port 4000).
8. Set these in the frontend's root `.env`, keeping service/database secrets only in `backend/.env` when running split mode:

   ```dotenv
   BACKEND_URL=http://localhost:4000
   BACKEND_SHARED_SECRET=<same value as backend>
   NEXTAUTH_SECRET=<same value as backend>
   NEXTAUTH_URL=http://localhost:3000
   ```

   Start the frontend with `npm run dev`. Restart/rebuild after changing `BACKEND_URL`; the public API rewrites are part of Next.js configuration. The frontend proxies the existing `/api/customer/*`, `/api/payments/*`, `/api/jobs/*` and `/api/registration` paths to preserve existing URLs. Browser staff auth remains at frontend `/api/auth/*`.
9. In `application-readify/.env`, set `API_BASE_URL` to the externally reachable backend URL and retain the Supabase Auth URL/publishable key. A physical device needs your development machine's LAN address or a test HTTPS URL, rather than `localhost`. Rebuild the native bundle after changing embedded environment values. `CHECKOUT_BASE_URL` on the backend must point to the frontend, which renders `/checkout/[id]`.

For the complete container service, use `POSTGRES_PASSWORD=PASSWORD docker compose -f compose.backend.yaml up --build -d backend` after migrations. Container database connections use the `postgres` hostname automatically. Apply migrations and seed through the host commands above before exposing the backend.

## Builds and source ownership

`npm run backend:build` prepares and builds the backend independently of the frontend. `npm run backend:start` serves it on port 4000. `npm run build` continues to build the frontend.

The existing `src/server/actions`, `src/lib`, `src/config`, `src/types`, Prisma schema and migrations remain the authoritative business source. The action bridge keeps the current action signatures and types. `scripts/connect-backend.cjs` adds bridges for new exported actions and generates the explicit operation registry. `scripts/prepare-backend.mjs` copies only backend-relevant source into ignored `backend/src`; it omits staff-auth routes, UI pages, frontend proxy and components. Additional backend-only route handlers live in `backend/routes`. Edit authoritative source, not generated copies, then run `npm run backend:prepare`.

Leaving frontend `BACKEND_URL` empty preserves single-process development. With it set, Prisma access on the frontend fails closed, including accidental new direct queries. New page queries should use a permission-checked Server Action. Backend deployments must leave `BACKEND_URL` unset to avoid forwarding loops.

Staff calls use a fixed action allowlist, HTTPS, a server-only HMAC secret and a timestamp signed together with the request body and session cookie. Original actions recheck permissions and current account status on the backend. The frontend never supplies a trusted staff user ID. Uploads, dates and undefined arguments survive the transport; cache invalidations return to the frontend.

## PostgreSQL and existing data

For an existing shared Supabase database, use its current connection URLs and `CUSTOMER_IDENTITY_STORAGE=supabase`. Do **not** bootstrap it. Existing customer identities and profiles remain in place.

For an independent PostgreSQL/RDS database, use `CUSTOMER_IDENTITY_STORAGE=postgres`. The bootstrap supplies `auth.users`, `public.profiles`, `auth.uid()` and compatibility roles used by the existing SQL. These are identity mirrors: customer tokens are verified against Supabase Auth before their ID/email is mirrored into PostgreSQL. Passwords and Supabase service-role keys are not copied. Customer names are editable through the API; ownership, role and active status are controlled by the server. Private SQL views/functions receive a verified, transaction-local customer ID. No caller can invoke arbitrary SQL or an unlisted function.

A fresh database starts empty. Existing production data is **not automatically transferred**. Before cutting over an existing installation, take a tested backup and restore all dependent application data, profiles, customer IDs and migration history in a staging database. Reconcile identity mirrors with the existing customer IDs and verify bookings/payments before switching traffic. Do not point the mobile app at an empty database and expect its old bookings to appear.

The portable migration runner checks original SHA-256 checksums and records the existing Prisma migration history under an advisory lock. Each migration commits separately for enum changes. Like the repository's verified test rollout, it treats the historical `20260927130000_apply_pending_seat_rollout` delta as already represented by the preceding baseline and omits two PG18-only cosmetic NOT NULL renames on the PG17 target. These narrowly defined adaptations live in `backend/database/migration-sql.mjs`; historical SQL files are unchanged. Existing history/checksum disagreements stop the runner for review. Do not mix this portable fresh-install rollout with `prisma migrate dev` or `db push` on production.

## AWS deployment

A suitable deployment topology is:

```text
Admin domain -> Next.js frontend -> HTTPS backend / ALB -> ECS Fargate container
Mobile API_BASE_URL ----------------------^                    |
Razorpay webhooks / scheduled jobs --------^                    v
                                                        private RDS PostgreSQL
```

Build from the repository root:

```sh
docker build -f backend/Dockerfile --target runtime -t zerotham-backend .
docker build -f backend/Dockerfile --target migrate -t zerotham-backend-migrate .
```

Push the images to your ECR repository and run the runtime image as an ECS Fargate service behind an HTTPS Application Load Balancer on container port 4000. Use `/health/live` for process liveness and `/health/ready` for database readiness. Readiness returns 503 if PostgreSQL is unavailable. Send logs to CloudWatch. Keep RDS in private subnets; allow its PostgreSQL port only from the backend task/security group. Use TLS with certificate verification for remote database connections, Secrets Manager for runtime secrets, and backups/PITR for the database. Restrict the internal dispatcher to trusted frontend traffic where possible; HMAC verification remains mandatory.

Run the `migrate` image as a separate one-off task with `DIRECT_URL` before updating the service. For a brand-new database only, override its command with `node scripts/backend-migrate.mjs --bootstrap`. Do not run migrations at every container startup. Set `DATABASE_URL`, service credentials, `NEXTAUTH_SECRET`, `BACKEND_SHARED_SECRET`, customer-auth settings and the frontend `NEXTAUTH_URL` on the backend. Point frontend `BACKEND_URL` to the HTTPS backend origin. Keep `CHECKOUT_BASE_URL` on the frontend domain. Existing customer sessions need the same Supabase identity project; existing staff sessions need the same NextAuth secret.

CloudFront can sit in front of the ALB. It does not host the backend process. For authenticated API and internal-dispatch paths use **CachingDisabled**, forward authorization headers, cookies and query strings, and allow the required HTTP methods, including POST and DELETE. Never cache private data or signed dispatch requests. AWS documents the [ALB origin setup](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/restrict-access-to-load-balancer.html) and [CachingDisabled policy](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html).

Configure Razorpay webhooks at backend `/api/payments/webhook`. Schedule authenticated calls to `/api/jobs/payments` using the existing `CRON_SECRET` contract. Ensure the scheduler and load balancer permit the job's execution time. AWS infrastructure, credentials and live deployment are intentionally configured in your account when you are ready; the repository supplies the application images and deployment procedure.

## Verification

```sh
npm test
npm run test:integration
npm run backend:build
npm run build
# In application-readify:
npx tsc --noEmit
npm test -- --runInBand
```

`tests/integration/separate-backend.test.ts` runs the actual bootstrap and portable migration chain on disposable PostgreSQL-compatible PGlite, then checks customer isolation and write restrictions. Transport tests cover signatures, stale requests, dates and multipart files. Native Jest tests cover the API data adapter. A real RDS/container staging smoke test is still required before production cutover.

# Setup

## Database

This Supabase Postgres database already had an unrelated schema in `public`
(profiles/libraries/memberships/bookings, wired to Supabase Auth) from prior
work before this admin portal existed. To avoid touching that data, the admin
portal's entire schema lives in its own Postgres schema, `admin`, via Prisma's
`multiSchema` feature (`schemas = ["admin"]` in `prisma/schema.prisma`).

**Migration workflow caveat:** Postgres migration history (`_prisma_migrations`)
is a single table shared by the whole database, not scoped per schema. Because
it already has 4 migration rows from the pre-existing `public` schema project,
`prisma migrate dev` cannot run normally here — it sees those rows, doesn't
recognize them locally, and asks to reset. **Never accept that reset prompt.**

The `admin` schema was baselined once (`prisma/migrations/20260910000000_init`)
via `prisma migrate diff` + `prisma migrate resolve --applied`, which only adds
a row to `_prisma_migrations` without touching anything else. For any future
schema change, use the same pattern instead of `migrate dev`:

```bash
# 1. edit prisma/schema.prisma, then push the change directly
npm run prisma:push

# 2. generate the matching SQL for the record (optional but recommended)
./node_modules/.bin/prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script > prisma/migrations/<timestamp>_<name>/migration.sql

# 3. mark it applied so migrate status stays accurate
./node_modules/.bin/prisma migrate resolve --applied <timestamp>_<name>
```

`prisma migrate status` works fine read-only and correctly reports "up to date".

## External dependencies to supply

See `.env.example` for the full list. Required before the app is fully functional:

1. **`IMAGEKIT_PRIVATE_KEY`** / **`IMAGEKIT_URL_ENDPOINT`** (ImageKit dashboard →
   Developer options → API keys) — needed for both file categories below.
   No bucket setup needed — ImageKit organizes files by folder path, and
   `src/lib/imagekit.ts` creates `/vendor-documents/<vendorId>/...` and
   `/vendor-media/<vendorId>/...` folders automatically on first upload.
   - Vendor verification documents are uploaded with `isPrivateFile: true` and
     only ever served via a short-lived signed URL (`getSignedDocumentUrl`) —
     never a stable public link.
   - Vendor gallery/cover photos (Phase 2) are uploaded as regular (public)
     files; the returned CDN `url` is stored directly on `VendorMedia.mediaUrl`,
     and the ImageKit `fileId` is stored in `VendorMedia.externalId` so photos
     can be deleted later via `client.files.delete(fileId)`.
2. `NEXTAUTH_SECRET` / `NEXTAUTH_URL` and `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`
   are already generated in `.env` for local dev — rotate them for anything
   beyond local use.

## Local dev

```bash
npm install
npm run prisma:generate
npm run prisma:seed     # roles, permissions, vendor categories, facilities, super admin
npm run dev
```

Login at `/login` with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from `.env`.

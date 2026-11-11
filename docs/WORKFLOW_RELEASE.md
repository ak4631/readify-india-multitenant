# Versioned listing workflow: verification and rollout

Local implementation is complete for the requested management flow. Production rollout and the original Vercel #441 diagnosis remain separate gates. The authorized Supabase migration was applied on 11 November 2026; postflight verification passed. The website deployment is unchanged. The steps below remain the rollout procedure for other environments.

## Before deployment

1. Back up the target database and rehearse on a staging clone. Confirm the target's migration history and schema; the configured backend now has the new workflow migration applied. Five historical checksums differ from local files and were not rewritten or replayed. See `SUPABASE_VERIFICATION.md`.
2. Confirm all preceding release migrations are applied. Do not replay historical migrations blindly. The fresh local test harness excludes the documented historical duplicate seat delta and two PostgreSQL 18 constraint renames; it is not a production migration installer.
3. Temporarily stop staff content writes while switching application versions. Older application instances use individual pending changes and must not review the new envelopes concurrently.
4. Apply the additive migration using the existing reviewed installer against the intended staging environment:

   ```sh
   node scripts/apply-migration.js prisma/migrations/20261111120000_versioned_listing_review
   npm run prisma:generate
   npm run build -- --webpack
   ```

   `DIRECT_URL` must identify that environment. Do not use `db push`, reset the schema, or reseed existing roles. The installer checks migration history/checksums and records the application atomically.
5. Deploy the matching application. Verify partner login, Facilities save, each enabled category's setup, document viewing/upload, complete submission, approve/reject, explicit publication, proposed/live isolation, whole-revision decisions, withdrawal/correction, and each partner module using two distinct organizations. Verify support/refund permissions with representative roles.
6. Confirm customer discovery and checkout use the same published-listing predicate. Check the mobile app on a device, including stale listing links, refocusing details, existing purchases, payment callback/webhook retries, and unavailable services. No new trainer/course purchase model is introduced. Disabled services remain disabled until their supported customer journey passes staging QA.
7. Reproduce the original Vercel Facilities failure using its affected listing and correlate the displayed digest with server logs. A local passing save does not establish its production cause.

## Existing data

- Existing live content and purchase/reservation IDs remain intact; content starts at version zero.
- Existing pending changes are grouped into a frozen `legacy-<listing ID>` revision. They are not published automatically. Incomplete legacy content can fail today's readiness checks; reject/copy/correct it rather than bypassing those checks.
- Legacy unversioned listings under review have an explicit Super Admin **Return legacy review to draft** action. Complete setup and submit a versioned review.
- Already approved legacy listings may be explicitly published after readiness checks. Historical approval evidence is not fabricated.
- New proposals remain draft until explicitly submitted. Saving is not submission. Publication remains explicit after initial approval.

## Local repeatable verification

```sh
npm test
npm run test:integration
npm run build -- --webpack
```

The integration suite uses isolated PGlite. Its two opt-in Prisma tests also passed against a disposable PostgreSQL 17 database. Never point them at production merely to eliminate skips.

`scripts/verification/prepare-workflow-database.ts` prepares a **fresh**, already-created loopback database named `readify_workflow_test`. It refuses other names/hosts and never loads `.env`. It installs synthetic users, permissions and a complete Library draft; its password is test-only. Set `WORKFLOW_TEST_DATABASE_URL` explicitly, then run it using `tsx`. Run the production build on port 3107 with `DATABASE_URL`, `DIRECT_URL`, `NEXTAUTH_URL`, and `NEXTAUTH_SECRET` explicitly set to this isolated environment. Then run `scripts/verification/check-workflow.ts` with the same `WORKFLOW_TEST_DATABASE_URL`. If necessary, set `WORKFLOW_CHROMIUM_PATH` to an installed Chromium executable. Each repeat needs a fresh fixture database.

The browser script covers draft Facilities save and persistent feedback, setup section rendering, exact submission, initial approval/publication, public-view visibility, proposed/live facilities isolation, revision approval, rejection, copy for correction, withdrawal, all partner modules, and cross-tenant denial. It does not call ImageKit, Supabase authentication, or Razorpay. External upload/signing and payment settlement still require staging configuration and QA.

## Recovery

Prefer a forward fix. If an application rollback is necessary, stop staff writes/reviews first: an old build does not understand draft envelopes or batch decisions. Keep the additive tables, evidence, versions and audit history. Do not run a destructive down migration or turn pending proposals into published content. Restore writes only with a compatible application and verified schema.

Unknown-commit upload failures can leave unreferenced provider assets; review these against database references before cleanup. Never delete provider files just because a client timed out. Existing un-attributed audit history remains available through the global history; only safely attributable history is shown inside a partner.

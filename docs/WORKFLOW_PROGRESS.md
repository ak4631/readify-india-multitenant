# Whole-flow implementation progress

Updated: 11 November 2026

The [whole-flow plan](WHOLE_FLOW_IMPLEMENTATION_PLAN.md) is implemented locally for the requested management workflow. The [release guide](WORKFLOW_RELEASE.md) records staging and deployment gates. On explicit user instruction, the configured Supabase backend received `20261111120000_versioned_listing_review` on 11 November 2026. The website application has not been deployed.

## Delivered

- **Partner applications:** approval remains separate from listing publication. Rejected applicants can reapply with their existing verified password. Version checks reject stale decisions; prior reasons remain in the audit history. Current account, role, partner activation and approval are checked on protected requests.
- **Complete draft setup:** resumable basic details, location, documents, facilities, hours, category configuration, plans, photos, and review sections. Shared server readiness prevents incomplete submission from any entry point. Coordinates of zero and nullable database values are handled. Operational bookings/customers/payments are not onboarding prerequisites.
- **Versioned initial review:** immutable submission snapshots and hashes, explicit review decisions against a submission version, verified-document/readiness checks, then explicit publication. Initial review freezes content edits. Legacy unversioned review has an explicit return-to-draft path.
- **Later changes:** live content remains the approved baseline. Editable draft envelopes collect related changes; submission freezes their evidence. Super Admin approves/rejects the entire exact revision transactionally. Base-version/digest conflicts, repeat decisions, withdrawal, rejection feedback, copy for correction, related creates/edits and removing proposed dependencies are handled. Legacy pending changes are retained and grouped during migration.
- **Approval coverage:** listing profile/location, facilities, schedule, plans/prices, seats/capacity, media, Gym trainers/pricing/availability, Co-working menus, Exam Hub teachers/courses/lectures, documents and owner replies use the revision boundary. Daily operational controls retain their existing permissions.
- **Facilities:** validated/deduplicated bounded selection; draft versus proposed feedback; expected conflicts readable; proposed selections retained. A confirmed local refresh/remount bug that erased saved feedback was fixed. Section-specific loading prevents an unrelated occupancy or subscription query from crashing Facilities rendering. A safe route error boundary exposes a digest and warns that a save may already have committed.
- **Partner workspaces:** organization header, overview, listings, plans, subscriptions, bookings, customers, service management, payments, reviews, team, approvals, support and attributable history. Selected-partner scope flows into server queries/counts/pagination; route IDs override forged tenant query parameters. Existing global management routes remain available.
- **Super Admin overview:** actual-live listing/partner totals and category distribution, pending applications, submissions/publication, revisions, documents, rejected/suspended issues, support and refunds. Top-level navigation focuses on platform control and partner workspaces.
- **Access and safety:** platform-only global metrics; Super Admin plus permission required for listing/document decisions; mixed/detached partner roles cannot become platform staff; empty tenant scope remains empty. Both team and global user controls protect the last active partner owner, self suspension and Super Admin accounts.
- **Customer compatibility:** published-listing view and nearby discovery now require an active approved partner as well as an enabled category and published listing. Public fields and purchase IDs remain compatible. Mobile listing details/plans refresh when the screen regains focus and clear stale plan choices while loading. Existing ZEROTHAM branding is preserved.
- **Operations/data:** additive migration preserves customer purchases/reservations; partner audit attribution, notifications and action queues are integrated. Unsupported new service purchase products are not invented and disabled categories are not enabled automatically.

## Verification evidence

| Check | Result |
| --- | --- |
| Unit suite | **109 passed** across 17 files |
| Isolated migration/workflow database suite | **17 passed**; 2 opt-in database tests skipped by default |
| Full integration suite against disposable PostgreSQL 17 | **19 passed**, including the 2 opt-in Prisma tests; no skips |
| Authenticated Chromium + real Next.js/Prisma/PostgreSQL | **Passed**: Facilities draft save and persistent feedback; all setup sections; exact submission; initial approval/publication; public visibility; proposed/live separation; revision approval; rejection; copy for correction; withdrawal; all partner modules; cross-tenant denial |
| Website production build | **Passed**, `npm run build -- --webpack` |
| Website TypeScript / ESLint | **Passed** on final changed files |
| Mobile TypeScript / changed-file ESLint | **Passed** after the focus refresh change |
| Default Turbopack build | Environment prevents worker port binding; webpack verification succeeds; default project configuration unchanged |

Browser verification discovered two migration defects that mocks alone did not catch: the old status constraint excluded draft/withdrawn changes, and the old pending-target unique index prevented creating and subsequently editing the same proposed entity in one revision. The additive migration now replaces that constraint and removes the superseded index; database regressions cover both.

Repeatable local browser/database scripts live in `scripts/verification/`. They require an explicit loopback database named `readify_workflow_test` and use synthetic accounts only. All remote environment values and credentials were kept out of reports.

## Remaining release gates

- **Original production Facilities #441:** not reproduced against Vercel. The Supabase retry now succeeds through both pooled and direct connections; Auth and public listing REST endpoints return HTTP 200 for website/mobile configurations. No matching Vercel server log/digest is available. Local Facilities save now passes, but the original production cause is unverified. Do not claim that error is fixed on the deployed site.
- **Target schema and rollout:** the new migration is now applied and recorded with the matching checksum. A restricted local admin/public backup was taken first. Read-only postflight and pooled Prisma checks pass; all 11 checked record counts and the public listing count are preserved. Historical migrations were not replayed or their checksums rewritten. The matching website application still needs deployment and authenticated verification. Old/new review implementations must not write concurrently.
- **External services:** real ImageKit upload/private URL signing, Supabase customer authentication, Razorpay settlement/webhooks/refunds, email delivery and mobile device behavior require configured staging QA. Synthetic local tests do not prove these integrations. The mobile source change has not produced a new signed release APK in this increment.
- **Multi-service launch:** service editors and approval entry points are covered by unit tests; the authenticated end-to-end browser journey used Library. Gym, Co-working and Exam Hub require service-specific staging/customer acceptance before enabling sales. No new trainer/course checkout product was added.
- **Scale and policy checks:** the plan's full edge-case register remains a staging QA checklist; this is not a claim that all 80 groups were manually exercised. Provider orphan cleanup, real large-tenant performance, timezone/device behavior, accessibility, signed-link expiry and production schema drift need representative environments. Existing employee-wide listing access and optional cover-photo policy were preserved.

No live release is represented as complete by a local build. The implementation is reviewable in the working tree, with additive SQL, focused tests and rollout/recovery instructions.

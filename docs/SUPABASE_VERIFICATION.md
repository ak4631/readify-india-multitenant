# Supabase backend retry

Checked 11 November 2026. All database inspection used read-only transactions. No remote schema, account, listing, or purchase records were changed.

| Check | Result |
| --- | --- |
| Website pooled connection | Connected, PostgreSQL 17.6 |
| Website direct connection | Connected, PostgreSQL 17.6 |
| Website Supabase Auth health | HTTP 200 |
| Mobile Supabase Auth health | HTTP 200 |
| Website and mobile public listing REST | HTTP 200, zero-record query |
| Facilities references | No orphan facility or listing links |
| Occupancy summary helper | Present |
| New workflow migration | Not recorded/applied |
| Revision/submission tables and new version columns | Absent |
| Public discovery partner approval predicate | New predicate not yet installed |

The only local migration name missing from the target's recorded migration history is `20261111120000_versioned_listing_review`. All recorded migrations have completion markers and no rollback markers. The new application requires the missing workflow schema; successful connectivity alone does not verify that application against this backend.

Five recorded historical checksums differ from current local migration files:

- `20260913150000_bridge_customer_bookings`
- `20260919100000_add_customer_subscriptions`
- `20260926100000_library_seat_hours_availability`
- `20261018120000_library_launch_integrity`
- `20261018150000_purchase_availability`

Checksum differences identify migration-file/history differences, not proof of any particular live schema defect. Reconcile deployed definitions before rollout; do not replay those migrations or rewrite their history to silence the differences. Use the staging/backup/deployment steps in [WORKFLOW_RELEASE.md](WORKFLOW_RELEASE.md).

The original deployed Facilities React #441 cause remains unverified without its matching server exception. Connectivity, reference integrity and local passing browser checks do not establish that cause.

## Authorized migration application

Applied `20261111120000_versioned_listing_review` on 11 November 2026, after explicit user instruction. Before applying it, the affected live discovery view/function signatures and required constraint/index were checked. A restricted local custom-format backup of admin/public was created at `/private/tmp/readify-migration-backup/admin-public-before.dump`. This is a local backup; keep it secure and available until rollout verification finishes.

The existing migration installer committed the additive SQL and its checksum/history entry in one transaction. No historical migration was replayed or history rewritten.

Postflight verification passed:

- Exact migration checksum recorded as finished, without rollback.
- Both new review tables and all five required version/attribution columns present.
- Customer roles cannot read private review tables.
- Published discovery now checks partner approval; its visible count is unchanged.
- Nearby discovery RPC executes successfully.
- Pooled Prisma reads against the new revision/submission models and partner application version succeed.
- All 11 checked counts are unchanged: partners, users, vendors, bookings, subscriptions, payment orders, seats, reservations, facilities links, listing changes and audit logs.

No synthetic test records were inserted into Supabase. Application deployment and authenticated verification of that deployment remain outstanding. This migration result does not establish the original Vercel #441 cause.

# Flexible day-pass plans + direct category navigation

Built 2026-09-28. Two independent features, documented together because they
were built in the same session.

## 1. Flexible day-pass plans (every category)

### Problem this solves
Before this, a `MembershipPlan` always had one fixed `price` for one fixed
`durationValue`/`durationUnit` — set once by the partner, never touched by the
customer. There was no way to offer "however many days you want" pricing. A
partner asked for exactly that, for every category (library, gym,
co-working-space, exam-hub): set a rate, let the customer pick 1–14 days with
a `+`/`-` stepper, see the total update live.

### Data model
`admin.membership_plans` gains one column (Prisma: `MembershipPlan.isFlexible`,
`prisma/schema.prisma`):

```prisma
isFlexible Boolean @default(false) @map("is_flexible")
```

A `CHECK` constraint enforces the only shape a flexible plan is allowed to
have:

```sql
CHECK (NOT is_flexible OR (duration_unit = 'HOURS' AND daily_hours IS NOT NULL))
```

When `isFlexible = true`:
- `price` is reinterpreted as a **per-hour rate**, not a lump sum.
- `dailyHours` becomes **required** (it's optional/nullable for every other
  plan shape) — this is what makes the customer-facing total instantly
  computable on the client with no network round trip as the stepper moves:
  `total = price × dailyHours × days`.
- `durationValue`/`durationUnit` are fixed to `1`/`HOURS` by the admin form
  and are otherwise unused for pricing or span calculation.

Migration: `prisma/migrations/20260928120000_flexible_day_pass/migration.sql`.
**Not applied to production yet** — see [Status](#status) below.

### Why a subscription, not a booking
A flexible pass is always created via `create_customer_subscription`, **even
when the customer picks just 1 day** — never through `create_customer_booking`
(the single-visit path). Reasoning: a flexible pass is inherently "hold a
seat/slot for a date range", which is exactly what a subscription already is;
1 day is just a range of length 1. This means:
- One code path to reason about and test, not two.
- It reuses, unchanged: seat auto-assignment (`admin.pick_seat_for_span`),
  the daily-slot-fits-schedule check (`admin.slot_fits_schedule`), and the
  existing "one active subscription per vendor" partial unique index. A
  customer cannot hold a flexible pass and another subscription at the same
  vendor simultaneously — same rule as any other plan.
- Non-seat categories (gym/co-working-space/exam-hub) get the pass **with no
  capacity check at all**, identical to how their ordinary multi-day
  subscriptions already behave today. This was a deliberate choice (see
  [Decisions](#decisions)) to keep the change small — a real capacity-tracking
  system for non-seat categories would be a separate, bigger project.

### RPC changes
Both in the new migration, both via `DROP FUNCTION` + `CREATE OR REPLACE`
(required because their signatures/return shapes change — `CREATE OR REPLACE`
alone only works when the signature is byte-identical):

**`create_customer_subscription(p_vendor_id, p_plan_id, p_seat_id, p_start_time, p_days)`**
— gained the trailing `p_days integer DEFAULT NULL`. Behavior:
- `is_flexible = true`: `p_days` is required, validated `BETWEEN 1 AND 14`
  (`RAISE EXCEPTION 'Choose between 1 and 14 days'` otherwise). Span becomes
  `v_start + (p_days || ' days')::interval` instead of the plan's fixed
  `duration_value`/`duration_unit`. Amount becomes
  `v_plan_price * v_slot_hours * p_days` instead of the flat `v_plan_price`.
  `v_slot_hours` is `plan.daily_hours` directly (required, so no
  coalesce-to-opening-window fallback needed, unlike ordinary plans).
- `is_flexible = false`: byte-identical to before `p_days` existed — the
  parameter is simply ignored.

**`get_library_subscription_options(p_vendor_id, p_plan_id, p_days)`** — same
trailing addition. For a flexible plan, `p_days` sizes the seat-availability
window (`v_to`) instead of deriving it from the plan's fixed duration — so the
"N seats available" count shown to the customer reflects *their currently
selected day count*, not a fixed span. A seat free for 2 days will correctly
disappear from a 5-day request. Returns no rows if `p_days` is out of range
(read path fails soft; the write path above raises instead).

`create_customer_booking` and `get_library_slot_options` are **untouched** —
flexible plans never reach the single-visit path.

### Admin UI
`src/components/vendors/plans/plan-form-dialog.tsx`: a "Flexible plan
(customer picks 1-14 days at checkout)" checkbox. Toggling it on:
relabels Price → "Rate per hour (₹)", hides Duration Value/Unit (auto-set to
`1`/`HOURS` via a `useEffect` on the form), and always shows + requires the
"Hours per day" field (already existed for DAYS/MONTHS/YEARS plans, reused
here). Validation lives in `src/lib/validations/membership-plan.schema.ts`
(`.refine` checks mirroring the DB `CHECK`).

### Customer app (`reactnative-readify`)
- `components/DayStepper.tsx` — the `+`/`-` control (exports
  `MIN_FLEX_DAYS`/`MAX_FLEX_DAYS` = 1/14), shows the live
  `price × dailyHours × days` total.
- `screens/SubscribeScreen.tsx` — flexible plans are included in the
  subscribe-eligible list (`isSubscribable()`, alongside DAYS/MONTHS/YEARS).
  First tap on a flexible plan's CTA opens `DayStepper` (and, for a seat
  vendor, `SlotPicker` too, since a day pass still needs a daily time slot);
  changing the day count re-fetches `get_library_subscription_options` for
  seat vendors so the seat count reflects the new span; a second tap confirms
  and calls `createSubscription(vendorId, planId, startTime, days)`.
- `lib/plans.ts` — `Plan.is_flexible`; `formatPlanDuration` shows
  `"₹{price}/hr · pick 1-14 days"` for a flexible plan.
- `lib/libraryAvailability.ts` — `visitPlanHours()` returns `null` for a
  flexible plan, which is what keeps it out of the single-visit
  `screens/BookingScreen.tsx` flow entirely.
- `lib/subscriptions.ts` — `createSubscription()` gained an optional `days`
  param, forwarded as `p_days`.

### Decisions made (asked of the product owner before building)
1. **Pricing basis**: rate × the vendor's daily-hours setting × days (not a
   flat per-day rate) — matches the "admin sets a rate for 1 hour" framing.
2. **Non-seat category capacity**: stays uncapped, matching existing
   subscription behavior for those categories, rather than building new
   capacity tracking.
3. **Opt-in per plan**: a partner explicitly turns this on per plan (the
   checkbox above) — not automatic, not a replacement for fixed-price plans.

## 2. Home category tiles navigate straight to a listing

### Problem this solves
Tapping a category tile on the customer app's Home screen used to call
`navigation.navigate('Explore', { initialCategory: category.id })` — which
only seeds Explore's filter state once on mount. The result: tapping a
category still showed Explore's own search bar and full category-chip row,
not a focused view of just that category.

### What changed
- New `reactnative-readify/screens/CategoryListingScreen.tsx`: one category,
  no search bar, no category chips — just a header (`components/ScreenHeader`)
  with the category name and a plain card list. Reuses the same data sources
  Explore already uses (`published_listings` fallback, `fetchNearbyVendors`
  once a location is saved), just filtered server-side to one category
  instead of client-side across all of them.
- Registered in `navigation/AppNavigator.tsx` / `navigation/types.ts` as
  `CategoryListing: { categoryId: string; categoryName: string }`.
- `screens/HomeScreen.tsx`'s category grid now calls
  `navigation.navigate('CategoryListing', { categoryId, categoryName })`
  instead.

**Explore itself was not touched** — its own category chips, search bar, and
`initialCategory` param handling are all exactly as they were; it's still
reached the same other ways (search bar tap, "See all" links, bottom nav).

## Status

- Both features are fully built and verified in this repo, but the migration
  (`20260928120000_flexible_day_pass`) is **not yet applied to the live
  database**. Apply it the same way as every other migration in this
  project — see `docs/SETUP.md` — e.g.
  `node scripts/apply-migration.js 20260928120000_flexible_day_pass`.
- Verified by running the migration against a real (embedded) Postgres
  instance with a scenario matching the pricing formula, the seat-span
  exclusion by day count, the 1–14 day range validation, uncapped non-seat
  behavior, and a regression check that ordinary (non-flexible) plans are
  completely unaffected. `tsc`/`eslint` clean on both apps; admin's existing
  unit test suite unaffected.
- No customer app rebuild has happened since these changes — build a fresh
  release APK before testing this on a device.

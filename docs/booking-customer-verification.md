# Booking details and temporary OTP

Customers complete full name, international mobile number, education / occupation, primary purpose, and optional requirements once in Complete Profile. Choosing Other requires a short explanation. Home and Account show an explicit Complete profile action until the profile is ready. Home does not automatically navigate away after sign-in; customers can browse immediately and open profile setup when ready. Account provides an Edit profile action.

Booking checks profile eligibility before preparing a payment or offline reservation. Complete, phone-verified profiles go straight to review and payment without another form or confirmation click. Incomplete profiles are sent to Complete Profile with their selected library, plan, date, time, and duration preserved. Successful OTP verification finishes setup and automatically resumes the selected booking. Changing the phone invalidates verification and requires another OTP. Network failures remain retryable and do not reserve capacity.

## Deployment

Deploy the backend and mobile changes together; older app builds cannot create new checkouts without completing customer details. Existing checkout retries still return their original order.

Before enabling the release, apply the additive migration using the existing migration runner:

```sh
npm run prisma:apply -- 20261123190000_booking_customer_details
```

The runner requires earlier migrations to be applied. The migration adds server-owned details and booking snapshot tables in the admin schema; it leaves historical bookings unchanged.

Configure the backend for the temporary OTP:

```dotenv
BOOKING_OTP_MODE=static
```

Static mode accepts **123456**, sends no SMS, and is clearly identified as a test in the app and staff views. It does not prove ownership of a phone number. Production defaults to disabled unless static mode is explicitly configured. Development defaults to static. No SMS credentials are needed.

Codes require an authenticated customer, saved matching phone, and an issued challenge. Challenges expire in five minutes, allow five incorrect attempts, and can be requested once per minute. Attempt counters and cooldowns persist in Postgres and are serialized per customer. Successful verification consumes the challenge. Changing the phone invalidates the saved proof and current challenge.

Checkout validates details on the server before reserving capacity. Contact details are snapshotted in the same transaction as the new reservation. Vendor booking and subscription views use authorized target IDs to load the snapshots; customer API responses never expose OTP challenge state or attempt counters.

## Future SMS provider

Replace the static delivery and code check in `src/lib/booking-details.ts` with provider-backed challenge issuance and verification. Store `sms` as the verification method only after provider success. Keep the number binding, expiry, attempt limits, and transaction boundaries. Disable static mode when switching: static verification evidence then stops satisfying the booking gate, so customers must verify again.

This release does not add visit tracking or a follow-up CRM workflow.

## One account per verified mobile number

A normalized phone can be verified by one account. Saving details, requesting a code, and verifying a code reject a number already verified by another account. Draft profiles do not reserve numbers. Changing the owning account's phone releases its old number and requires verification of the replacement. Phone-level transaction locks and a partial unique index prevent concurrent duplicate links.

Apply migration `20261125010000_unique_verified_customer_phone` before deploying the server changes. For existing duplicates it retains the earliest verified account (user ID breaks a timestamp tie) and clears later duplicate verification and OTP challenges. Accounts and historical booking snapshots are preserved. Those later accounts must use a different number to complete their profiles.

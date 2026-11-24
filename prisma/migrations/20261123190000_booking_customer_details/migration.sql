-- Customer-entered data and OTP evidence stay server-owned, outside public.profiles.
CREATE TABLE admin.customer_booking_details (
  user_id text PRIMARY KEY,
  full_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  education text NOT NULL DEFAULT '',
  purpose text NOT NULL DEFAULT '',
  requirements text NOT NULL DEFAULT '',
  phone_verified_at timestamptz,
  verification_method text CHECK (verification_method IN ('static', 'sms')),
  challenge_id text,
  challenge_expires_at timestamptz,
  requested_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0)
);
CREATE TABLE admin.booking_customer_snapshots (
  target_id text PRIMARY KEY,
  user_id text NOT NULL,
  full_name text NOT NULL,
  phone text NOT NULL,
  education text NOT NULL,
  purpose text NOT NULL,
  requirements text NOT NULL,
  phone_verified_at timestamptz NOT NULL,
  verification_method text NOT NULL
);
REVOKE ALL ON admin.customer_booking_details, admin.booking_customer_snapshots FROM PUBLIC, anon, authenticated;

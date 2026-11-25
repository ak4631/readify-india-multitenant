-- A phone belongs to its first verified account. Preserve accounts and all
-- booking snapshots, but revoke verification granted later to another account.
LOCK TABLE admin.customer_booking_details IN SHARE ROW EXCLUSIVE MODE;
WITH linked AS (
  SELECT user_id, row_number() OVER (
    PARTITION BY phone ORDER BY phone_verified_at, user_id
  ) AS position
  FROM admin.customer_booking_details
  WHERE phone_verified_at IS NOT NULL
)
UPDATE admin.customer_booking_details d
SET phone_verified_at = NULL, verification_method = NULL,
    challenge_id = NULL, challenge_expires_at = NULL, requested_at = NULL, attempts = 0
FROM linked WHERE linked.user_id = d.user_id AND linked.position > 1;

-- Draft profiles do not reserve a phone; ownership starts at verification.
CREATE UNIQUE INDEX customer_booking_details_verified_phone_key
  ON admin.customer_booking_details (phone)
  WHERE phone_verified_at IS NOT NULL;

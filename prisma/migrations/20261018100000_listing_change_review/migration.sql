CREATE TABLE admin.listing_changes (
  id text PRIMARY KEY,
  vendor_id text NOT NULL REFERENCES admin.vendors(id) ON DELETE CASCADE,
  kind text NOT NULL,
  target_id text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  requested_by text NOT NULL REFERENCES admin.users(id),
  reviewed_by text REFERENCES admin.users(id),
  reason text,
  created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at timestamp(3)
);
CREATE INDEX listing_changes_vendor_id_status_idx ON admin.listing_changes(vendor_id, status);
CREATE UNIQUE INDEX listing_changes_one_pending_target ON admin.listing_changes(vendor_id, (split_part(kind,'_',1)), target_id) WHERE status = 'PENDING';

CREATE TABLE admin.portal_notifications (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES admin.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  href text,
  read_at timestamp(3),
  created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX portal_notifications_user_id_created_at_idx ON admin.portal_notifications(user_id, created_at);
ALTER TABLE admin.reviews ADD COLUMN owner_reply text, ADD COLUMN replied_at timestamp(3);
ALTER TABLE admin.membership_plans ADD COLUMN daily_start varchar(5);
ALTER TABLE admin.membership_plans ADD CONSTRAINT membership_plans_daily_start_valid
  CHECK (daily_start IS NULL OR daily_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

-- Persist the moderation boundary even for installations with previously seeded roles.
DELETE FROM admin.role_permissions rp USING admin.roles r, admin.permissions p
WHERE rp.role_id = r.id AND rp.permission_id = p.id
  AND r.name IN ('PARTNER_ADMIN', 'PARTNER_EMPLOYEE')
  AND p.key IN ('review.hide', 'review.delete', 'review.restore');

-- Private portal records must not be reachable through customer PostgREST roles.
REVOKE ALL ON admin.listing_changes, admin.portal_notifications FROM anon, authenticated;

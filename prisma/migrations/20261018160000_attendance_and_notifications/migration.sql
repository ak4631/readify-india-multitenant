CREATE TABLE admin.attendance_visits (
  id text PRIMARY KEY, vendor_id text NOT NULL REFERENCES admin.vendors(id), user_id text NOT NULL,
  target_id text NOT NULL, service_date date NOT NULL, checked_in_at timestamptz(3) NOT NULL DEFAULT now(),
  checked_out_at timestamptz(3), admitted_by text NOT NULL REFERENCES admin.users(id), released_by text REFERENCES admin.users(id),
  CHECK(checked_out_at IS NULL OR checked_out_at>=checked_in_at)
);
CREATE UNIQUE INDEX attendance_one_open_visit ON admin.attendance_visits(target_id) WHERE checked_out_at IS NULL;
CREATE INDEX attendance_visits_target_id_service_date_idx ON admin.attendance_visits(target_id,service_date);
CREATE INDEX attendance_visits_vendor_id_checked_out_at_idx ON admin.attendance_visits(vendor_id,checked_out_at);
CREATE TABLE admin.customer_notifications (
  id text PRIMARY KEY, user_id text NOT NULL, event_key text NOT NULL UNIQUE, title text NOT NULL, body text NOT NULL,
  read_at timestamp(3), created_at timestamp(3) NOT NULL DEFAULT now()
);
CREATE INDEX customer_notifications_user_id_created_at_idx ON admin.customer_notifications(user_id,created_at);
CREATE VIEW public.customer_notifications AS SELECT id,title,body,read_at,created_at FROM admin.customer_notifications WHERE user_id=auth.uid()::text;
GRANT SELECT ON public.customer_notifications TO authenticated;
CREATE FUNCTION public.mark_customer_notification_read(p_id text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,admin AS $$
  UPDATE admin.customer_notifications SET read_at=now() WHERE id=p_id AND user_id=auth.uid()::text AND read_at IS NULL
$$;
REVOKE ALL ON FUNCTION public.mark_customer_notification_read(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mark_customer_notification_read(text) TO authenticated;
CREATE TABLE admin.support_tickets (
  id text PRIMARY KEY, user_id text NOT NULL REFERENCES admin.users(id), partner_id text REFERENCES admin.partners(id),
  subject text NOT NULL, message text NOT NULL, status text NOT NULL DEFAULT 'OPEN' CHECK(status IN('OPEN','RESOLVED')),
  response text, responded_by text REFERENCES admin.users(id), created_at timestamp(3) NOT NULL DEFAULT now(), updated_at timestamp(3) NOT NULL
);
CREATE INDEX support_tickets_partner_id_status_idx ON admin.support_tickets(partner_id,status);
REVOKE ALL ON admin.attendance_visits,admin.customer_notifications,admin.support_tickets FROM anon,authenticated;

INSERT INTO admin.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM admin.roles r CROSS JOIN admin.permissions p WHERE r.name IN('PARTNER_ADMIN','PARTNER_EMPLOYEE') AND p.key='dashboard.read' ON CONFLICT DO NOTHING;

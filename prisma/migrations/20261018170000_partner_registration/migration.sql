ALTER TABLE admin.partners ADD COLUMN approval_status text NOT NULL DEFAULT 'APPROVED' CHECK(approval_status IN('PENDING','APPROVED','REJECTED')),
  ADD COLUMN application_reason text, ADD COLUMN requested_service_id text REFERENCES admin.vendor_categories(id);
ALTER TABLE admin.partners ADD CONSTRAINT partner_activation_requires_approval CHECK(status<>'ACTIVE' OR approval_status='APPROVED');
CREATE TABLE admin.request_throttles(key text PRIMARY KEY,count integer NOT NULL,expires_at timestamptz(3) NOT NULL);
REVOKE ALL ON admin.request_throttles FROM anon,authenticated;
INSERT INTO admin.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM admin.roles r CROSS JOIN admin.permissions p WHERE r.name='PARTNER_EMPLOYEE' AND p.key IN ('partnerUser.read','review.read') ON CONFLICT DO NOTHING;

CREATE VIEW public.customer_payment_orders AS
SELECT id,target_id,target_type,amount_paise,status,captured_at,created_at FROM admin.payment_orders WHERE user_id=auth.uid()::text;
GRANT SELECT ON public.customer_payment_orders TO authenticated;

CREATE TABLE admin.customer_push_tokens (
  token text PRIMARY KEY CHECK(length(token) BETWEEN 20 AND 4096),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform text NOT NULL DEFAULT 'android' CHECK(platform='android'),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customer_push_tokens_user_id_idx ON admin.customer_push_tokens(user_id);
CREATE TABLE admin.customer_push_deliveries (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  notification_id text NOT NULL REFERENCES admin.customer_notifications(id) ON DELETE CASCADE,
  token text NOT NULL REFERENCES admin.customer_push_tokens(token) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN('PENDING','SENT','FAILED','EXPIRED')),
  attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz, expires_at timestamptz NOT NULL, sent_at timestamptz, last_error text,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(notification_id,token)
);
CREATE INDEX customer_push_deliveries_status_next_attempt_at_idx ON admin.customer_push_deliveries(status,next_attempt_at);
REVOKE ALL ON admin.customer_push_tokens,admin.customer_push_deliveries FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.register_customer_push_token(p_token text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,admin AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active) THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_token IS NULL OR length(p_token) NOT BETWEEN 20 AND 4096 THEN RAISE EXCEPTION 'Invalid push token'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_token,2));
  -- A device changing accounts must not retain deliveries for the previous owner.
  DELETE FROM admin.customer_push_tokens WHERE token=p_token AND user_id<>auth.uid();
  IF NOT EXISTS(SELECT 1 FROM admin.customer_push_tokens WHERE token=p_token) AND
    (SELECT count(*) FROM admin.customer_push_tokens WHERE user_id=auth.uid())>=20 THEN
    RAISE EXCEPTION 'Too many registered devices';
  END IF;
  INSERT INTO admin.customer_push_tokens(token,user_id) VALUES(p_token,auth.uid())
  ON CONFLICT(token) DO UPDATE SET updated_at=now();
END $$;
CREATE FUNCTION public.unregister_customer_push_token(p_token text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,admin AS $$
  DELETE FROM admin.customer_push_tokens WHERE token=p_token AND user_id=auth.uid()
$$;
REVOKE ALL ON FUNCTION public.register_customer_push_token(text),public.unregister_customer_push_token(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.register_customer_push_token(text),public.unregister_customer_push_token(text) TO authenticated;

CREATE FUNCTION admin.queue_customer_push() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,admin AS $$
DECLARE deadline timestamptz := now()+interval '24 hours';
BEGIN
  IF NEW.event_key LIKE 'booking-reminder:%' THEN
    SELECT lower(r."window") INTO deadline FROM admin.seat_reservations r
    WHERE 'booking-reminder:'||r.source_id||':'||extract(epoch FROM lower(r."window"))::text=NEW.event_key LIMIT 1;
    IF deadline IS NULL OR deadline<=now() THEN RETURN NEW; END IF;
  END IF;
  INSERT INTO admin.customer_push_deliveries(notification_id,token,user_id,expires_at)
  SELECT NEW.id,t.token,t.user_id,deadline FROM admin.customer_push_tokens t
  JOIN public.profiles p ON p.id=t.user_id AND p.is_active
  WHERE t.user_id::text=NEW.user_id ON CONFLICT(notification_id,token) DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER queue_customer_push AFTER INSERT ON admin.customer_notifications FOR EACH ROW EXECUTE FUNCTION admin.queue_customer_push();
REVOKE ALL ON FUNCTION admin.queue_customer_push() FROM PUBLIC,anon,authenticated;

-- One ledger enforces overlap protection across single visits, Flex and subscriptions.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM admin.subscriptions s JOIN admin.membership_plans p ON p.id=s.plan_id WHERE p.is_flexible AND s.status IN ('ACTIVE','PENDING')) THEN
    RAISE EXCEPTION 'Legacy flexible subscriptions exist. Review and migrate their entitlements explicitly before deploying the new Flex model.';
  END IF;
END $$;
CREATE TABLE admin.flex_bookings (
  id text PRIMARY KEY, user_id text NOT NULL, vendor_id text NOT NULL REFERENCES admin.vendors(id),
  plan_id text NOT NULL REFERENCES admin.membership_plans(id), seat_id text NOT NULL REFERENCES admin.library_seats(id),
  start_date date NOT NULL, days integer NOT NULL CHECK (days BETWEEN 1 AND 14),
  slot_start time NOT NULL, slot_hours integer NOT NULL CHECK (slot_hours BETWEEN 1 AND 24),
  amount numeric(10,2) NOT NULL CHECK (amount > 0), status admin."BookingStatus" NOT NULL DEFAULT 'PENDING',
  booking_code text NOT NULL UNIQUE, created_at timestamp(3) NOT NULL DEFAULT now(), updated_at timestamp(3) NOT NULL
);
CREATE INDEX flex_bookings_vendor_id_start_date_idx ON admin.flex_bookings(vendor_id, start_date);
CREATE INDEX flex_bookings_user_id_idx ON admin.flex_bookings(user_id);

CREATE TABLE admin.seat_reservations (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  seat_id text NOT NULL REFERENCES admin.library_seats(id), source text NOT NULL CHECK (source IN ('booking','subscription','flex')),
  source_id text NOT NULL, "window" tstzrange NOT NULL CHECK (NOT isempty("window") AND NOT lower_inf("window") AND NOT upper_inf("window")),
  CONSTRAINT seat_reservations_no_overlap EXCLUDE USING gist (seat_id WITH =, "window" WITH &&)
);
CREATE INDEX seat_reservations_source_source_id_idx ON admin.seat_reservations(source, source_id);

CREATE OR REPLACE FUNCTION admin.sync_seat_reservations() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, admin AS $$
DECLARE src text; tz text; day date; opening timestamptz; beginning timestamptz;
BEGIN
  src := CASE TG_TABLE_NAME WHEN 'bookings' THEN 'booking' WHEN 'subscriptions' THEN 'subscription' ELSE 'flex' END;
  DELETE FROM admin.seat_reservations WHERE source = src AND source_id = OLD.id;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW.seat_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.status::text NOT IN ('PENDING', 'CONFIRMED', 'ACTIVE') THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM admin.library_seats WHERE id = NEW.seat_id AND vendor_id = NEW.vendor_id AND is_active) THEN
    RAISE EXCEPTION 'The allocated seat is not active for this listing';
  END IF;
  IF src = 'booking' THEN
    IF NEW.start_at IS NULL OR NEW.end_at IS NULL OR NEW.end_at <= NEW.start_at THEN RAISE EXCEPTION 'A seat reservation requires a valid time range'; END IF;
    INSERT INTO admin.seat_reservations(seat_id, source, source_id, "window") VALUES (NEW.seat_id, src, NEW.id, tstzrange(NEW.start_at, NEW.end_at, '[)'));
  ELSE
    SELECT time_zone INTO tz FROM admin.vendors WHERE id = NEW.vendor_id;
    IF src = 'subscription' THEN
      IF NEW.slot_start_time IS NULL OR NEW.slot_hours IS NULL THEN RAISE EXCEPTION 'A subscription requires its daily access window'; END IF;
      FOR day IN SELECT generate_series(NEW.start_date::date, NEW.end_date::date - 1, interval '1 day')::date LOOP
        SELECT ow.open_at INTO opening FROM admin.vendor_open_window(NEW.vendor_id, day) ow;
        CONTINUE WHEN opening IS NULL;
        beginning := (day + NEW.slot_start_time) AT TIME ZONE tz;
        IF beginning < opening THEN beginning := beginning + interval '1 day'; END IF;
        INSERT INTO admin.seat_reservations(seat_id, source, source_id, "window")
        VALUES (NEW.seat_id, src, NEW.id, tstzrange(beginning, beginning + make_interval(hours => NEW.slot_hours), '[)'));
      END LOOP;
    ELSE
      FOR day IN SELECT generate_series(NEW.start_date, NEW.start_date + NEW.days - 1, interval '1 day')::date LOOP
        SELECT ow.open_at INTO opening FROM admin.vendor_open_window(NEW.vendor_id, day) ow;
        beginning := (day + NEW.slot_start) AT TIME ZONE tz;
        IF opening IS NOT NULL AND beginning < opening THEN beginning := beginning + interval '1 day'; END IF;
        INSERT INTO admin.seat_reservations(seat_id, source, source_id, "window")
        VALUES (NEW.seat_id, src, NEW.id, tstzrange(beginning, beginning + make_interval(hours => NEW.slot_hours), '[)'));
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER bookings_reservations AFTER INSERT OR UPDATE OR DELETE ON admin.bookings FOR EACH ROW EXECUTE FUNCTION admin.sync_seat_reservations();
CREATE TRIGGER subscriptions_reservations AFTER INSERT OR UPDATE OR DELETE ON admin.subscriptions FOR EACH ROW EXECUTE FUNCTION admin.sync_seat_reservations();
CREATE TRIGGER flex_reservations AFTER INSERT OR UPDATE OR DELETE ON admin.flex_bookings FOR EACH ROW EXECUTE FUNCTION admin.sync_seat_reservations();

-- Backfill without silently discarding conflicts. A pre-existing overlap must
-- abort this migration and be resolved explicitly before retrying deployment.
UPDATE admin.bookings SET updated_at = updated_at WHERE seat_id IS NOT NULL AND status IN ('PENDING','CONFIRMED') AND end_at > now();
UPDATE admin.subscriptions SET updated_at = updated_at WHERE seat_id IS NOT NULL AND status IN ('PENDING','ACTIVE') AND end_date > now();

CREATE OR REPLACE FUNCTION admin.seat_busy_intervals(p_seat_id text, p_from timestamptz, p_to timestamptz)
RETURNS TABLE (start_at timestamptz, end_at timestamptz, source text, ref_id text)
LANGUAGE sql STABLE SET search_path = pg_catalog, admin AS $$
SELECT lower(r."window"), upper(r."window"), r.source, r.source_id
FROM admin.seat_reservations r
WHERE r.seat_id = p_seat_id AND r."window" && tstzrange(p_from, p_to, '[)')
$$;

REVOKE ALL ON admin.flex_bookings, admin.seat_reservations FROM anon, authenticated;

CREATE OR REPLACE FUNCTION admin.seat_free_for_span(p_seat_id text, p_from date, p_to date, p_slot time, p_hours int, p_tz text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = pg_catalog, admin AS $$
SELECT NOT EXISTS (
  SELECT 1 FROM generate_series(p_from, p_to - 1, interval '1 day') d
  JOIN admin.library_seats s ON s.id = p_seat_id
  CROSS JOIN LATERAL admin.vendor_open_window(s.vendor_id, d::date) ow
  CROSS JOIN LATERAL (SELECT CASE WHEN (d::date + p_slot) AT TIME ZONE p_tz < ow.open_at
    THEN ((d::date + p_slot) AT TIME ZONE p_tz) + interval '1 day'
    ELSE (d::date + p_slot) AT TIME ZONE p_tz END AS beginning) span
  JOIN admin.seat_reservations r ON r.seat_id = p_seat_id AND r."window" && tstzrange(span.beginning, span.beginning + make_interval(hours => p_hours), '[)')
)
$$;

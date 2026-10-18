CREATE FUNCTION admin.protect_reserved_seat() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,admin AS $$
BEGIN
  IF (TG_OP='DELETE' OR (OLD.is_active AND NOT NEW.is_active)) AND EXISTS(SELECT 1 FROM admin.seat_reservations r WHERE r.seat_id=OLD.id AND upper(r."window")>now()) THEN
    RAISE EXCEPTION 'This seat has reservations. Cancel and refund affected purchases before removing it.';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER protect_reserved_seat BEFORE UPDATE OF is_active OR DELETE ON admin.library_seats FOR EACH ROW EXECUTE FUNCTION admin.protect_reserved_seat();

CREATE FUNCTION admin.reservations_fit_schedule(p_vendor_id text) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,admin AS $$
SELECT NOT EXISTS (
  SELECT 1 FROM admin.seat_reservations r JOIN admin.library_seats s ON s.id=r.seat_id JOIN admin.vendors v ON v.id=s.vendor_id
  WHERE s.vendor_id=p_vendor_id AND upper(r."window")>now() AND NOT EXISTS(
    SELECT 1 FROM generate_series(((lower(r."window") AT TIME ZONE v.time_zone)::date-1)::timestamp,((lower(r."window") AT TIME ZONE v.time_zone)::date)::timestamp,interval '1 day') day
    CROSS JOIN LATERAL admin.vendor_open_window(p_vendor_id,day::date) ow
    WHERE ow.open_at<=lower(r."window") AND ow.close_at>=upper(r."window")
  )
)
$$;

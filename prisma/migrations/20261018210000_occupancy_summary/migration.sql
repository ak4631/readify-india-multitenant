CREATE FUNCTION admin.library_occupancy_summary(p_vendor_ids text[] DEFAULT NULL)
RETURNS TABLE(total_seat_hours numeric,reserved_seat_hours numeric)
LANGUAGE sql STABLE SET search_path=pg_catalog,admin AS $$
SELECT coalesce(sum(extract(epoch FROM (ow.close_at-ow.open_at))/3600),0),
  coalesce(sum((SELECT coalesce(sum(extract(epoch FROM (least(b.end_at,ow.close_at)-greatest(b.start_at,ow.open_at)))/3600),0)
    FROM admin.seat_busy_intervals(s.id,ow.open_at,ow.close_at) b)),0)
FROM admin.library_seats s JOIN admin.vendors v ON v.id=s.vendor_id JOIN admin.vendor_categories c ON c.id=v.category_id
CROSS JOIN LATERAL admin.vendor_open_window(v.id,(now() AT TIME ZONE v.time_zone)::date) ow
WHERE s.is_active AND c.slug='library' AND (p_vendor_ids IS NULL OR v.id=ANY(p_vendor_ids))
$$;
REVOKE ALL ON FUNCTION admin.library_occupancy_summary(text[]) FROM PUBLIC,anon,authenticated;

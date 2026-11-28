-- Match the customer history ORDER BY after its ownership predicate.
CREATE INDEX bookings_user_id_created_at_id_idx ON admin.bookings(user_id,created_at DESC,id DESC);
CREATE INDEX flex_bookings_user_id_created_at_id_idx ON admin.flex_bookings(user_id,created_at DESC,id DESC);
CREATE INDEX subscriptions_user_id_created_at_id_idx ON admin.subscriptions(user_id,created_at DESC,id DESC);

-- Pending-payment queues / expiry worker, and a partner's paginated ledger.
CREATE INDEX payment_orders_status_expires_at_id_idx ON admin.payment_orders(status,expires_at,id);
CREATE INDEX payment_orders_vendor_id_created_at_id_idx ON admin.payment_orders(vendor_id,created_at DESC,id DESC);

-- Partner customer presence lookup and discovery's first-image lateral lookup.
CREATE INDEX attendance_visits_user_id_checked_out_at_vendor_id_idx ON admin.attendance_visits(user_id,checked_out_at,vendor_id);
CREATE INDEX vendor_media_listing_image_idx ON admin.vendor_media(vendor_id,media_type,is_primary DESC,sort_order,created_at);

-- Profiles belong to the identity schema, outside Prisma's model ownership.
-- Existing booking/payment user IDs are text, so those joins need this expression.
CREATE INDEX profiles_id_text_idx ON public.profiles((id::text));
CREATE INDEX profiles_created_at_id_idx ON public.profiles(created_at DESC,id DESC);

-- Home's top-rated query filters published listings with reviews, then takes
-- four rows per category in this exact order. NULLS LAST matches the API sort.
CREATE INDEX vendors_top_rated_listing_idx ON admin.vendors(category_id,average_rating DESC NULLS LAST,review_count DESC)
  WHERE status='PUBLISHED' AND review_count>0;

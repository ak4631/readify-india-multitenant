// Existing repository baselines contain a redundant historical delta and two
// PG18-only cosmetic renames. Match the verified PG17 rollout without editing history.
export function migrationSql(name, sql) {
  if (name === "20260927130000_apply_pending_seat_rollout") return "-- Redundant delta: changes are present in the preceding checked-in baseline.";
  return sql.replace(/ALTER TABLE "admin"\."coworking_space_details"\s+RENAME CONSTRAINT "study_cafe_details_(?:id|vendor_id)_not_null" TO "coworking_space_details_(?:id|vendor_id)_not_null";/g, "");
}

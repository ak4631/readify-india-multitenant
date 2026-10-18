import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";

export async function launchDatabase() {
  const db = new PGlite({ extensions: { btree_gist } });
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    CREATE TABLE public.profiles(id uuid PRIMARY KEY, full_name text, avatar_url text, role text DEFAULT 'user', is_active boolean DEFAULT true, created_at timestamptz DEFAULT now());
  `);
  const root = resolve("prisma/migrations");
  for (const name of readdirSync(root)
    .filter((name) => /^\d/.test(name))
    .sort()) {
    // This historical delta targets an earlier manually edited version of the
    // 26 September migration. Its changes are already in the checked-in baseline.
    if (name === "20260927130000_apply_pending_seat_rollout") continue;
    // The old baseline has two PG18-only cosmetic NOT NULL renames. PGlite
    // and production PG17 have no named NOT NULL constraints to rename.
    const sql = readFileSync(
      resolve(root, name, "migration.sql"),
      "utf8",
    ).replace(
      /ALTER TABLE "admin"\."coworking_space_details"\s+RENAME CONSTRAINT "study_cafe_details_(?:id|vendor_id)_not_null" TO "coworking_space_details_(?:id|vendor_id)_not_null";/g,
      "",
    );
    try {
      await db.exec(sql);
    } catch (error) {
      await db.close();
      throw new Error(`Migration ${name} failed`, { cause: error });
    }
  }
  return db;
}

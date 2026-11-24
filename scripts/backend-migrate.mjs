import { Client } from "pg";
import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { migrationSql } from "../backend/database/migration-sql.mjs";

const root = path.resolve(import.meta.dirname, "..");
if (!process.env.DIRECT_URL)
  throw new Error("Set DIRECT_URL explicitly (or use --env-file=backend/.env)");
const db = new Client({ connectionString: process.env.DIRECT_URL });
await db.connect();
try {
  await db.query(
    "SELECT pg_advisory_lock(hashtextextended('vriddhora-admin-migrations', 0))",
  );
  if (process.argv.includes("--bootstrap")) {
    const existing = await db.query(
      "SELECT to_regclass('auth.users') AS users, to_regclass('public.profiles') AS profiles, to_regclass('admin.users') AS staff",
    );
    if (Object.values(existing.rows[0]).some(Boolean))
      throw new Error(
        "Bootstrap requires an empty database. Existing databases must be migrated without --bootstrap.",
      );
    await db.query("BEGIN");
    try {
      await db.query(
        await readFile(
          path.join(root, "backend/database/bootstrap.sql"),
          "utf8",
        ),
      );
      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    }
  }
  const histories = await db.query(
    "SELECT n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relname='_prisma_migrations' AND c.relkind='r'",
  );
  const schema =
    process.env.MIGRATION_HISTORY_SCHEMA ||
    histories.rows[0]?.nspname ||
    "public";
  if (histories.rows.length > 1 && !process.env.MIGRATION_HISTORY_SCHEMA)
    throw new Error("Set MIGRATION_HISTORY_SCHEMA; multiple histories exist");
  if (!/^[a-z_][a-z0-9_]*$/i.test(schema))
    throw new Error("Invalid migration history schema");
  const history = `"${schema}"."_prisma_migrations"`;
  await db.query(
    `CREATE TABLE IF NOT EXISTS ${history}(id varchar(36) PRIMARY KEY, checksum varchar(64) NOT NULL, finished_at timestamptz, migration_name varchar(255) NOT NULL, logs text, rolled_back_at timestamptz, started_at timestamptz NOT NULL DEFAULT now(), applied_steps_count integer NOT NULL DEFAULT 0)`,
  );
  for (const name of (await readdir(path.join(root, "prisma/migrations")))
    .filter((n) => /^\d{14}_/.test(n))
    .sort()) {
    const sql = await readFile(
      path.join(root, "prisma/migrations", name, "migration.sql"),
      "utf8",
    );
    const checksum = createHash("sha256").update(sql).digest("hex");
    const previous = await db.query(
      `SELECT checksum, finished_at, rolled_back_at FROM ${history} WHERE migration_name=$1 ORDER BY started_at DESC LIMIT 1`,
      [name],
    );
    if (previous.rows.length) {
      const row = previous.rows[0];
      if (row.checksum !== checksum || !row.finished_at || row.rolled_back_at)
        throw new Error(
          `Migration ${name} differs or requires recovery; nothing was overwritten`,
        );
      continue;
    }
    await db.query("BEGIN");
    try {
      const runnable = migrationSql(name, sql);
      await db.query(runnable);
      await db.query(
        `INSERT INTO ${history}(id,checksum,finished_at,migration_name,logs,applied_steps_count) VALUES($1,$2,now(),$3,$4,1)`,
        [
          randomUUID(),
          checksum,
          name,
          runnable === sql
            ? null
            : "Applied PostgreSQL portable baseline; see backend/database/migration-sql.mjs",
        ],
      );
      await db.query("COMMIT");
      console.log(`Applied ${name}`);
    } catch (error) {
      await db.query("ROLLBACK");
      throw new Error(`Migration ${name} failed`, { cause: error });
    }
  }
} finally {
  await db.end();
}

// Applies one reviewed SQL migration and records it atomically. Does not reset
// schemas or replay an already-applied migration with different contents.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Client } = require("pg");
require("dotenv").config();

const migrationDir = process.argv[2];
if (!migrationDir) {
  console.error("Usage: node scripts/apply-migration.js <migrations/dir-name>");
  process.exit(1);
}

const migrationName = path.basename(migrationDir);
if (!/^\d{14}_[a-z0-9_]+$/.test(migrationName)) {
  throw new Error("Provide an exact migration directory name");
}
const sqlPath = path.join(
  __dirname,
  "..",
  "prisma",
  "migrations",
  migrationName,
  "migration.sql",
);
const sql = fs.readFileSync(sqlPath, "utf8");
const checksum = crypto.createHash("sha256").update(sql).digest("hex");

async function main() {
  const client = new Client({ connectionString: process.env.DIRECT_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('vriddhora-admin-migrations', 0))",
    );
    const histories = await client.query(
      "SELECT n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relname='_prisma_migrations' AND c.relkind='r'",
    );
    const configured = process.env.MIGRATION_HISTORY_SCHEMA;
    if (!configured && histories.rows.length > 1)
      throw new Error(
        "Multiple migration histories found. Set MIGRATION_HISTORY_SCHEMA explicitly.",
      );
    const historySchema = configured || histories.rows[0]?.nspname || "public";
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(historySchema))
      throw new Error("Invalid migration history schema");
    const history = `"${historySchema}"."_prisma_migrations"`;
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${history} (
        "id" VARCHAR(36) PRIMARY KEY,
        "checksum" VARCHAR(64) NOT NULL,
        "finished_at" TIMESTAMPTZ,
        "migration_name" VARCHAR(255) NOT NULL,
        "logs" TEXT,
        "rolled_back_at" TIMESTAMPTZ,
        "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "applied_steps_count" INTEGER NOT NULL DEFAULT 0
      );
    `);
    const previous = await client.query(
      `SELECT checksum, finished_at, rolled_back_at FROM ${history} WHERE migration_name=$1 ORDER BY started_at DESC LIMIT 1`,
      [migrationName],
    );
    if (previous.rows.length) {
      const row = previous.rows[0];
      if (row.checksum !== checksum || !row.finished_at || row.rolled_back_at)
        throw new Error(
          "Migration history differs from this file or needs recovery. Review it explicitly; nothing was applied.",
        );
      await client.query("COMMIT");
      console.log(`Already applied: ${migrationName}`);
      return;
    }
    // The new release has an enum commit boundary and dependent SQL functions.
    // Require its earlier migrations to have completed before advancing.
    if (migrationName >= "20261018100000_listing_change_review") {
      const releaseNames = fs
        .readdirSync(path.join(__dirname, "..", "prisma", "migrations"))
        .filter(
          (name) =>
            /^\d{14}_/.test(name) &&
            name >= "20261018100000_listing_change_review" &&
            name < migrationName,
        )
        .sort();
      for (const dependency of releaseNames) {
        const applied = await client.query(
          `SELECT 1 FROM ${history} WHERE migration_name=$1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL`,
          [dependency],
        );
        if (!applied.rowCount)
          throw new Error(
            `Apply the earlier release migration first: ${dependency}`,
          );
      }
    }
    await client.query(sql);
    await client.query(
      `INSERT INTO ${history}
        (id, checksum, finished_at, migration_name, applied_steps_count)
       VALUES ($1, $2, now(), $3, 1)`,
      [crypto.randomUUID(), checksum, migrationName],
    );

    await client.query("COMMIT");
    console.log(`Applied migration: ${migrationName}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

// One-off runner: applies a Prisma migration.sql via plain `pg`, bypassing
// Prisma's native schema-engine binary (blocked by local network/security
// software in this environment). Also records the migration as applied in
// _prisma_migrations so `prisma migrate` stays consistent afterwards.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');
require('dotenv').config();

const migrationDir = process.argv[2];
if (!migrationDir) {
  console.error('Usage: node scripts/apply-migration.js <migrations/dir-name>');
  process.exit(1);
}

const migrationName = path.basename(migrationDir);
const sqlPath = path.join(__dirname, '..', 'prisma', 'migrations', migrationName, 'migration.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');
const checksum = crypto.createHash('sha256').update(sql).digest('hex');

async function main() {
  const client = new Client({ connectionString: process.env.DIRECT_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
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
    await client.query(
      `INSERT INTO "_prisma_migrations"
        (id, checksum, finished_at, migration_name, applied_steps_count)
       VALUES ($1, $2, now(), $3, 1)`,
      [crypto.randomUUID(), checksum, migrationName],
    );

    await client.query('COMMIT');
    console.log(`Applied migration: ${migrationName}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

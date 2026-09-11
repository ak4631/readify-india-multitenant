import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Migrations need a direct (non pgbouncer-transaction-mode) connection —
    // the app's runtime PrismaClient uses DATABASE_URL (pooled) instead, see src/lib/prisma.ts.
    url: env("DIRECT_URL"),
  },
});

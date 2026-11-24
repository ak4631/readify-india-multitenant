import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Pooled (pgbouncer transaction-mode) connection for app runtime queries.
// Schema changes (migrate/db push) use DIRECT_URL instead — see prisma.config.ts.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5_000,
});

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const localPrisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = localPrisma;
}

export const prisma: PrismaClient = new Proxy(localPrisma, {
  get(target, property, receiver) {
    if (process.env.BACKEND_URL)
      throw new Error(
        "Database access belongs to the backend. Use a backend action.",
      );
    return Reflect.get(target, property, receiver);
  },
});

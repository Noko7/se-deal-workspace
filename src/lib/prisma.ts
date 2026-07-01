import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  // Log warnings/errors only. Per-query logging is very chatty and its
  // synchronous stdout writes become a real bottleneck once several users hit
  // the app at once, so we keep it off even in development.
  const client = new PrismaClient({ log: ["warn", "error"] });

  // SQLite serializes writers by default and readers block during a write. WAL
  // mode lets reads proceed concurrently with a writer, and a busy timeout lets
  // a contended write wait briefly instead of failing with "database is locked"
  // -- both matter for a concurrent, multi-user setup. These pragmas return a
  // row, so use $queryRawUnsafe (not $executeRawUnsafe, which rejects results).
  // Fire-and-forget: they apply to the shared connection before the first query.
  void client.$queryRawUnsafe("PRAGMA journal_mode=WAL;").catch(() => {});
  void client.$queryRawUnsafe("PRAGMA busy_timeout=5000;").catch(() => {});

  return client;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

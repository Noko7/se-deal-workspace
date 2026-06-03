// Creates a default dev login so the app is usable right after switching from
// Basic Auth to the new login flow. Idempotent. Override via env if desired.
//
// Run: npm run db:seed:user
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";

async function main() {
  const email = (process.env.DEV_USER_EMAIL ?? "admin@nutanix.local").toLowerCase();
  const password = process.env.DEV_USER_PASSWORD ?? "password123";
  const name = process.env.DEV_USER_NAME ?? "Dev Admin";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Dev user already exists: ${email}`);
  } else {
    await prisma.user.create({ data: { email, name, passwordHash: hashPassword(password) } });
    console.log(`Created dev user: ${email} / ${password}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

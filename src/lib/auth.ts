// Server-only auth helpers: password hashing (scrypt), user lookup/creation,
// and input validation + sanitization for the login / signup flow.

import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sanitizeField } from "@/lib/sanitize";

const SCRYPT_KEYLEN = 64;

// Hash format: scrypt$<saltHex>$<keyHex>. Self-describing so we can evolve it.
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return false;
  }
  const [, saltHex, keyHex] = parts;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltHex, "hex");
    expected = Buffer.from(keyHex, "hex");
  } catch {
    return false;
  }
  const derived = crypto.scryptSync(password, salt, expected.length || SCRYPT_KEYLEN);
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}

// ── Validation ──────────────────────────────────────────────────────────────
// Email: trimmed + lowercased, RFC-ish, bounded. Name: sanitized single line.
// Password: 8–200 chars (dev-friendly but non-trivial).

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Enter your email.")
  .max(254, "Email is too long.")
  .email("Enter a valid email address.");

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(200, "Password is too long.");

export const nameSchema = z
  .string()
  .transform((value) => sanitizeField(value, 80))
  .pipe(z.string().min(1, "Enter your name.").max(80, "Name is too long."));

export const signupSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
});

export type FieldErrors = Record<string, string>;

// Flatten a ZodError into { field: firstMessage }.
export function fieldErrorsFrom(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) {
      out[key] = issue.message;
    }
  }
  return out;
}

// ── User operations ──────────────────────────────────────────────────────────

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}

export async function emailExists(email: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  return user !== null;
}

export async function createUser(input: { name: string; email: string; password: string }) {
  return prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash: hashPassword(input.password),
    },
    select: { id: true, email: true, name: true },
  });
}

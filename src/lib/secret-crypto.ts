import crypto from "node:crypto";

// Encrypt/decrypt small secrets (e.g. API keys) for at-rest storage.
// Format: v1:<ivBase64url>:<tagBase64url>:<ciphertextBase64url>

const ALGO = "aes-256-gcm";

function keyFromSecret(): Buffer {
  const secret = process.env.APP_SECRET?.trim() || "se-deal-workspace-dev-secret-change-me";
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, keyFromSecret(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptSecret(payload: string): string {
  const [version, ivB64, tagB64, dataB64] = payload.split(":");
  if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("Invalid secret payload format.");
  }
  const decipher = crypto.createDecipheriv(ALGO, keyFromSecret(), Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64url")), decipher.final()]);
  return decrypted.toString("utf8");
}


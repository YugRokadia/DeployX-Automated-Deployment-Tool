/**
 * Application-level encryption for project secrets.
 * Uses AES-256-GCM with random IVs for authenticated encryption.
 *
 * Format: base64(iv):base64(authTag):base64(ciphertext)
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash, createHmac, timingSafeEqual } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM recommended IV length
const AUTH_TAG_LENGTH = 16;

/**
 * Derives a 32-byte key from an arbitrary-length secret string.
 */
function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns format: base64(iv):base64(authTag):base64(ciphertext)
 */
export function encryptSecret(plaintext: string, secretKey: string): string {
  const key = deriveKey(secretKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

/**
 * Decrypts a ciphertext string produced by encryptSecret.
 * Throws on invalid key or tampered data.
 */
export function decryptSecret(ciphertext: string, secretKey: string): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid ciphertext format");
  }

  const [ivB64, authTagB64, encryptedB64] = parts;
  const key = deriveKey(secretKey);
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const encrypted = Buffer.from(encryptedB64, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

/**
 * Verifies a GitHub webhook signature (HMAC-SHA256).
 * Uses constant-time comparison to prevent timing attacks.
 *
 * @param payload - The raw request body as a string.
 * @param signatureHeader - The X-Hub-Signature-256 header value (format: "sha256=<hex>").
 * @param secret - The webhook secret (plaintext).
 * @returns true if the signature is valid.
 */
export function verifyWebhookSignature(
  payload: string,
  signatureHeader: string,
  secret: string,
): boolean {
  if (!signatureHeader.startsWith("sha256=")) {
    return false;
  }

  const receivedHex = signatureHeader.slice("sha256=".length);
  const expectedHex = createHmac("sha256", secret)
    .update(payload, "utf8")
    .digest("hex");

  if (receivedHex.length !== expectedHex.length) {
    return false;
  }

  const receivedBuf = Buffer.from(receivedHex, "hex");
  const expectedBuf = Buffer.from(expectedHex, "hex");

  return timingSafeEqual(receivedBuf, expectedBuf);
}

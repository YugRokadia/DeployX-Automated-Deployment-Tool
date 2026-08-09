import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { encryptSecret, decryptSecret, verifyWebhookSignature } from "../../crypto";

const TEST_KEY = "test-encryption-key-for-deployx-secrets";

describe("encryptSecret / decryptSecret", () => {
  it("encrypts and decrypts a simple string", () => {
    const plaintext = "my-database-password";
    const encrypted = encryptSecret(plaintext, TEST_KEY);
    const decrypted = decryptSecret(encrypted, TEST_KEY);

    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertexts for the same plaintext (random IV)", () => {
    const plaintext = "same-value";
    const a = encryptSecret(plaintext, TEST_KEY);
    const b = encryptSecret(plaintext, TEST_KEY);

    expect(a).not.toBe(b);
    // Both decrypt to the same value
    expect(decryptSecret(a, TEST_KEY)).toBe(plaintext);
    expect(decryptSecret(b, TEST_KEY)).toBe(plaintext);
  });

  it("throws when decrypting with the wrong key", () => {
    const encrypted = encryptSecret("secret", TEST_KEY);

    expect(() => decryptSecret(encrypted, "wrong-key")).toThrow();
  });

  it("handles empty string", () => {
    const encrypted = encryptSecret("", TEST_KEY);
    const decrypted = decryptSecret(encrypted, TEST_KEY);

    expect(decrypted).toBe("");
  });

  it("handles long values", () => {
    const plaintext = "x".repeat(10000);
    const encrypted = encryptSecret(plaintext, TEST_KEY);
    const decrypted = decryptSecret(encrypted, TEST_KEY);

    expect(decrypted).toBe(plaintext);
  });

  it("handles unicode characters", () => {
    const plaintext = "密码 🔐 пароль";
    const encrypted = encryptSecret(plaintext, TEST_KEY);
    const decrypted = decryptSecret(encrypted, TEST_KEY);

    expect(decrypted).toBe(plaintext);
  });

  it("handles multiline values", () => {
    const plaintext = "line1\nline2\nline3";
    const encrypted = encryptSecret(plaintext, TEST_KEY);
    const decrypted = decryptSecret(encrypted, TEST_KEY);

    expect(decrypted).toBe(plaintext);
  });

  it("produces the iv:authTag:ciphertext format", () => {
    const encrypted = encryptSecret("test", TEST_KEY);
    const parts = encrypted.split(":");

    expect(parts).toHaveLength(3);
    // Each part should be valid base64
    for (const part of parts) {
      expect(() => Buffer.from(part, "base64")).not.toThrow();
    }
  });

  it("throws on invalid ciphertext format", () => {
    expect(() => decryptSecret("not-valid", TEST_KEY)).toThrow(
      "Invalid ciphertext format",
    );
    expect(() => decryptSecret("a:b", TEST_KEY)).toThrow(
      "Invalid ciphertext format",
    );
  });
});

describe("verifyWebhookSignature", () => {
  const SECRET = "whsec_test_secret_key";

  function sign(payload: string, secret: string): string {
    const hex = createHmac("sha256", secret).update(payload, "utf8").digest("hex");
    return `sha256=${hex}`;
  }

  it("accepts a valid signature", () => {
    const payload = '{"ref":"refs/heads/main","after":"abc123"}';
    const sig = sign(payload, SECRET);

    expect(verifyWebhookSignature(payload, sig, SECRET)).toBe(true);
  });

  it("rejects an invalid signature (wrong secret)", () => {
    const payload = '{"ref":"refs/heads/main"}';
    const sig = sign(payload, "wrong-secret");

    expect(verifyWebhookSignature(payload, sig, SECRET)).toBe(false);
  });

  it("rejects a tampered payload", () => {
    const payload = '{"ref":"refs/heads/main"}';
    const sig = sign(payload, SECRET);
    const tampered = '{"ref":"refs/heads/evil"}';

    expect(verifyWebhookSignature(tampered, sig, SECRET)).toBe(false);
  });

  it("rejects a signature without sha256= prefix", () => {
    const payload = "test";
    const hex = createHmac("sha256", SECRET).update(payload, "utf8").digest("hex");

    expect(verifyWebhookSignature(payload, hex, SECRET)).toBe(false);
  });

  it("rejects an empty signature header", () => {
    expect(verifyWebhookSignature("test", "", SECRET)).toBe(false);
  });

  it("handles empty payload", () => {
    const payload = "";
    const sig = sign(payload, SECRET);

    expect(verifyWebhookSignature(payload, sig, SECRET)).toBe(true);
  });

  it("handles unicode payload", () => {
    const payload = '{"message":"hello 🚀"}';
    const sig = sign(payload, SECRET);

    expect(verifyWebhookSignature(payload, sig, SECRET)).toBe(true);
  });

  it("rejects signature with wrong length hex", () => {
    expect(verifyWebhookSignature("test", "sha256=abc", SECRET)).toBe(false);
  });
});

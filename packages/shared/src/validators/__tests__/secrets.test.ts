import { describe, it, expect } from "vitest";
import {
  SecretKeySchema,
  SecretValueSchema,
  CreateSecretSchema,
} from "../secrets";

describe("SecretKeySchema", () => {
  it("accepts valid UPPER_SNAKE_CASE keys", () => {
    const valid = ["DATABASE_URL", "API_KEY", "MY_VAR_123", "A", "_PRIVATE"];
    for (const key of valid) {
      expect(SecretKeySchema.safeParse(key).success).toBe(true);
    }
  });

  it("rejects lowercase keys", () => {
    expect(SecretKeySchema.safeParse("database_url").success).toBe(false);
    expect(SecretKeySchema.safeParse("apiKey").success).toBe(false);
  });

  it("rejects keys with spaces", () => {
    expect(SecretKeySchema.safeParse("MY KEY").success).toBe(false);
  });

  it("rejects keys with special characters", () => {
    expect(SecretKeySchema.safeParse("MY-KEY").success).toBe(false);
    expect(SecretKeySchema.safeParse("MY.KEY").success).toBe(false);
    expect(SecretKeySchema.safeParse("MY@KEY").success).toBe(false);
  });

  it("rejects empty string", () => {
    expect(SecretKeySchema.safeParse("").success).toBe(false);
  });

  it("rejects keys starting with a number", () => {
    expect(SecretKeySchema.safeParse("123_KEY").success).toBe(false);
  });

  it("rejects keys exceeding 255 characters", () => {
    expect(SecretKeySchema.safeParse("A".repeat(256)).success).toBe(false);
  });

  it("accepts keys at max length (255)", () => {
    expect(SecretKeySchema.safeParse("A".repeat(255)).success).toBe(true);
  });
});

describe("SecretValueSchema", () => {
  it("accepts valid values", () => {
    expect(SecretValueSchema.safeParse("my-secret-value").success).toBe(true);
  });

  it("rejects empty values", () => {
    expect(SecretValueSchema.safeParse("").success).toBe(false);
  });

  it("rejects values exceeding 10,000 characters", () => {
    expect(SecretValueSchema.safeParse("x".repeat(10001)).success).toBe(false);
  });

  it("accepts values at max length", () => {
    expect(SecretValueSchema.safeParse("x".repeat(10000)).success).toBe(true);
  });
});

describe("CreateSecretSchema", () => {
  it("parses valid input with all fields", () => {
    const result = CreateSecretSchema.parse({
      key: "DATABASE_URL",
      value: "postgres://localhost:5432/db",
      is_secret: true,
    });

    expect(result.key).toBe("DATABASE_URL");
    expect(result.value).toBe("postgres://localhost:5432/db");
    expect(result.is_secret).toBe(true);
  });

  it("defaults is_secret to true", () => {
    const result = CreateSecretSchema.parse({
      key: "API_KEY",
      value: "sk-12345",
    });

    expect(result.is_secret).toBe(true);
  });

  it("rejects invalid key format", () => {
    const result = CreateSecretSchema.safeParse({
      key: "invalid-key",
      value: "value",
    });

    expect(result.success).toBe(false);
  });

  it("rejects missing value", () => {
    const result = CreateSecretSchema.safeParse({
      key: "MY_KEY",
    });

    expect(result.success).toBe(false);
  });
});

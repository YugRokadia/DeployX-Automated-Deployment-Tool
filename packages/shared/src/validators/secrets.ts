import { z } from "zod";

// ── Secret Key Validation ───────────────────────────────────────
// Keys must be UPPER_SNAKE_CASE (e.g., DATABASE_URL, API_KEY)

export const SecretKeySchema = z
  .string()
  .min(1, "Key is required")
  .max(255, "Key must be at most 255 characters")
  .regex(
    /^[A-Z_][A-Z0-9_]*$/,
    "Key must be UPPER_SNAKE_CASE (e.g., DATABASE_URL)",
  );

export const SecretValueSchema = z
  .string()
  .min(1, "Value is required")
  .max(10000, "Value must be at most 10,000 characters");

// ── Create / Update Secret ──────────────────────────────────────

export const CreateSecretSchema = z.object({
  key: SecretKeySchema,
  value: SecretValueSchema,
  is_secret: z.boolean().default(true),
});

export type CreateSecretPayload = z.infer<typeof CreateSecretSchema>;

export const UpdateSecretSchema = z.object({
  value: SecretValueSchema,
  is_secret: z.boolean().optional(),
});

export type UpdateSecretPayload = z.infer<typeof UpdateSecretSchema>;

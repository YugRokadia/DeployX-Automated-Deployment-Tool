import { z } from "zod";

export const UpdateProfileSchema = z.object({
  display_name: z
    .string()
    .min(1, "Display name is required")
    .max(100, "Display name must be at most 100 characters")
    .optional(),
  avatar_url: z
    .string()
    .url("Must be a valid URL")
    .max(500)
    .or(z.literal(""))
    .optional(),
});

export type UpdateProfilePayload = z.infer<typeof UpdateProfileSchema>;

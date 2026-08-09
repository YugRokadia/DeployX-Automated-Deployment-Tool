import { z } from "zod";
import { ARTIFACT_ALLOWED_EXTENSIONS } from "../constants";

const filenameSchema = z
  .string()
  .min(1, "Filename is required")
  .max(500)
  .refine(
    (name) =>
      ARTIFACT_ALLOWED_EXTENSIONS.some((ext) =>
        name.toLowerCase().endsWith(ext),
      ),
    {
      message: `File extension must be one of: ${ARTIFACT_ALLOWED_EXTENSIONS.join(", ")}`,
    },
  );

export const UploadArtifactSchema = z.object({
  filename: filenameSchema,
  pipeline_run_id: z.string().uuid(),
  project_id: z.string().uuid(),
});

export type UploadArtifactPayload = z.infer<typeof UploadArtifactSchema>;

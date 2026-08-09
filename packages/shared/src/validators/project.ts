import { z } from "zod";

export const DeployTargetSchema = z.enum([
  "docker_local",
  "railway",
  "fly_io",
]);

export const CreateProjectSchema = z.object({
  name: z
    .string()
    .min(2, "Project name must be at least 2 characters")
    .max(64, "Project name must be at most 64 characters")
    .regex(
      /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/,
      "Project name must start with alphanumeric and contain only letters, numbers, dots, hyphens, underscores"
    ),
  git_repo_url: z
    .string()
    .url("Must be a valid URL")
    .regex(
      /^https:\/\/(github\.com|gitlab\.com|bitbucket\.org)\//,
      "Must be a GitHub, GitLab, or Bitbucket URL"
    ),
  default_branch: z.string().min(1).max(128).default("main"),
  dockerfile_path: z.string().min(1).max(512).default("./Dockerfile"),
  build_context: z.string().min(1).max(512).default("."),
  deploy_target: DeployTargetSchema.default("docker_local"),
});

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;

export const UpdateProjectSchema = CreateProjectSchema.partial();

export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;

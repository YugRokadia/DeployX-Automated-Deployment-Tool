import { z } from "zod";

/**
 * Valid org roles in hierarchical order (lowest to highest privilege).
 */
export const ORG_ROLES = ["viewer", "developer", "admin", "owner"] as const;

/**
 * Role hierarchy: maps each role to its numeric level for comparison.
 */
export const ROLE_HIERARCHY: Readonly<Record<string, number>> = {
  viewer: 0,
  developer: 1,
  admin: 2,
  owner: 3,
};

/**
 * Check if a role meets the minimum required level.
 */
export function hasMinRole(userRole: string, minRole: string): boolean {
  const userLevel = ROLE_HIERARCHY[userRole] ?? -1;
  const minLevel = ROLE_HIERARCHY[minRole] ?? Infinity;
  return userLevel >= minLevel;
}

/**
 * Schema for inviting a member to an organization.
 */
export const InviteMemberSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Invalid email address")
    .max(255, "Email must be 255 characters or fewer"),
  role: z.enum(["viewer", "developer", "admin"], {
    errorMap: () => ({ message: "Role must be viewer, developer, or admin" }),
  }),
});

export type InviteMemberInput = z.infer<typeof InviteMemberSchema>;

/**
 * Schema for updating a member's role.
 * Owner role cannot be assigned this way — ownership transfer is a separate flow.
 */
export const UpdateRoleSchema = z.object({
  role: z.enum(["viewer", "developer", "admin"], {
    errorMap: () => ({ message: "Role must be viewer, developer, or admin" }),
  }),
});

export type UpdateRoleInput = z.infer<typeof UpdateRoleSchema>;

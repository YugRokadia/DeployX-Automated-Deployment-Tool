"use server";

import { requireUserWithOrg } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import { hasMinRole } from "@deployx/shared";
import { recordAuditEvent } from "@/lib/audit";

interface ActionResult {
  readonly error?: string;
  readonly success?: boolean;
}

/**
 * Stops an active deployment by updating its status to "stopped".
 * The runner will detect the status change and stop the containers.
 */
export async function stopDeployment(
  projectId: string,
  deploymentId: string,
): Promise<ActionResult> {
  const { supabase, role, user, org } = await requireUserWithOrg();

  if (!hasMinRole(role, "developer")) {
    return { error: "You don't have permission to stop deployments" };
  }

  // Verify the deployment exists and belongs to this project
  const { data: deployment } = await supabase
    .from("deployments")
    .select("id, status")
    .eq("id", deploymentId)
    .eq("project_id", projectId)
    .single();

  if (!deployment) {
    return { error: "Deployment not found" };
  }

  const terminalStates = ["stopped", "rolled_back", "failed"];
  if (terminalStates.includes(deployment.status)) {
    return { error: `Deployment is already ${deployment.status}` };
  }

  const { error } = await supabase
    .from("deployments")
    .update({
      status: "stopped",
      updated_at: new Date().toISOString(),
    })
    .eq("id", deploymentId);

  if (error) {
    return { error: "Failed to stop deployment" };
  }

  // Also update the current revision status
  await supabase
    .from("deployment_revisions")
    .update({ status: "stopped" })
    .eq("deployment_id", deploymentId)
    .neq("status", "rolled_back");

  recordAuditEvent(supabase, {
    org_id: org.id,
    user_id: user.id,
    action: "update",
    resource_type: "deployment",
    resource_id: deploymentId,
    details: { action: "stop" },
  });

  revalidatePath(`/projects/${projectId}/deployments/${deploymentId}`);
  revalidatePath(`/projects/${projectId}`);

  return { success: true };
}

/**
 * Marks a deployment as rolled back with a reason.
 * A future pipeline run will deploy the target revision's image.
 */
export async function rollbackDeployment(
  projectId: string,
  deploymentId: string,
  targetRevisionId: string,
  reason: string,
): Promise<ActionResult> {
  const { supabase, role, user, org } = await requireUserWithOrg();

  if (!hasMinRole(role, "developer")) {
    return { error: "You don't have permission to rollback deployments" };
  }

  // Verify the deployment exists
  const { data: deployment } = await supabase
    .from("deployments")
    .select("id, status")
    .eq("id", deploymentId)
    .eq("project_id", projectId)
    .single();

  if (!deployment) {
    return { error: "Deployment not found" };
  }

  if (!["active", "draining"].includes(deployment.status)) {
    return { error: `Cannot rollback deployment in ${deployment.status} state` };
  }

  // Update current revision as rolled back
  await supabase
    .from("deployment_revisions")
    .update({
      status: "rolled_back",
      rollback_reason: reason,
    })
    .eq("deployment_id", deploymentId)
    .eq("status", "active");

  // Update the deployment to point to the target revision
  const { error } = await supabase
    .from("deployments")
    .update({
      status: "rolled_back",
      current_revision_id: targetRevisionId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", deploymentId);

  if (error) {
    return { error: "Failed to rollback deployment" };
  }

  recordAuditEvent(supabase, {
    org_id: org.id,
    user_id: user.id,
    action: "rollback",
    resource_type: "deployment",
    resource_id: deploymentId,
    details: { reason, targetRevisionId },
  });

  revalidatePath(`/projects/${projectId}/deployments/${deploymentId}`);
  revalidatePath(`/projects/${projectId}`);

  return { success: true };
}

/**
 * Submit an approval vote (approve or reject) for a deployment approval.
 */
export async function submitApprovalVote(
  projectId: string,
  approvalId: string,
  decision: "approve" | "reject",
  comment?: string,
): Promise<ActionResult> {
  const { supabase, user, org, role } = await requireUserWithOrg();

  if (!hasMinRole(role, "developer")) {
    return { error: "You don't have permission to vote on approvals" };
  }

  // Verify the approval exists and is pending
  const { data: approval } = await supabase
    .from("deployment_approvals")
    .select("id, status, required_approvals")
    .eq("id", approvalId)
    .single();

  if (!approval) {
    return { error: "Approval not found" };
  }

  if (approval.status !== "pending") {
    return { error: `Approval is already ${approval.status}` };
  }

  // Insert the vote
  const { error: voteError } = await supabase
    .from("approval_votes")
    .insert({
      approval_id: approvalId,
      user_id: user.id,
      decision,
      comment: comment || null,
    });

  if (voteError) {
    if (voteError.code === "23505") {
      return { error: "You have already voted on this approval" };
    }
    return { error: "Failed to submit vote" };
  }

  // Check if enough approvals have been cast
  if (decision === "reject") {
    // Any rejection immediately rejects the approval
    await supabase
      .from("deployment_approvals")
      .update({ status: "rejected", updated_at: new Date().toISOString() })
      .eq("id", approvalId);
  } else {
    // Count approve votes
    const { count } = await supabase
      .from("approval_votes")
      .select("id", { count: "exact", head: true })
      .eq("approval_id", approvalId)
      .eq("decision", "approve");

    if (count !== null && count >= approval.required_approvals) {
      await supabase
        .from("deployment_approvals")
        .update({ status: "approved", updated_at: new Date().toISOString() })
        .eq("id", approvalId);
    }
  }

  recordAuditEvent(supabase, {
    org_id: org.id,
    user_id: user.id,
    action: decision === "approve" ? "approve" : "reject",
    resource_type: "deployment_approval",
    resource_id: approvalId,
    details: { decision, comment },
  });

  revalidatePath(`/projects/${projectId}`);

  return { success: true };
}

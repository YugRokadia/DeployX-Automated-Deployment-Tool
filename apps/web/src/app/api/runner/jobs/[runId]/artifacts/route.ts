import { NextResponse } from "next/server";
import { authenticateRunner } from "@/lib/auth/runner";
import { createServiceClient } from "@/lib/supabase/service";
import { UploadArtifactSchema, ARTIFACT_MAX_SIZE_BYTES } from "@deployx/shared";

/**
 * POST /api/runner/jobs/[runId]/artifacts
 * Upload a build artifact to Supabase Storage.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const auth = await authenticateRunner(request);
  if (!auth.ok) return auth.response;
  const { runId } = await params;

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "Content-Type must be multipart/form-data" },
      { status: 400 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Failed to parse form data" },
      { status: 400 },
    );
  }

  const file = formData.get("file") as File | null;
  const filename = (formData.get("filename") as string | null) ?? file?.name;
  const projectId = formData.get("project_id") as string | null;

  if (!file || !filename || !projectId) {
    return NextResponse.json(
      { error: "file, filename, and project_id are required" },
      { status: 400 },
    );
  }

  if (file.size > ARTIFACT_MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: `File exceeds maximum size of ${ARTIFACT_MAX_SIZE_BYTES} bytes` },
      { status: 400 },
    );
  }

  const parsed = UploadArtifactSchema.safeParse({
    filename,
    pipeline_run_id: runId,
    project_id: projectId,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();

  // Look up org_id for path
  const { data: run } = await supabase
    .from("pipeline_runs")
    .select("project_id, projects(org_id)")
    .eq("id", runId)
    .single();

  if (!run) {
    return NextResponse.json(
      { error: "Pipeline run not found" },
      { status: 404 },
    );
  }

  const orgId = (run.projects as unknown as { org_id: string })?.org_id;
  const storagePath = `${orgId}/${projectId}/${runId}/${filename}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from("build-artifacts")
    .upload(storagePath, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: `Upload failed: ${uploadError.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ path: storagePath }, { status: 201 });
}

/**
 * GET /api/runner/jobs/[runId]/artifacts
 * List artifacts for a pipeline run.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const auth = await authenticateRunner(request);
  if (!auth.ok) return auth.response;
  const { runId } = await params;

  const supabase = createServiceClient();

  const { data: run } = await supabase
    .from("pipeline_runs")
    .select("project_id, projects(org_id)")
    .eq("id", runId)
    .single();

  if (!run) {
    return NextResponse.json(
      { error: "Pipeline run not found" },
      { status: 404 },
    );
  }

  const orgId = (run.projects as unknown as { org_id: string })?.org_id;
  const prefix = `${orgId}/${run.project_id}/${runId}`;

  const { data: files, error } = await supabase.storage
    .from("build-artifacts")
    .list(prefix);

  if (error) {
    return NextResponse.json(
      { error: `Failed to list artifacts: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    artifacts: (files ?? []).map((f) => ({
      name: f.name,
      size: f.metadata?.size ?? null,
      created_at: f.created_at,
      path: `${prefix}/${f.name}`,
    })),
  });
}

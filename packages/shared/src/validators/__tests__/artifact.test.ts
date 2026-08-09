import { describe, it, expect } from "vitest";
import { UploadArtifactSchema } from "../artifact";

describe("UploadArtifactSchema", () => {
  it("parses valid upload with .tar.gz extension", () => {
    const input = {
      filename: "build-output.tar.gz",
      pipeline_run_id: "00000000-0000-0000-0000-000000000001",
      project_id: "00000000-0000-0000-0000-000000000002",
    };

    const result = UploadArtifactSchema.parse(input);

    expect(result).toEqual(input);
  });

  it("rejects invalid extension", () => {
    const result = UploadArtifactSchema.safeParse({
      filename: "malware.exe",
      pipeline_run_id: "00000000-0000-0000-0000-000000000001",
      project_id: "00000000-0000-0000-0000-000000000002",
    });

    expect(result.success).toBe(false);
  });

  it("rejects missing filename", () => {
    const result = UploadArtifactSchema.safeParse({
      pipeline_run_id: "00000000-0000-0000-0000-000000000001",
      project_id: "00000000-0000-0000-0000-000000000002",
    });

    expect(result.success).toBe(false);
  });
});

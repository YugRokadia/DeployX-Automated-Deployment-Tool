import { describe, it, expect } from "vitest";
import { parsePipelineYaml, tryParsePipelineYaml } from "../parser";

const VALID_YAML = `
name: my-pipeline
tasks:
  build:
    steps:
      - name: Compile
        command: npm run build
  test:
    depends_on: [build]
    steps:
      - name: Unit tests
        command: npm test
      - name: Lint
        command: npm run lint
`;

describe("parsePipelineYaml", () => {
  it("parses valid pipeline YAML", () => {
    const config = parsePipelineYaml(VALID_YAML);
    expect(config.name).toBe("my-pipeline");
    expect(Object.keys(config.tasks)).toEqual(["build", "test"]);
    expect(config.tasks.build.steps).toHaveLength(1);
    expect(config.tasks.test.steps).toHaveLength(2);
    expect(config.tasks.test.depends_on).toEqual(["build"]);
  });

  it("throws on empty string", () => {
    expect(() => parsePipelineYaml("")).toThrow("empty");
  });

  it("throws on invalid YAML syntax", () => {
    expect(() => parsePipelineYaml("{ invalid yaml: [")).toThrow(
      "YAML syntax error",
    );
  });

  it("throws when tasks is missing", () => {
    expect(() => parsePipelineYaml("name: test\n")).toThrow("validation failed");
  });

  it("throws when a task has no steps", () => {
    const yaml = `
name: test
tasks:
  build:
    steps: []
`;
    expect(() => parsePipelineYaml(yaml)).toThrow("at least one step");
  });

  it("throws on non-object YAML (scalar)", () => {
    expect(() => parsePipelineYaml("just a string")).toThrow(
      "must be a YAML mapping",
    );
  });

  it("throws on non-object YAML (array)", () => {
    expect(() => parsePipelineYaml("- item1\n- item2")).toThrow(
      "must be a YAML mapping",
    );
  });
});

describe("tryParsePipelineYaml", () => {
  it("returns success for valid YAML", () => {
    const result = tryParsePipelineYaml(VALID_YAML);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("my-pipeline");
    }
  });

  it("returns error for empty input", () => {
    const result = tryParsePipelineYaml("");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("empty");
    }
  });

  it("returns error for invalid YAML", () => {
    const result = tryParsePipelineYaml("{ broken");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("YAML syntax error");
    }
  });

  it("preserves variable interpolation strings", () => {
    const yaml = `
name: deploy-pipeline
tasks:
  build:
    steps:
      - name: Build
        command: "docker build -t app:\${{ git.sha }}"
`;
    const result = tryParsePipelineYaml(yaml);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tasks.build.steps[0].command).toContain(
        "${{ git.sha }}",
      );
    }
  });

  it("handles optional step fields", () => {
    const yaml = `
name: full-pipeline
tasks:
  build:
    steps:
      - name: Build
        command: npm run build
        image: node:20
        timeout_seconds: 300
        env:
          NODE_ENV: production
          CI: "true"
`;
    const result = tryParsePipelineYaml(yaml);
    expect(result.success).toBe(true);
    if (result.success) {
      const step = result.data.tasks.build.steps[0];
      expect(step.image).toBe("node:20");
      expect(step.timeout_seconds).toBe(300);
      expect(step.env).toEqual({ NODE_ENV: "production", CI: "true" });
    }
  });

  it("handles approval_required on tasks", () => {
    const yaml = `
name: deploy
tasks:
  deploy:
    approval_required: true
    steps:
      - name: Deploy
        command: deploy.sh
`;
    const result = tryParsePipelineYaml(yaml);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tasks.deploy.approval_required).toBe(true);
    }
  });
});

import { describe, it, expect } from "vitest";
import {
  validatePipelineTransition,
  assertPipelineTransition,
  isPipelineTerminal,
  validateTaskTransition,
  assertTaskTransition,
  isTaskTerminal,
  validateStepTransition,
  assertStepTransition,
  isStepTerminal,
  validateDeploymentTransition,
  assertDeploymentTransition,
  isDeploymentTerminal,
  InvalidTransitionError,
} from "../state-machine";

describe("Pipeline transitions", () => {
  it("allows created → queued", () => {
    expect(validatePipelineTransition("created", "queued")).toBe(true);
  });

  it("allows queued → running", () => {
    expect(validatePipelineTransition("queued", "running")).toBe(true);
  });

  it("allows queued → cancelled", () => {
    expect(validatePipelineTransition("queued", "cancelled")).toBe(true);
  });

  it("allows running → success", () => {
    expect(validatePipelineTransition("running", "success")).toBe(true);
  });

  it("allows running → failed", () => {
    expect(validatePipelineTransition("running", "failed")).toBe(true);
  });

  it("allows running → timed_out", () => {
    expect(validatePipelineTransition("running", "timed_out")).toBe(true);
  });

  it("rejects created → running (must go through queued)", () => {
    expect(validatePipelineTransition("created", "running")).toBe(false);
  });

  it("rejects success → running (terminal state)", () => {
    expect(validatePipelineTransition("success", "running")).toBe(false);
  });

  it("rejects failed → success", () => {
    expect(validatePipelineTransition("failed", "success")).toBe(false);
  });

  it("assert throws InvalidTransitionError on invalid transition", () => {
    expect(() => assertPipelineTransition("success", "running")).toThrow(
      InvalidTransitionError,
    );
  });

  it("InvalidTransitionError has correct fields", () => {
    try {
      assertPipelineTransition("success", "running");
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidTransitionError);
      const e = err as InvalidTransitionError;
      expect(e.entity).toBe("pipeline");
      expect(e.from).toBe("success");
      expect(e.to).toBe("running");
    }
  });

  it("identifies terminal states", () => {
    expect(isPipelineTerminal("success")).toBe(true);
    expect(isPipelineTerminal("failed")).toBe(true);
    expect(isPipelineTerminal("cancelled")).toBe(true);
    expect(isPipelineTerminal("timed_out")).toBe(true);
    expect(isPipelineTerminal("created")).toBe(false);
    expect(isPipelineTerminal("queued")).toBe(false);
    expect(isPipelineTerminal("running")).toBe(false);
  });
});

describe("Task transitions", () => {
  it("allows pending → running", () => {
    expect(validateTaskTransition("pending", "running")).toBe(true);
  });

  it("allows pending → skipped", () => {
    expect(validateTaskTransition("pending", "skipped")).toBe(true);
  });

  it("allows awaiting_approval → running", () => {
    expect(validateTaskTransition("awaiting_approval", "running")).toBe(true);
  });

  it("allows awaiting_approval → cancelled", () => {
    expect(validateTaskTransition("awaiting_approval", "cancelled")).toBe(true);
  });

  it("rejects pending → success (must go through running)", () => {
    expect(validateTaskTransition("pending", "success")).toBe(false);
  });

  it("assert throws on invalid transition", () => {
    expect(() => assertTaskTransition("success", "running")).toThrow(
      InvalidTransitionError,
    );
  });

  it("identifies terminal states", () => {
    expect(isTaskTerminal("success")).toBe(true);
    expect(isTaskTerminal("failed")).toBe(true);
    expect(isTaskTerminal("cancelled")).toBe(true);
    expect(isTaskTerminal("skipped")).toBe(true);
    expect(isTaskTerminal("pending")).toBe(false);
    expect(isTaskTerminal("running")).toBe(false);
    expect(isTaskTerminal("awaiting_approval")).toBe(false);
  });
});

describe("Step transitions", () => {
  it("allows pending → running", () => {
    expect(validateStepTransition("pending", "running")).toBe(true);
  });

  it("allows running → success", () => {
    expect(validateStepTransition("running", "success")).toBe(true);
  });

  it("allows running → failed", () => {
    expect(validateStepTransition("running", "failed")).toBe(true);
  });

  it("allows pending → skipped", () => {
    expect(validateStepTransition("pending", "skipped")).toBe(true);
  });

  it("rejects success → running", () => {
    expect(validateStepTransition("success", "running")).toBe(false);
  });

  it("assert throws on invalid transition", () => {
    expect(() => assertStepTransition("failed", "success")).toThrow(
      InvalidTransitionError,
    );
  });

  it("identifies terminal states", () => {
    expect(isStepTerminal("success")).toBe(true);
    expect(isStepTerminal("failed")).toBe(true);
    expect(isStepTerminal("cancelled")).toBe(true);
    expect(isStepTerminal("skipped")).toBe(true);
    expect(isStepTerminal("pending")).toBe(false);
    expect(isStepTerminal("running")).toBe(false);
  });
});

describe("Deployment transitions", () => {
  it("allows pending → deploying", () => {
    expect(validateDeploymentTransition("pending", "deploying")).toBe(true);
  });

  it("allows pending → failed", () => {
    expect(validateDeploymentTransition("pending", "failed")).toBe(true);
  });

  it("allows deploying → active", () => {
    expect(validateDeploymentTransition("deploying", "active")).toBe(true);
  });

  it("allows deploying → failed", () => {
    expect(validateDeploymentTransition("deploying", "failed")).toBe(true);
  });

  it("allows active → draining", () => {
    expect(validateDeploymentTransition("active", "draining")).toBe(true);
  });

  it("allows active → stopped", () => {
    expect(validateDeploymentTransition("active", "stopped")).toBe(true);
  });

  it("allows active → rolled_back", () => {
    expect(validateDeploymentTransition("active", "rolled_back")).toBe(true);
  });

  it("rejects pending → active (must go through deploying)", () => {
    expect(validateDeploymentTransition("pending", "active")).toBe(false);
  });

  it("rejects stopped → active (terminal)", () => {
    expect(validateDeploymentTransition("stopped", "active")).toBe(false);
  });

  it("rejects failed → deploying (terminal)", () => {
    expect(validateDeploymentTransition("failed", "deploying")).toBe(false);
  });

  it("assert throws on invalid transition", () => {
    expect(() => assertDeploymentTransition("failed", "active")).toThrow(
      InvalidTransitionError,
    );
  });

  it("assert does not throw on valid transition", () => {
    expect(() => assertDeploymentTransition("pending", "deploying")).not.toThrow();
  });

  it("identifies terminal states", () => {
    expect(isDeploymentTerminal("stopped")).toBe(true);
    expect(isDeploymentTerminal("rolled_back")).toBe(true);
    expect(isDeploymentTerminal("failed")).toBe(true);
    expect(isDeploymentTerminal("pending")).toBe(false);
    expect(isDeploymentTerminal("deploying")).toBe(false);
    expect(isDeploymentTerminal("active")).toBe(false);
    expect(isDeploymentTerminal("draining")).toBe(false);
  });
});

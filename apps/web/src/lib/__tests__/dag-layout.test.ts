import { describe, it, expect } from "vitest";
import { layoutDAG, type TaskRunForDAG } from "../dag-layout";

function createTask(
  overrides: Partial<TaskRunForDAG> & { task_name: string },
): TaskRunForDAG {
  return {
    id: `id-${overrides.task_name}`,
    status: "pending",
    depends_on: [],
    duration_ms: null,
    ...overrides,
  };
}

describe("layoutDAG", () => {
  it("returns empty result for empty input", () => {
    const result = layoutDAG([]);

    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });

  it("positions a single node", () => {
    const result = layoutDAG([createTask({ task_name: "build" })]);

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe("build");
    expect(result.nodes[0].type).toBe("taskNode");
    expect(result.nodes[0].position.x).toBeDefined();
    expect(result.nodes[0].position.y).toBeDefined();
    expect(result.edges).toHaveLength(0);
  });

  it("creates edges for linear chain A→B→C", () => {
    const tasks = [
      createTask({ task_name: "A" }),
      createTask({ task_name: "B", depends_on: ["A"] }),
      createTask({ task_name: "C", depends_on: ["B"] }),
    ];

    const result = layoutDAG(tasks);

    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(2);

    const edgeIds = result.edges.map((e) => e.id);
    expect(edgeIds).toContain("A->B");
    expect(edgeIds).toContain("B->C");
  });

  it("places nodes in vertical order for linear chain", () => {
    const tasks = [
      createTask({ task_name: "A" }),
      createTask({ task_name: "B", depends_on: ["A"] }),
      createTask({ task_name: "C", depends_on: ["B"] }),
    ];

    const result = layoutDAG(tasks);
    const nodeByName = new Map(result.nodes.map((n) => [n.id, n]));

    // A should be above B, B above C (TB layout)
    expect(nodeByName.get("A")!.position.y).toBeLessThan(
      nodeByName.get("B")!.position.y,
    );
    expect(nodeByName.get("B")!.position.y).toBeLessThan(
      nodeByName.get("C")!.position.y,
    );
  });

  it("places parallel tasks at same rank", () => {
    const tasks = [
      createTask({ task_name: "start" }),
      createTask({ task_name: "A", depends_on: ["start"] }),
      createTask({ task_name: "B", depends_on: ["start"] }),
      createTask({ task_name: "end", depends_on: ["A", "B"] }),
    ];

    const result = layoutDAG(tasks);
    const nodeByName = new Map(result.nodes.map((n) => [n.id, n]));

    // A and B should be at the same y position (same rank)
    expect(nodeByName.get("A")!.position.y).toBe(
      nodeByName.get("B")!.position.y,
    );

    // start should be above A/B, A/B above end
    expect(nodeByName.get("start")!.position.y).toBeLessThan(
      nodeByName.get("A")!.position.y,
    );
    expect(nodeByName.get("A")!.position.y).toBeLessThan(
      nodeByName.get("end")!.position.y,
    );
  });

  it("passes status through to node data", () => {
    const tasks = [
      createTask({ task_name: "build", status: "success" }),
      createTask({ task_name: "test", status: "running", depends_on: ["build"] }),
    ];

    const result = layoutDAG(tasks);
    const nodeByName = new Map(result.nodes.map((n) => [n.id, n]));

    expect((nodeByName.get("build")!.data as { status: string }).status).toBe(
      "success",
    );
    expect((nodeByName.get("test")!.data as { status: string }).status).toBe(
      "running",
    );
  });

  it("includes task id in node data", () => {
    const result = layoutDAG([
      createTask({ task_name: "deploy", id: "uuid-123" }),
    ]);

    expect((result.nodes[0].data as { id: string }).id).toBe("uuid-123");
  });

  it("includes duration in node data", () => {
    const result = layoutDAG([
      createTask({ task_name: "build", duration_ms: 5000 }),
    ]);

    expect(
      (result.nodes[0].data as { durationMs: number | null }).durationMs,
    ).toBe(5000);
  });

  it("ignores depends_on references to nonexistent tasks", () => {
    const tasks = [
      createTask({ task_name: "B", depends_on: ["nonexistent"] }),
    ];

    const result = layoutDAG(tasks);

    expect(result.nodes).toHaveLength(1);
    expect(result.edges).toHaveLength(0);
  });

  it("handles diamond dependency graph", () => {
    // A → B, A → C, B → D, C → D
    const tasks = [
      createTask({ task_name: "A" }),
      createTask({ task_name: "B", depends_on: ["A"] }),
      createTask({ task_name: "C", depends_on: ["A"] }),
      createTask({ task_name: "D", depends_on: ["B", "C"] }),
    ];

    const result = layoutDAG(tasks);

    expect(result.nodes).toHaveLength(4);
    expect(result.edges).toHaveLength(4);

    const edgeIds = result.edges.map((e) => e.id);
    expect(edgeIds).toContain("A->B");
    expect(edgeIds).toContain("A->C");
    expect(edgeIds).toContain("B->D");
    expect(edgeIds).toContain("C->D");
  });

  it("applies animated edge style for running tasks", () => {
    const tasks = [
      createTask({ task_name: "A", status: "success" }),
      createTask({ task_name: "B", depends_on: ["A"], status: "running" }),
    ];

    const result = layoutDAG(tasks);
    const edge = result.edges.find((e) => e.id === "A->B")!;

    expect(edge.animated).toBe(true);
  });

  it("applies dashed edge style for pending tasks", () => {
    const tasks = [
      createTask({ task_name: "A", status: "success" }),
      createTask({ task_name: "B", depends_on: ["A"], status: "pending" }),
    ];

    const result = layoutDAG(tasks);
    const edge = result.edges.find((e) => e.id === "A->B")!;

    expect(edge.animated).toBe(false);
    expect(edge.style).toHaveProperty("strokeDasharray");
  });
});

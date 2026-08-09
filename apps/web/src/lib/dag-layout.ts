/**
 * DAG Layout — Transforms task runs into @xyflow/react nodes and edges
 * using dagre for hierarchical positioning.
 */
import dagre from "@dagrejs/dagre";
import type { Node, Edge } from "@xyflow/react";

export interface TaskRunForDAG {
  readonly id: string;
  readonly task_name: string;
  readonly status: string;
  readonly depends_on: readonly string[];
  readonly duration_ms: number | null;
}

export interface LayoutResult {
  readonly nodes: Node[];
  readonly edges: Edge[];
}

const NODE_WIDTH = 220;
const NODE_HEIGHT = 60;

const EDGE_STYLE_BY_STATUS: Record<string, Partial<Edge>> = {
  running: { animated: true, style: { stroke: "var(--color-primary)", strokeWidth: 2 } },
  success: { animated: false, style: { stroke: "var(--color-tertiary)", strokeWidth: 1.5 } },
  failed: { animated: false, style: { stroke: "var(--color-error)", strokeWidth: 1.5 } },
};

const DEFAULT_EDGE_STYLE: Partial<Edge> = {
  animated: false,
  style: { stroke: "var(--color-outline-variant)", strokeWidth: 1, strokeDasharray: "4 4" },
};

/**
 * Compute DAG layout from task runs using dagre.
 * Returns positioned nodes and styled edges for @xyflow/react.
 */
export function layoutDAG(taskRuns: readonly TaskRunForDAG[]): LayoutResult {
  if (taskRuns.length === 0) {
    return { nodes: [], edges: [] };
  }

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 60, ranksep: 80 });

  // Build name → task lookup for edge resolution
  const taskByName = new Map<string, TaskRunForDAG>();
  for (const task of taskRuns) {
    taskByName.set(task.task_name, task);
  }

  // Add nodes
  for (const task of taskRuns) {
    g.setNode(task.task_name, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  // Add edges (from dependency → this task)
  const edges: Edge[] = [];
  for (const task of taskRuns) {
    for (const dep of task.depends_on) {
      if (taskByName.has(dep)) {
        const edgeId = `${dep}->${task.task_name}`;
        const edgeStyle = EDGE_STYLE_BY_STATUS[task.status] ?? DEFAULT_EDGE_STYLE;
        edges.push({
          id: edgeId,
          source: dep,
          target: task.task_name,
          ...edgeStyle,
        });
        g.setEdge(dep, task.task_name);
      }
    }
  }

  // Compute layout
  dagre.layout(g);

  // Map to @xyflow/react nodes with dagre positions
  const nodes: Node[] = taskRuns.map((task) => {
    const nodeData = g.node(task.task_name);
    return {
      id: task.task_name,
      type: "taskNode",
      position: {
        x: nodeData.x - NODE_WIDTH / 2,
        y: nodeData.y - NODE_HEIGHT / 2,
      },
      data: {
        id: task.id,
        taskName: task.task_name,
        status: task.status,
        durationMs: task.duration_ms,
      },
    };
  });

  return { nodes, edges };
}

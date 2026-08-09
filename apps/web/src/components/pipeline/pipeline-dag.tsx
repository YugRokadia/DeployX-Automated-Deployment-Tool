"use client";

import { useMemo, useCallback } from "react";
import {
  ReactFlow,
  Background,
  type Node,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { layoutDAG, type TaskRunForDAG } from "@/lib/dag-layout";
import { TaskNode } from "./task-node";

interface PipelineDAGProps {
  readonly taskRuns: readonly TaskRunForDAG[];
  readonly selectedTaskId: string | null;
  readonly onTaskSelect: (taskId: string | null) => void;
}

const nodeTypes: NodeTypes = {
  taskNode: TaskNode,
};

export function PipelineDAG({ taskRuns, selectedTaskId, onTaskSelect }: PipelineDAGProps) {
  const { nodes, edges } = useMemo(
    () => layoutDAG(taskRuns),
    [taskRuns],
  );

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const taskId = (node.data as { id: string }).id;
      onTaskSelect(selectedTaskId === taskId ? null : taskId);
    },
    [selectedTaskId, onTaskSelect],
  );

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll
        minZoom={0.5}
        maxZoom={1.5}
      >
        <Background color="var(--color-outline-variant)" gap={20} size={1} style={{ opacity: 0.1 }} />
      </ReactFlow>
    </div>
  );
}

import React, { useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
  BackgroundVariant,
} from 'reactflow';
import { TensorInputNode } from './nodes/TensorInputNode';
import { TritonKernelNode } from './nodes/TritonKernelNode';
import { ExecutionNode } from './nodes/ExecutionNode';
import { OutputNode } from './nodes/OutputNode';

interface CanvasProps {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
}

export const Canvas: React.FC<CanvasProps> = ({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
}) => {
  const nodeTypes = useMemo(
    () => ({
      tensorInput: TensorInputNode,
      tritonKernel: TritonKernelNode,
      execution: ExecutionNode,
      output: OutputNode,
    }),
    []
  );

  return (
    <div className="h-full w-full bg-slate-950">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={1.5}
        defaultEdgeOptions={{
          animated: true,
          style: { stroke: '#38bdf8', strokeWidth: 2 },
        }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1.2}
          color="#334155"
        />
        <Controls className="!bg-slate-900 !border-slate-800 !text-slate-200 fill-slate-200" />
        <MiniMap
          nodeColor={(n) => {
            if (n.type === 'tensorInput') return '#38bdf8';
            if (n.type === 'tritonKernel') return '#a855f7';
            if (n.type === 'execution') return '#f59e0b';
            return '#10b981';
          }}
          maskColor="rgba(15, 23, 42, 0.75)"
          className="!bg-slate-950 !border-slate-800 !rounded-lg overflow-hidden"
        />
      </ReactFlow>
    </div>
  );
};

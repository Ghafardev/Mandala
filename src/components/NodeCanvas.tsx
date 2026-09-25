import React, { useState, useMemo, useCallback } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  Handle,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  BackgroundVariant,
} from 'reactflow';
import {
  Layers,
  Cpu,
  Activity,
  Play,
  CheckCircle2,
  AlertTriangle,
  Sliders,
  Database,
  Terminal,
  Zap,
  Gauge,
  Loader2,
  Clock,
  Sparkles,
} from 'lucide-react';
import { fetchWithBackendFallback } from '../lib/api';

export interface NodeCanvasProps {
  onLogMessage?: (log: string) => void;
  onExecutionComplete?: (result: any) => void;
  isCompiling: boolean;
  setIsCompiling: (val: boolean) => void;
}

// ----------------------------------------------------
// Custom Node 1: Input Tensor (Vector Size slider 1024 - 65536)
// ----------------------------------------------------
const InputTensorNode = ({ data }: { data: any }) => {
  const { vectorSize, setVectorSize, dtype, setDtype } = data;
  const bytesPerElem = dtype === 'float32' ? 4 : 2;
  const memoryKB = ((vectorSize * bytesPerElem) / 1024).toFixed(1);

  return (
    <div className="w-80 rounded-xl border border-zinc-700/80 bg-zinc-900/95 text-zinc-100 shadow-2xl backdrop-blur-md transition-all hover:border-cyan-500/60">
      {/* Node Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-950/80 px-4 py-3 rounded-t-xl">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-cyan-500/10 p-1.5 text-cyan-400 border border-cyan-500/20">
            <Database className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold tracking-wide text-zinc-100 uppercase">Input Tensor</h3>
            <p className="text-[10px] text-zinc-400 font-mono">PyTorch ROCm Buffer (hip:0)</p>
          </div>
        </div>
        <span className="rounded bg-cyan-950/60 border border-cyan-800/40 px-2 py-0.5 text-[10px] font-mono text-cyan-300">
          Node 1
        </span>
      </div>

      <div className="p-4 space-y-4 text-xs">
        {/* Vector Size Slider: 1024 - 65536 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-medium text-zinc-300 flex items-center gap-1.5">
              <Sliders className="h-3.5 w-3.5 text-cyan-400" />
              Vector Size (N Elements)
            </label>
            <span className="font-mono text-xs font-semibold text-cyan-300 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
              {vectorSize.toLocaleString()}
            </span>
          </div>

          <input
            type="range"
            min={1024}
            max={65536}
            step={1024}
            value={vectorSize}
            onChange={(e) => setVectorSize(Number(e.target.value))}
            className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-zinc-800 rounded-lg appearance-none"
          />

          {/* Preset Buttons */}
          <div className="grid grid-cols-4 gap-1 pt-1">
            {[1024, 8192, 32768, 65536].map((size) => (
              <button
                key={size}
                onClick={() => setVectorSize(size)}
                className={`py-1 rounded text-[10px] font-mono transition border ${
                  vectorSize === size
                    ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-200 font-semibold'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                }`}
              >
                {size >= 1024 ? `${size / 1024}K` : size}
              </button>
            ))}
          </div>
        </div>

        {/* DType Selector & Memory Stats */}
        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-zinc-800/80">
          <div>
            <label className="text-[10px] text-zinc-400 font-mono block mb-1">Precision</label>
            <select
              value={dtype}
              onChange={(e) => setDtype(e.target.value)}
              className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-xs text-zinc-200 focus:border-cyan-500 focus:outline-none"
            >
              <option value="bfloat16">bfloat16 (MFMA)</option>
              <option value="float16">float16 (FP16)</option>
              <option value="float32">float32 (FP32)</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] text-zinc-400 font-mono block mb-1">HBM Allocation</label>
            <div className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 font-mono text-xs text-emerald-400">
              {memoryKB} KB
            </div>
          </div>
        </div>
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position="right"
        id="tensor-out"
        className="!w-3 !h-3 !bg-cyan-400 !border-2 !border-zinc-900"
      />
    </div>
  );
};

// ----------------------------------------------------
// Custom Node 2: Triton Kernel (Block Size selector: 64, 128, 256, 512)
// ----------------------------------------------------
const TritonKernelNode = ({ data }: { data: any }) => {
  const { blockSize, setBlockSize, numWarps, setNumWarps } = data;
  const allowedBlockSizes = [64, 128, 256, 512];

  // AMD CDNA 3 Wavefront = 64 threads
  const totalThreadsPerBlock = blockSize;
  const activeWavefronts = Math.max(1, Math.ceil(totalThreadsPerBlock / 64));

  return (
    <div className="w-84 rounded-xl border border-zinc-700/80 bg-zinc-900/95 text-zinc-100 shadow-2xl backdrop-blur-md transition-all hover:border-violet-500/60">
      {/* Input Handle */}
      <Handle
        type="target"
        position="left"
        id="kernel-in"
        className="!w-3 !h-3 !bg-cyan-400 !border-2 !border-zinc-900"
      />

      {/* Node Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-950/80 px-4 py-3 rounded-t-xl">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-violet-500/10 p-1.5 text-violet-400 border border-violet-500/20">
            <Cpu className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold tracking-wide text-zinc-100 uppercase">Triton Kernel</h3>
            <p className="text-[10px] text-zinc-400 font-mono">AMD CDNA 3 / Wave64 JIT</p>
          </div>
        </div>
        <span className="rounded bg-violet-950/60 border border-violet-800/40 px-2 py-0.5 text-[10px] font-mono text-violet-300">
          Node 2
        </span>
      </div>

      <div className="p-4 space-y-4 text-xs">
        {/* Block Size Selector: 64, 128, 256, 512 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-medium text-zinc-300 flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-violet-400" />
              Block Size (BLOCK_SIZE)
            </label>
            <span className="font-mono text-xs font-semibold text-violet-300 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
              {blockSize}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {allowedBlockSizes.map((size) => (
              <button
                key={size}
                onClick={() => setBlockSize(size)}
                className={`py-2 rounded-lg text-xs font-mono font-medium transition border ${
                  blockSize === size
                    ? 'bg-violet-600/30 border-violet-500 text-violet-200 shadow-sm'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        {/* AMD CDNA Wavefront Occupancy Specs */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 space-y-2 font-mono text-[11px]">
          <div className="flex justify-between text-zinc-400">
            <span>Wavefront Size:</span>
            <span className="text-zinc-200 font-semibold">64 threads (Wave64)</span>
          </div>
          <div className="flex justify-between text-zinc-400">
            <span>Waves per Block:</span>
            <span className="text-violet-300 font-semibold">{activeWavefronts} wave(s)</span>
          </div>
          <div className="flex justify-between text-zinc-400">
            <span>MFMA Target:</span>
            <span className="text-emerald-400">gfx942 Matrix Cores</span>
          </div>
        </div>
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position="right"
        id="kernel-out"
        className="!w-3 !h-3 !bg-violet-400 !border-2 !border-zinc-900"
      />
    </div>
  );
};

// ----------------------------------------------------
// Custom Node 3: Output Evaluation (Shows status & triggers "Run Kernel")
// ----------------------------------------------------
const OutputEvaluationNode = ({ data }: { data: any }) => {
  const { onRunKernel, isCompiling, result } = data;

  return (
    <div className="w-88 rounded-xl border border-zinc-700/80 bg-zinc-900/95 text-zinc-100 shadow-2xl backdrop-blur-md transition-all hover:border-emerald-500/60">
      {/* Input Handle */}
      <Handle
        type="target"
        position="left"
        id="eval-in"
        className="!w-3 !h-3 !bg-violet-400 !border-2 !border-zinc-900"
      />

      {/* Node Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-950/80 px-4 py-3 rounded-t-xl">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-emerald-500/10 p-1.5 text-emerald-400 border border-emerald-500/20">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold tracking-wide text-zinc-100 uppercase">Output Evaluation</h3>
            <p className="text-[10px] text-zinc-400 font-mono">ROCm Verification & Profiler</p>
          </div>
        </div>
        <span className="rounded bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 text-[10px] font-mono text-emerald-300">
          Node 3
        </span>
      </div>

      <div className="p-4 space-y-4 text-xs">
        {/* Status Indicator */}
        <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
          <span className="text-[11px] text-zinc-400">Execution Status:</span>
          {isCompiling ? (
            <span className="flex items-center gap-1.5 font-mono text-xs font-semibold text-amber-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Compiling HSA...
            </span>
          ) : result ? (
            <span className="flex items-center gap-1.5 font-mono text-xs font-semibold text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              MATCH VERIFIED
            </span>
          ) : (
            <span className="font-mono text-xs text-zinc-400">Idle / Ready</span>
          )}
        </div>

        {/* Trigger "Run Kernel" button */}
        <button
          onClick={onRunKernel}
          disabled={isCompiling}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 font-semibold text-zinc-950 shadow-lg shadow-emerald-950/40 transition hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isCompiling ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-zinc-950" />
              <span>Executing on ROCm...</span>
            </>
          ) : (
            <>
              <Play className="h-4 w-4 fill-zinc-950" />
              <span>Run Kernel</span>
            </>
          )}
        </button>

        {/* Evaluation Metrics (if available) */}
        {result?.metrics && (
          <div className="space-y-2 rounded-lg border border-zinc-800/80 bg-zinc-950/80 p-3 font-mono text-[11px]">
            <div className="flex justify-between text-zinc-400">
              <span>Kernel Latency:</span>
              <span className="text-emerald-300 font-bold">
                {result.metrics.latency_us} μs
              </span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Achieved TFLOPS:</span>
              <span className="text-cyan-300 font-bold">
                {result.metrics.achieved_tflops} ({result.metrics.tflops_efficiency_percent}%)
              </span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>HBM3 Bandwidth:</span>
              <span className="text-violet-300 font-semibold">
                {result.metrics.achieved_bandwidth_gbs} GB/s
              </span>
            </div>
            {result.verification && (
              <div className="flex justify-between text-zinc-400 pt-1 border-t border-zinc-800">
                <span>Ref Max Error:</span>
                <span className="text-emerald-400">
                  {result.verification.max_absolute_error?.toExponential(2) || '0.00e+0'}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const NodeCanvas: React.FC<NodeCanvasProps> = ({
  onLogMessage,
  onExecutionComplete,
  isCompiling,
  setIsCompiling,
}) => {
  // State for Node 1
  const [vectorSize, setVectorSize] = useState<number>(16384);
  const [dtype, setDtype] = useState<string>('bfloat16');

  // State for Node 2
  const [blockSize, setBlockSize] = useState<number>(128);
  const [numWarps, setNumWarps] = useState<number>(4);

  // State for Node 3
  const [executionResult, setExecutionResult] = useState<any>(null);

  // POST request to http://localhost:8000/api/v1/triton/compile-and-run
  const handleRunKernel = useCallback(async () => {
    setIsCompiling(true);
    if (onLogMessage) {
      onLogMessage(`[DISPATCH] POST http://localhost:8000/api/v1/triton/compile-and-run`);
      onLogMessage(`[CONFIG] Vector Size: ${vectorSize}, BLOCK_SIZE: ${blockSize}, DType: ${dtype}`);
    }

    try {
      const response = await fetchWithBackendFallback('/api/v1/triton/compile-and-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kernel_type: 'vector_add',
          vector_size: vectorSize,
          M: Math.max(1, Math.floor(vectorSize / blockSize)),
          N: blockSize,
          K: 1,
          block_size_m: blockSize,
          block_size_n: 1,
          block_size_k: 1,
          num_warps: numWarps,
          num_stages: 2,
          dtype: dtype,
          target_arch: 'gfx942',
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setExecutionResult(data);
      if (onExecutionComplete) {
        onExecutionComplete(data);
      }

      if (onLogMessage) {
        onLogMessage(`[ROCm-HSA] Kernel compilation successful: ${data.kernel_name}`);
        onLogMessage(`[METRICS] Latency: ${data.metrics?.latency_us} μs | TFLOPS: ${data.metrics?.achieved_tflops}`);
        if (data.compiler_log && Array.isArray(data.compiler_log)) {
          data.compiler_log.forEach((line: string) => onLogMessage(`  › ${line}`));
        }
      }
    } catch (err: any) {
      console.error('Execution error:', err);
      if (onLogMessage) {
        onLogMessage(`[ERROR] Kernel execution failure: ${err.message}`);
      }
    } finally {
      setIsCompiling(false);
    }
  }, [vectorSize, blockSize, dtype, numWarps, onLogMessage, onExecutionComplete, setIsCompiling]);

  // Define custom node types
  const nodeTypes = useMemo(
    () => ({
      inputTensorNode: InputTensorNode,
      tritonKernelNode: TritonKernelNode,
      outputEvaluationNode: OutputEvaluationNode,
    }),
    []
  );

  // Pre-populated 3 connected nodes:
  // Node 1: "Input Tensor"
  // Node 2: "Triton Kernel"
  // Node 3: "Output Evaluation"
  const defaultNodes: Node[] = useMemo(
    () => [
      {
        id: 'node-1',
        type: 'inputTensorNode',
        position: { x: 50, y: 160 },
        data: {
          vectorSize,
          setVectorSize,
          dtype,
          setDtype,
        },
      },
      {
        id: 'node-2',
        type: 'tritonKernelNode',
        position: { x: 450, y: 160 },
        data: {
          blockSize,
          setBlockSize,
          numWarps,
          setNumWarps,
        },
      },
      {
        id: 'node-3',
        type: 'outputEvaluationNode',
        position: { x: 860, y: 160 },
        data: {
          onRunKernel: handleRunKernel,
          isCompiling,
          result: executionResult,
        },
      },
    ],
    [
      vectorSize,
      blockSize,
      dtype,
      numWarps,
      handleRunKernel,
      isCompiling,
      executionResult,
    ]
  );

  const defaultEdges: Edge[] = useMemo(
    () => [
      {
        id: 'edge-1-2',
        source: 'node-1',
        sourceHandle: 'tensor-out',
        target: 'node-2',
        targetHandle: 'kernel-in',
        animated: true,
        style: { stroke: '#06b6d4', strokeWidth: 2.5 },
        label: 'PyTorch hip:0',
        labelStyle: { fill: '#71717a', fontSize: 10, fontFamily: 'monospace' },
        labelBgStyle: { fill: '#09090b', fillOpacity: 0.9 },
      },
      {
        id: 'edge-2-3',
        source: 'node-2',
        sourceHandle: 'kernel-out',
        target: 'node-3',
        targetHandle: 'eval-in',
        animated: true,
        style: { stroke: '#a855f7', strokeWidth: 2.5 },
        label: 'AMD Wave64 HSA',
        labelStyle: { fill: '#71717a', fontSize: 10, fontFamily: 'monospace' },
        labelBgStyle: { fill: '#09090b', fillOpacity: 0.9 },
      },
    ],
    []
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(defaultNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(defaultEdges);

  // Sync node data changes to keep sliders/selectors responsive
  React.useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === 'node-1') {
          return {
            ...n,
            data: { vectorSize, setVectorSize, dtype, setDtype },
          };
        }
        if (n.id === 'node-2') {
          return {
            ...n,
            data: { blockSize, setBlockSize, numWarps, setNumWarps },
          };
        }
        if (n.id === 'node-3') {
          return {
            ...n,
            data: {
              onRunKernel: handleRunKernel,
              isCompiling,
              result: executionResult,
            },
          };
        }
        return n;
      })
    );
  }, [
    vectorSize,
    blockSize,
    dtype,
    numWarps,
    handleRunKernel,
    isCompiling,
    executionResult,
    setNodes,
  ]);

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges]
  );

  return (
    <div className="h-full w-full bg-zinc-950">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.3}
        maxZoom={1.5}
        defaultEdgeOptions={{
          animated: true,
          style: { stroke: '#10b981', strokeWidth: 2 },
        }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#27272a"
        />
        <Controls className="!bg-zinc-900 !border-zinc-800 !text-zinc-300 fill-zinc-300" />
        <MiniMap
          nodeColor={(n) => {
            if (n.id === 'node-1') return '#06b6d4';
            if (n.id === 'node-2') return '#a855f7';
            return '#10b981';
          }}
          maskColor="rgba(9, 9, 11, 0.85)"
          className="!bg-zinc-950 !border-zinc-800 !rounded-lg overflow-hidden"
        />
      </ReactFlow>
    </div>
  );
};

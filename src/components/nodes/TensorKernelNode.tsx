import React from 'react';
import { Handle, Position } from 'reactflow';
import { Cpu, Code2, Sparkles, Sliders, Zap } from 'lucide-react';
import { TritonKernelConfig, KernelType } from '../../types';

interface TritonKernelNodeProps {
  data: {
    config: TritonKernelConfig;
    onChange: (config: TritonKernelConfig) => void;
    onOpenCode: () => void;
    onAskCopilot: (prompt: string) => void;
  };
}

export const TritonKernelNode: React.FC<TritonKernelNodeProps> = ({ data }) => {
  const { config, onChange, onOpenCode, onAskCopilot } = data;

  const update = (updates: Partial<TritonKernelConfig>) => {
    onChange({ ...config, ...updates });
  };

  // Calculate Local Data Share (LDS) usage per CU
  // (BLOCK_M * BLOCK_K + BLOCK_K * BLOCK_N) * 2 bytes * num_stages
  const ldsBytes =
    (config.blockM * config.blockK + config.blockK * config.blockN) *
    2 *
    config.numStages;
  const ldsKB = Math.round((ldsBytes / 1024) * 10) / 10;
  const ldsCapacityKB = 64; // AMD CDNA 3 CU limit
  const ldsPercent = Math.min(100, Math.round((ldsKB / ldsCapacityKB) * 100));
  const isLdsOverLimit = ldsKB > ldsCapacityKB;

  return (
    <div className="w-88 rounded-xl border border-violet-500/30 bg-slate-900/95 text-slate-100 shadow-2xl backdrop-blur-md transition-all hover:border-violet-400/60">
      {/* Input Port from Tensor Input */}
      <Handle
        type="target"
        position={Position.Left}
        id="kernel-in"
        className="!w-3 !h-3 !bg-sky-400 !border-slate-900"
      />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/80 px-4 py-3 rounded-t-xl">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-violet-500/20 p-1.5 text-violet-400">
            <Cpu className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-violet-100">Triton Kernel Config</h3>
            <p className="text-[11px] text-slate-400 font-mono">AMD CDNA 3 / Wave64</p>
          </div>
        </div>
        <button
          onClick={onOpenCode}
          className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-[11px] font-mono text-violet-300 hover:bg-slate-700 transition"
          title="Open Triton Python Code"
        >
          <Code2 className="h-3.5 w-3.5" />
          <span>Code</span>
        </button>
      </div>

      <div className="p-4 space-y-4 text-xs">
        {/* Kernel Type Selector */}
        <div>
          <label className="text-[10px] text-slate-400">Kernel Architecture</label>
          <select
            value={config.kernelType}
            onChange={(e) => {
              const kt = e.target.value as KernelType;
              update({ kernelType: kt, kernelName: `triton_${kt}_amd` });
            }}
            className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs font-mono text-violet-200 focus:border-violet-500 focus:outline-none"
          >
            <option value="gemm">Batched GEMM (MFMA Matrix Multiply)</option>
            <option value="flash_attention">FlashAttention-2 (Wave64 Fused Attention)</option>
            <option value="rmsnorm">Fused RMSNorm (Transformer Pre-Norm)</option>
            <option value="softmax">Fused Softmax (Online Reduction)</option>
            <option value="vector_add">Vector Addition (Coalesced 128-bit)</option>
            <option value="custom">Custom Triton Kernel (@triton.jit)</option>
          </select>
        </div>

        {/* Block Sizes */}
        <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 font-medium text-slate-300">
              <Sliders className="h-3.5 w-3.5 text-violet-400" />
              Block Tile Dimensions
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              {config.blockM} × {config.blockN} × {config.blockK}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] text-slate-400">BLOCK_M</label>
              <select
                value={config.blockM}
                onChange={(e) => update({ blockM: parseInt(e.target.value) })}
                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-xs text-violet-300 focus:border-violet-500"
              >
                <option value={32}>32</option>
                <option value={64}>64</option>
                <option value={128}>128 (Opt)</option>
                <option value={256}>256</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] text-slate-400">BLOCK_N</label>
              <select
                value={config.blockN}
                onChange={(e) => update({ blockN: parseInt(e.target.value) })}
                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-xs text-violet-300 focus:border-violet-500"
              >
                <option value={32}>32</option>
                <option value={64}>64</option>
                <option value={128}>128 (Opt)</option>
                <option value={256}>256</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] text-slate-400">BLOCK_K</label>
              <select
                value={config.blockK}
                onChange={(e) => update({ blockK: parseInt(e.target.value) })}
                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-xs text-violet-300 focus:border-violet-500"
              >
                <option value={32}>32</option>
                <option value={64}>64 (Opt)</option>
                <option value={128}>128</option>
              </select>
            </div>
          </div>
        </div>

        {/* Wavefronts and Pipeline Stages */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-slate-400">num_warps</label>
              <span className="text-[9px] text-violet-400 font-mono">Wave64</span>
            </div>
            <select
              value={config.numWarps}
              onChange={(e) => update({ numWarps: parseInt(e.target.value) })}
              className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono text-xs text-slate-200 focus:border-violet-500"
            >
              <option value={2}>2 warps (128 threads)</option>
              <option value={4}>4 warps (256 threads)</option>
              <option value={8}>8 warps (512 threads - Opt)</option>
              <option value={16}>16 warps (1024 threads)</option>
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-slate-400">num_stages</label>
              <span className="text-[9px] text-emerald-400 font-mono">Async Pipeline</span>
            </div>
            <select
              value={config.numStages}
              onChange={(e) => update({ numStages: parseInt(e.target.value) })}
              className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono text-xs text-slate-200 focus:border-violet-500"
            >
              <option value={1}>1 (Single buffer)</option>
              <option value={2}>2 (Double buffer - Opt)</option>
              <option value={3}>3 (Triple buffer)</option>
            </select>
          </div>
        </div>

        {/* Local Data Share (LDS) Meter */}
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-2.5 space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400">LDS Memory Allocation:</span>
            <span
              className={`font-mono font-semibold ${
                isLdsOverLimit ? 'text-rose-400' : 'text-violet-300'
              }`}
            >
              {ldsKB} KB / {ldsCapacityKB} KB
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                isLdsOverLimit ? 'bg-rose-500' : ldsPercent > 80 ? 'bg-amber-400' : 'bg-violet-400'
              }`}
              style={{ width: `${Math.min(100, ldsPercent)}%` }}
            />
          </div>
          {isLdsOverLimit && (
            <p className="text-[10px] text-rose-400 font-medium">
              ⚠️ Warning: Exceeds AMD 64KB CU LDS boundary. Spilling will occur!
            </p>
          )}
        </div>

        {/* Copilot Tune Action */}
        <button
          onClick={() =>
            onAskCopilot(
              `Analyze Triton kernel '${config.kernelType}' for AMD MI300X CDNA 3. Check tile sizes (${config.blockM}, ${config.blockN}, ${config.blockK}) and warps (${config.numWarps}) for LDS bank conflicts and MFMA occupancy.`
            )
          }
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-950/40 py-2 text-xs font-medium text-violet-200 transition hover:bg-violet-900/60 hover:text-white"
        >
          <Sparkles className="h-3.5 w-3.5 text-violet-400" />
          <span>Tune with Mandala Copilot</span>
        </button>
      </div>

      {/* Output Port to Execution Node */}
      <Handle
        type="source"
        position={Position.Right}
        id="kernel-out"
        className="!w-3 !h-3 !bg-violet-400 !border-slate-900"
      />
    </div>
  );
};

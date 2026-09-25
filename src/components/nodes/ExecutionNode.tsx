import React from 'react';
import {Handle, Position} from 'reactflow';
import {Play, PlayCircle, Loader2, Gauge, Server, Activity } from 'lucide-react';
import { ExecutionConfig, TArgetArch } from '../types';

interface ExecutionNodeProps {
    data: {
        config: ExecutionConfig;
        onChange: (config: ExecutionConfig) => void;
        onRun: () => void;
        isRunning: boolean;
    };
}

export const ExecutionNode: React.FC<ExecutionNodeProps> = ({ data }) => {
  const { config, onChange, onRun, isRunning } = data;

  const update = (updates: Partial<ExecutionConfig>) => {
    onChange({ ...config, ...updates });
  };

  const getArchDetails = (arch: TargetArch) => {
    switch (arch) {
      case 'gfx942':
        return { name: 'AMD Instinct MI300X (gfx942)', peak: '1,300 TFLOPS BF16', mem: '192GB HBM3 (5.3 TB/s)' };
      case 'gfx90a':
        return { name: 'AMD Instinct MI250X (gfx90a)', peak: '383 TFLOPS BF16', mem: '128GB HBM2e (3.2 TB/s)' };
      case 'gfx1100':
        return { name: 'AMD Radeon RX 7900 XTX (gfx1100)', peak: '123 TFLOPS FP16', mem: '24GB GDDR6 (960 GB/s)' };
    }
  };

  const archInfo = getArchDetails(config.targetArch);

  return (
    <div className="w-84 rounded-xl border border-amber-500/30 bg-slate-900/95 text-slate-100 shadow-2xl backdrop-blur-md transition-all hover:border-amber-400/60">
      {/* Input Port from Triton Kernel */}
      <Handle
        type="target"
        position={Position.Left}
        id="exec-in"
        className="!w-3 !h-3 !bg-violet-400 !border-slate-900"
      />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/80 px-4 py-3 rounded-t-xl">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-amber-500/20 p-1.5 text-amber-400">
            <Server className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-amber-100">PyTorch ROCm Execution</h3>
            <p className="text-[11px] text-slate-400 font-mono">HIP / Triton Runtime</p>
          </div>
        </div>
        <span className="flex items-center gap-1 rounded bg-emerald-950 px-2 py-0.5 text-[10px] font-mono text-emerald-300 border border-emerald-800/60">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          KFD Online
        </span>
      </div>

      <div className="p-4 space-y-4 text-xs">
        {/* Target Accelerator */}
        <div>
          <label className="text-[10px] text-slate-400">Target Accelerator (ROCm Device)</label>
          <select
            value={config.targetArch}
            onChange={(e) => {
              const arch = e.target.value as TargetArch;
              update({
                targetArch: arch,
                deviceName: getArchDetails(arch).name,
              });
            }}
            className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 font-mono text-xs text-amber-200 focus:border-amber-500 focus:outline-none"
          >
            <option value="gfx942">AMD Instinct MI300X (gfx942 CDNA 3)</option>
            <option value="gfx90a">AMD Instinct MI250X (gfx90a CDNA 2)</option>
            <option value="gfx1100">AMD Radeon RX 7900 XTX (gfx1100 RDNA 3)</option>
          </select>
        </div>

        {/* Device Spec Badge */}
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5 space-y-1 font-mono text-[11px]">
          <div className="flex justify-between text-slate-400">
            <span>Peak Compute:</span>
            <span className="text-amber-300 font-semibold">{archInfo.peak}</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Memory Architecture:</span>
            <span className="text-sky-300">{archInfo.mem}</span>
          </div>
        </div>

        {/* Benchmark Iterations */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-slate-400">Warmup Cycles</label>
            <input
              type="number"
              value={config.warmupIterations}
              onChange={(e) => update({ warmupIterations: parseInt(e.target.value) || 5 })}
              className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-xs text-slate-200 focus:border-amber-500"
            />
          </div>

          <div>
            <label className="text-[10px] text-slate-400">Benchmark Cycles</label>
            <input
              type="number"
              value={config.benchmarkIterations}
              onChange={(e) => update({ benchmarkIterations: parseInt(e.target.value) || 20 })}
              className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-xs text-slate-200 focus:border-amber-500"
            />
          </div>
        </div>

        {/* Profiler Mode */}
        <div>
          <label className="text-[10px] text-slate-400">Profiler Mode</label>
          <select
            value={config.profilerMode}
            onChange={(e) => update({ profilerMode: e.target.value as any })}
            className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200 focus:border-amber-500"
          >
            <option value="rocprof">rocprof (ROCm Hardware Counters & Waves)</option>
            <option value="memory">LDS & HBM3 Bandwidth Profiler</option>
            <option value="isa">GCN / CDNA Disassembly Extraction</option>
            <option value="none">Standard PyTorch Timing (torch.cuda.Event)</option>
          </select>
        </div>

        {/* Run CTA Button */}
        <button
          onClick={onRun}
          disabled={isRunning}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 px-4 py-2.5 text-xs font-semibold text-slate-950 shadow-lg shadow-amber-500/20 transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isRunning ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-slate-950" />
              <span>Compiling & Benchmarking...</span>
            </>
          ) : (
            <>
              <Play className="h-4 w-4 fill-slate-950" />
              <span>Compile & Run on ROCm</span>
            </>
          )}
        </button>
      </div>

      {/* Output Port to Output Evaluation */}
      <Handle
        type="source"
        position={Position.Right}
        id="exec-out"
        className="!w-3 !h-3 !bg-amber-400 !border-slate-900"
      />
    </div>
  );
};

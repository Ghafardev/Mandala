import React, { useState } from 'react';
import { Handle, Position } from 'reactflow';
import { CheckCircle2, AlertTriangle, Activity, Terminal, Binary, BarChart3, Copy, Check } from 'lucide-react';
import { CompileResult } from '../../types';

interface OutputNodeProps {
  data: {
    result: CompileResult | null;
    isLoading: boolean;
  };
}

export const OutputNode: React.FC<OutputNodeProps> = ({ data }) => {
  const { result, isLoading } = data;
  const [activeTab, setActiveTab] = useState<'metrics' | 'isa' | 'logs'>('metrics');
  const [copied, setCopied] = useState(false);

  const handleCopyIsa = () => {
    if (result?.isa_disassembly) {
      navigator.clipboard.writeText(result.isa_disassembly);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="w-96 rounded-xl border border-emerald-500/30 bg-slate-900/95 text-slate-100 shadow-2xl backdrop-blur-md transition-all hover:border-emerald-400/60">
      {/* Input Port from Execution Node */}
      <Handle
        type="target"
        position={Position.Left}
        id="output-in"
        className="!w-3 !h-3 !bg-amber-400 !border-slate-900"
      />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/80 px-4 py-3 rounded-t-xl">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-emerald-500/20 p-1.5 text-emerald-400">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-emerald-100">Output & Evaluation</h3>
            <p className="text-[11px] text-slate-400 font-mono">Reference Verification & ISA</p>
          </div>
        </div>

        {result && (
          <span
            className={`flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-mono border ${
              result.status === 'SUCCESS'
                ? 'bg-emerald-950 text-emerald-300 border-emerald-800/60'
                : 'bg-amber-950 text-amber-300 border-amber-800/60'
            }`}
          >
            {result.status === 'SUCCESS' ? (
              <>
                <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                VERIFIED MATCH
              </>
            ) : (
              <>
                <AlertTriangle className="h-3 w-3 text-amber-400" />
                TOLERANCE DRIFT
              </>
            )}
          </span>
        )}
      </div>

      <div className="p-4 space-y-3.5 text-xs">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-10 space-y-3">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
            <p className="font-mono text-slate-400 text-[11px]">Compiling HSA Code Object & Benchmarking...</p>
          </div>
        ) : !result ? (
          <div className="rounded-lg border border-dashed border-slate-800 bg-slate-950/40 p-8 text-center text-slate-400">
            <p className="text-xs">Click "Compile & Run on ROCm" to profile kernel latency and generate AMD ISA disassembly.</p>
          </div>
        ) : (
          <>
            {/* Tab Navigation */}
            <div className="flex rounded-lg bg-slate-950 p-1 border border-slate-800">
              <button
                onClick={() => setActiveTab('metrics')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1 text-[11px] rounded transition ${
                  activeTab === 'metrics'
                    ? 'bg-slate-800 text-emerald-300 font-semibold shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <BarChart3 className="h-3 w-3" />
                <span>Metrics</span>
              </button>
              <button
                onClick={() => setActiveTab('isa')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1 text-[11px] rounded transition ${
                  activeTab === 'isa'
                    ? 'bg-slate-800 text-sky-300 font-semibold shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Binary className="h-3 w-3" />
                <span>CDNA ISA</span>
              </button>
              <button
                onClick={() => setActiveTab('logs')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1 text-[11px] rounded transition ${
                  activeTab === 'logs'
                    ? 'bg-slate-800 text-amber-300 font-semibold shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Terminal className="h-3 w-3" />
                <span>ROCm Logs</span>
              </button>
            </div>

            {/* Tab 1: Metrics */}
            {activeTab === 'metrics' && (
              <div className="space-y-3">
                {/* 2x2 Performance Grid */}
                <div className="grid grid-cols-2 gap-2 font-mono">
                  <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Kernel Latency</span>
                    <span className="text-base font-bold text-emerald-300">{result.metrics.latency_us} μs</span>
                    <span className="text-[10px] text-slate-500 block">({result.metrics.latency_ms} ms)</span>
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Achieved Compute</span>
                    <span className="text-base font-bold text-sky-300">{result.metrics.achieved_tflops} TFLOPS</span>
                    <span className="text-[10px] text-sky-500 block">{result.metrics.tflops_efficiency_percent}% of peak</span>
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Memory Bandwidth</span>
                    <span className="text-base font-bold text-indigo-300">{result.metrics.achieved_bandwidth_gbs} GB/s</span>
                    <span className="text-[10px] text-indigo-500 block">HBM3 bus throughput</span>
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Arithmetic Intensity</span>
                    <span className="text-base font-bold text-amber-300">
                      {result.metrics.arithmetic_intensity_flops_per_byte}
                    </span>
                    <span className="text-[10px] text-amber-500 block">FLOPs / Byte</span>
                  </div>
                </div>

                {/* Numerical Verification Block */}
                <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Reference:</span>
                    <span className="font-mono text-slate-200">{result.verification.verified_against}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Max Absolute Error:</span>
                    <span className="font-mono text-emerald-400 font-semibold">
                      {result.verification.max_absolute_error.toExponential(3)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">ROCm Grid Layout:</span>
                    <span className="font-mono text-slate-300">
                      [{result.grid.join(', ')}] ({result.total_thread_blocks} blocks)
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: AMD CDNA ISA Disassembly */}
            {activeTab === 'isa' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>AMD CDNA 3 Disassembly (Wave64):</span>
                  <button
                    onClick={handleCopyIsa}
                    className="flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300 hover:bg-slate-700 transition"
                  >
                    {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 p-2.5 font-mono text-[10px] text-sky-200 leading-relaxed">
                  <pre className="whitespace-pre-wrap">{result.isa_disassembly}</pre>
                </div>
              </div>
            )}

            {/* Tab 3: Compiler Logs */}
            {activeTab === 'logs' && (
              <div className="space-y-2">
                <span className="text-[11px] text-slate-400 block">Triton-ROCm Pipeline Log:</span>
                <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 p-2.5 font-mono text-[10px] space-y-1">
                  {result.compiler_log.map((line, i) => (
                    <div key={i} className="text-slate-300 border-b border-slate-900/60 pb-1">
                      <span className="text-amber-400 mr-1.5">›</span>
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

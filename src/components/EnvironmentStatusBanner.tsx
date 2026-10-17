import React from 'react';
import { AlertTriangle, Cpu, HardDrive, ShieldCheck, Sparkles } from 'lucide-react';
import type { RuntimeCapabilityState } from '../lib/api';

interface GpuTelemetrySample {
  name?: string;
  vram_used_gb?: number;
  vram_total_gb?: number;
  vram_percent?: number;
}

interface EnvironmentStatusBannerProps {
  runtimeCapability: RuntimeCapabilityState | null;
  telemetry?: {
    driver?: string;
    gpus?: GpuTelemetrySample[];
  } | null;
}

export const EnvironmentStatusBanner: React.FC<EnvironmentStatusBannerProps> = ({
  runtimeCapability,
  telemetry,
}) => {
  const backend = runtimeCapability?.backend ?? 'cpu';
  const status = runtimeCapability?.status ?? 'unavailable';
  const primaryGpu = telemetry?.gpus?.[0];
  const deviceName = runtimeCapability?.device_name ?? primaryGpu?.name ?? 'No GPU detected';
  const vramUsed = Number(primaryGpu?.vram_used_gb ?? 0);
  const vramTotal = Number(primaryGpu?.vram_total_gb ?? 0);
  const vramPercent = Number(primaryGpu?.vram_percent ?? 0);

  const isRocm = backend === 'rocm' && status === 'available';
  const isCuda = backend === 'cuda' && status === 'available';
  const isCpuOnly = !isRocm && !isCuda;

  return (
    <div className="border-b border-zinc-800 bg-zinc-950/80 px-4 py-3 backdrop-blur-sm">
      <div
        className={`flex flex-col gap-3 rounded-xl border px-4 py-3 shadow-inner md:flex-row md:items-center md:justify-between ${
          isRocm
            ? 'border-emerald-500/30 bg-emerald-950/20'
            : isCuda
              ? 'border-cyan-500/30 bg-cyan-950/20'
              : 'border-amber-500/30 bg-amber-950/20'
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-lg border ${
              isRocm
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : isCuda
                  ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
            }`}
          >
            {isCpuOnly ? <Cpu className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${
                  isRocm
                    ? 'border-emerald-500/40 bg-emerald-900/40 text-emerald-300'
                    : isCuda
                      ? 'border-cyan-500/40 bg-cyan-900/40 text-cyan-300'
                      : 'border-amber-500/40 bg-amber-900/40 text-amber-300'
                }`}
              >
                {isRocm
                  ? 'AMD ROCm Active'
                  : isCuda
                    ? 'CUDA Environment Active'
                    : 'CPU-Only Mode (No GPU Detected)'}
              </span>

              <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-400">
                {runtimeCapability?.execution_environment ?? 'environment: unknown'}
              </span>
            </div>

            <p className="mt-1 text-sm font-medium text-zinc-100">
              {isRocm || isCuda ? deviceName : 'GPU execution is in a Fallback/Disabled state.'}
            </p>
          </div>
        </div>

        <div className="flex flex-col items-start gap-2 text-xs text-zinc-300 md:items-end">
          {isCpuOnly ? (
            <div className="flex items-center gap-2 text-amber-200">
              <AlertTriangle className="h-4 w-4" />
              <span>Fallback/Disabled: GPU execution is unavailable on this host.</span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-zinc-200">
                <HardDrive className="h-4 w-4 text-emerald-300" />
                <span>
                  VRAM: {vramUsed.toFixed(1)} / {vramTotal > 0 ? `${vramTotal.toFixed(1)} GB` : 'N/A'}
                  {vramTotal > 0 ? ` (${vramPercent.toFixed(1)}%)` : ''}
                </span>
              </div>
              <div className="flex items-center gap-2 text-zinc-300">
                <ShieldCheck className="h-4 w-4 text-cyan-300" />
                <span>
                  {runtimeCapability?.diagnostic || 'Backend capability verified and ready for execution.'}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

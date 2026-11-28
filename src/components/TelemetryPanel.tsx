import React, { useEffect, useState, useRef } from 'react';
import {
  Activity,
  HardDrive,
  Flame,
  Zap,
  Terminal,
  Trash2,
  ChevronDown,
  ChevronUp,
  Cpu,
  AlertTriangle,
} from 'lucide-react';
import type { CpuTelemetry, GpuTelemetry, TelemetryPayload } from '../types';

export type TelemetryConnectionStatus = 'connected' | 'connecting' | 'disconnected';

export interface TelemetryPanelProps {
  logs?: string[];
  onClearLogs?: () => void;
  className?: string;
  /** Frame broadcast by the single telemetry subscription owned by App.tsx. */
  telemetry?: TelemetryPayload | null;
  connectionStatus?: TelemetryConnectionStatus;
  connectedUrl?: string;
}

const UNKNOWN = '—';
const NOT_REPORTED = 'not reported';

/** A reading is only usable when it is an actual finite number. */
const numberOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/**
 * The backend sends 0.0 for sensors it does not read. A live GPU cannot report
 * 0 °C, 0 W or a fan at 0 rpm, so those zeros mean "not reported".
 */
const positiveOrNull = (value: unknown): number | null => {
  const reading = numberOrNull(value);
  return reading !== null && reading > 0 ? reading : null;
};

const formatNumber = (value: number | null, digits = 1): string =>
  value === null ? UNKNOWN : value.toFixed(digits);

const vramLabel = (
  used: number | null,
  total: number | null,
  percent: number | null
): string => {
  if (used === null && total === null) return NOT_REPORTED;
  const amounts = `${formatNumber(used)} / ${formatNumber(total)} GB`;
  return percent === null ? amounts : `${amounts} (${percent.toFixed(1)}%)`;
};

const getTempColor = (c: number | null) => {
  if (c === null) return { text: 'text-zinc-400', bar: 'bg-zinc-700' };
  if (c < 70)
    return { text: 'text-[#FB8500]', bar: 'bg-gradient-to-r from-[#FB8500] to-[#FF8C00]' };
  if (c < 85)
    return { text: 'text-orange-400', bar: 'bg-gradient-to-r from-[#FF8C00] to-orange-500' };
  return { text: 'text-[#E63946]', bar: 'bg-gradient-to-r from-[#FB8500] to-[#E63946]' };
};

// Per-core color ramp for the CPU core grid (gold -> orange -> red)
const getCoreColor = (value: number) => {
  if (value >= 85) return 'bg-[#E63946]';
  if (value >= 50) return 'bg-[#FB8500]';
  if (value >= 15) return 'bg-[#FFD700]';
  return 'bg-zinc-700';
};

export const TelemetryPanel: React.FC<TelemetryPanelProps> = ({
  logs = [],
  onClearLogs,
  className = '',
  telemetry = null,
  connectionStatus = 'disconnected',
  connectedUrl = '',
}) => {
  const [isAutoScroll, setIsAutoScroll] = useState<boolean>(true);
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const gpu: GpuTelemetry | null = telemetry?.gpus?.[0] ?? null;
  const gpuAvailable = gpu !== null;
  const gpuBackendReported =
    telemetry?.backend === 'rocm' || telemetry?.backend === 'cuda';

  const vramUsed = numberOrNull(gpu?.vram_used_gb);
  const vramTotal = numberOrNull(gpu?.vram_total_gb);
  const vramPercent = numberOrNull(gpu?.vram_percent);
  const gpuUtil = numberOrNull(gpu?.gpu_utilization);
  const tempEdge = positiveOrNull(gpu?.temp_edge_c);
  const tempJunction = positiveOrNull(gpu?.temp_junction_c);
  const powerWatts = positiveOrNull(gpu?.power_watts);
  const powerCapWatts = positiveOrNull(gpu?.power_cap_watts);

  const cpu: CpuTelemetry | undefined = telemetry?.cpu;

  // Auto-scroll terminal log viewer
  useEffect(() => {
    if (isAutoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, isAutoScroll]);

  const tempColor = getTempColor(tempEdge);
  const cpuSpecs = cpu?.specs;
  const perCore = cpu?.status?.per_core_utilization ?? [];
  const cpuOverall = cpu?.status?.overall_utilization ?? 0;
  const loadAverage = cpu?.status?.load_average;
  const maxCore = perCore.length > 0 ? Math.max(...perCore) : 0;

  const liveHost = connectedUrl.replace(/^wss?:\/\//, '').split('/')[0];

  // Bottleneck detection comparing CPU pressure against GPU demand
  const bottleneck = !gpuAvailable || gpuUtil === null
    ? null
    : cpuOverall >= 85 && gpuUtil < 40
      ? 'CPU Bottleneck Detected: data loading is slowing down training.'
      : maxCore >= 85 && cpuOverall < 50
        ? 'Single-core bottleneck: one thread is saturated while the rest idle.'
        : null;

  return (
    <div
      className={`flex flex-col border-t border-zinc-800/80 bg-[#0B0C10]/95 backdrop-blur-md transition-all ${
        isExpanded ? 'h-72' : 'h-11'
      } ${className}`}
    >
      {/* Panel Top Header Bar */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-zinc-800/80 bg-[#0E1017]/90 px-4 select-none">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-[#FFD700]" />
            <span className="text-xs font-bold tracking-wider text-[#FFD700] uppercase">
              HARDWARE TELEMETRY & LOGS
            </span>
          </div>

          {/* WebSocket Status Indicator */}
          <div className="flex items-center gap-1.5 rounded-full bg-[#0B0C10] border border-zinc-800/80 px-2 py-0.5 text-[10px] font-mono">
            {connectionStatus === 'connected' ? (
              <>
                <span className="h-2 w-2 rounded-full bg-[#FFD700] shadow-sm shadow-[#FFD700]/50 animate-pulse"></span>
                <span className="text-[#FFD700] font-medium" title={connectedUrl}>
                  {liveHost ? `${liveHost} [LIVE]` : 'telemetry [LIVE]'}
                </span>
              </>
            ) : connectionStatus === 'connecting' ? (
              <>
                <span className="h-2 w-2 rounded-full bg-[#FB8500] animate-ping"></span>
                <span className="text-[#FB8500]">Connecting WS...</span>
              </>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-[#E63946]"></span>
                <span className="text-zinc-500">Offline</span>
              </>
            )}
          </div>

          <span className="hidden md:inline text-[11px] font-mono text-zinc-400">
            {gpuAvailable ? gpu?.name || 'GPU (name not reported)' : 'CPU-only host'}
          </span>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2">
          {onClearLogs && (
            <button
              onClick={onClearLogs}
              title="Clear terminal logs"
              className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-mono text-zinc-400 hover:bg-zinc-800 hover:text-amber-300 transition"
            >
              <Trash2 className="h-3 w-3" />
              <span className="hidden sm:inline">Clear</span>
            </button>
          )}

          <button
            onClick={() => setIsAutoScroll(!isAutoScroll)}
            className={`rounded px-2 py-1 text-[10px] font-mono border transition ${
              isAutoScroll
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                : 'bg-zinc-950 border-zinc-800 text-zinc-400'
            }`}
          >
            AutoScroll: {isAutoScroll ? 'ON' : 'OFF'}
          </button>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-amber-300 transition"
            title={isExpanded ? 'Collapse panel' : 'Expand panel'}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="flex flex-1 flex-col md:flex-row overflow-hidden">
          {/* Left: 3 Visual Progress Bars (VRAM Usage, GPU Temperature, Compute Utilization) */}
          <div className="w-full md:w-96 shrink-0 border-b md:border-b-0 md:border-r border-zinc-800/80 hover:border-[#FB8500]/30 p-4 space-y-4 bg-[#0E1017]/70 backdrop-blur-sm overflow-y-auto transition-colors">
            {/* CPU status (always available, even on CPU-only devices) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-zinc-300 font-medium">
                  <Cpu className="h-3.5 w-3.5 text-[#FFD700]" />
                  CPU Utilization
                </span>
                <span className="font-mono text-[11px] text-[#FFD700] font-semibold">
                  {cpuOverall.toFixed(1)}%
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-900 border border-zinc-800 hover:border-[#FB8500]/40 transition-colors">
                <div
                  className="h-full bg-gradient-to-r from-[#FFB703] to-[#FFD700] transition-all duration-300 ease-out shadow-sm shadow-amber-500/20"
                  style={{ width: `${Math.min(100, cpuOverall)}%` }}
                />
              </div>

              {/* Core grid: one square per logical thread */}
              <div className="grid grid-cols-8 gap-1 pt-0.5">
                {perCore.map((value, index) => (
                  <div
                    key={index}
                    title={`Core ${index}: ${value.toFixed(0)}%`}
                    className={`h-3 rounded-sm ${getCoreColor(value)} transition-colors`}
                  />
                ))}
              </div>

              <div className="flex items-center justify-between gap-2 font-mono text-[10px] text-zinc-400">
                <span className="truncate" title={cpuSpecs?.cpu_model ?? ''}>
                  {cpuSpecs?.cpu_model || 'Waiting for CPU telemetry'}
                </span>
                <span className="shrink-0">
                  {cpuSpecs?.physical_cores ?? 0}c / {cpuSpecs?.total_cores ?? 0}t
                </span>
              </div>
              <div className="flex items-center justify-between font-mono text-[10px] text-zinc-500">
                <span>
                  {Array.isArray(loadAverage) ? `Load ${loadAverage[0]}` : 'Load N/A'}
                </span>
                <span>
                  {typeof cpuSpecs?.frequency_mhz === 'number'
                    ? `${(cpuSpecs.frequency_mhz / 1000).toFixed(2)} GHz`
                    : 'Clock N/A'}
                </span>
              </div>
            </div>

            {bottleneck && (
              <div className="flex items-start gap-1.5 rounded border border-[#E63946]/40 bg-[#E63946]/10 px-2 py-1.5 text-[10px] font-mono leading-relaxed text-[#E63946]">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>{bottleneck}</span>
              </div>
            )}

            {gpuAvailable ? (
              <>
            {/* Metric 1: VRAM Usage (Primary Accent - Solar Gold #FFD700 / #FFB703) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-zinc-300 font-medium">
                  <HardDrive className="h-3.5 w-3.5 text-[#FFD700]" />
                  VRAM Usage
                </span>
                <span className="font-mono text-[11px] text-[#FFD700] font-semibold">
                  {vramLabel(vramUsed, vramTotal, vramPercent)}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-900 border border-zinc-800 hover:border-[#FB8500]/40 transition-colors">
                <div
                  className="h-full bg-gradient-to-r from-[#FFB703] to-[#FFD700] transition-all duration-300 ease-out shadow-sm shadow-amber-500/20"
                  style={{ width: `${Math.min(100, vramPercent ?? 0)}%` }}
                />
              </div>
            </div>

            {/* Metric 2: GPU Temperature (Secondary Accent - Energetic Orange #FB8500 / #FF8C00) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-zinc-300 font-medium">
                  <Flame className={`h-3.5 w-3.5 ${tempColor.text}`} />
                  GPU Temperature
                </span>
                <span
                  className={`font-mono text-[11px] font-semibold ${tempColor.text}`}
                  title={tempEdge === null ? 'Not reported by this backend' : undefined}
                >
                  {tempEdge === null ? UNKNOWN : `${tempEdge.toFixed(1)}°C`}{' '}
                  <span className="text-[10px] text-zinc-400">
                    (Jct: {tempJunction === null ? UNKNOWN : `${tempJunction.toFixed(1)}°C`})
                  </span>
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-900 border border-zinc-800 hover:border-[#FB8500]/40 transition-colors">
                <div
                  className={`h-full ${tempColor.bar} transition-all duration-300 ease-out shadow-sm shadow-orange-500/20`}
                  style={{
                    width: `${Math.min(100, ((tempEdge ?? 0) / 105) * 100)}%`,
                  }}
                />
              </div>
            </div>

            {/* Metric 3: Compute Utilization (Tertiary Accent - Crimson Red #E63946) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-zinc-300 font-medium">
                  <Activity className="h-3.5 w-3.5 text-[#E63946]" />
                  Compute Utilization
                </span>
                <div className="flex items-center gap-1.5">
                  {gpuUtil !== null && gpuUtil >= 75 && (
                    <span className="rounded bg-[#E63946]/20 border border-[#E63946]/50 px-1 py-0.2 text-[9px] font-mono font-bold text-[#E63946] animate-pulse">
                      HIGH LOAD
                    </span>
                  )}
                  <span
                    className="font-mono text-[11px] text-[#E63946] font-semibold"
                    title={gpuUtil === null ? 'Not reported by this backend' : undefined}
                  >
                    {gpuUtil === null ? UNKNOWN : `${gpuUtil.toFixed(1)}%`}
                  </span>
                </div>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-900 border border-zinc-800 hover:border-[#E63946]/40 transition-colors">
                <div
                  className="h-full bg-gradient-to-r from-[#FB8500] via-[#FF5400] to-[#E63946] transition-all duration-300 ease-out shadow-sm shadow-rose-500/20"
                  style={{ width: `${Math.min(100, gpuUtil ?? 0)}%` }}
                />
              </div>
            </div>

            {/* Power metric footer */}
            <div className="pt-1 flex items-center justify-between font-mono text-[10px] text-zinc-400 border-t border-zinc-800/80">
              <span className="flex items-center gap-1">
                <Zap className="h-3 w-3 text-[#FFD700]" />
                Package Power:
              </span>
              <span
                className="text-[#FFB703] font-medium"
                title={
                  powerWatts === null || powerCapWatts === null
                    ? 'Not reported by this backend'
                    : undefined
                }
              >
                {powerWatts === null ? UNKNOWN : `${powerWatts.toFixed(0)}W`} /{' '}
                {powerCapWatts === null ? UNKNOWN : `${powerCapWatts.toFixed(0)}W`}
              </span>
            </div>
              </>
            ) : (
              <div className="rounded border border-zinc-800 bg-zinc-900/60 px-2.5 py-2 text-[10px] font-mono leading-relaxed text-zinc-400">
                {gpuBackendReported
                  ? `GPU backend reported (${telemetry?.backend}) but no device readings arrived — showing CPU telemetry only.`
                  : 'No GPU backend detected — live CPU telemetry only.'}
              </div>
            )}
          </div>

          {/* Right: Real-Time Terminal Log Viewer */}
          <div className="flex-1 flex flex-col bg-[#0B0C10] p-3 overflow-hidden font-mono text-xs">
            <div className="flex items-center justify-between pb-1.5 border-b border-zinc-800/80 text-[10px] text-zinc-400">
              <span className="flex items-center gap-1">
                <Terminal className="h-3 w-3 text-[#FFB703]" />
                ROCm / Triton Runtime Log Stream
              </span>
              <span className="text-[#FFD700] font-medium">{logs.length} entries</span>
            </div>

            <div
              ref={logContainerRef}
              className="flex-1 overflow-y-auto pt-2 space-y-1 select-text scrollbar-thin scrollbar-thumb-zinc-800"
            >
              {logs.length === 0 ? (
                <div className="py-8 text-center text-zinc-400 font-mono text-xs">
                  Awaiting kernel dispatch... no device claim until telemetry arrives.
                </div>
              ) : (
                logs.map((log, idx) => {
                  let color = 'text-zinc-300';
                  if (log.includes('[ERROR]')) color = 'text-[#E63946] font-semibold';
                  else if (log.includes('[DISPATCH]')) color = 'text-[#FFD700]';
                  else if (log.includes('[METRICS]')) color = 'text-[#FB8500]';
                  else if (log.includes('[ROCm-HSA]')) color = 'text-amber-200';
                  else if (log.includes('[DEVICE]')) color = 'text-[#FFB703]';

                  return (
                    <div key={idx} className={`leading-relaxed ${color}`}>
                      {log}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

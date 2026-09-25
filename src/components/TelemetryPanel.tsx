import React, { useEffect, useState, useRef } from 'react';
import {
  Activity,
  HardDrive,
  Flame,
  Zap,
  Terminal,
  Wifi,
  WifiOff,
  Trash2,
  Copy,
  ChevronDown,
  ChevronUp,
  Maximize2,
} from 'lucide-react';
import { createTelemetryWebSocket } from '../lib/api';

export interface TelemetryPanelProps {
  logs?: string[];
  onClearLogs?: () => void;
  className?: string;
}

export const TelemetryPanel: React.FC<TelemetryPanelProps> = ({
  logs = [],
  onClearLogs,
  className = '',
}) => {
  const [telemetry, setTelemetry] = useState<any>({
    gpu_utilization: 42.5,
    vram_used_gb: 72.4,
    vram_total_gb: 192.0,
    vram_percent: 37.7,
    temp_edge_c: 54.2,
    temp_junction_c: 67.8,
    power_watts: 320.0,
    power_cap_watts: 750.0,
    driver: 'ROCm 6.2.1 (AMD CDNA 3 / KFD)',
    name: 'AMD Instinct MI300X OAM',
  });

  const [connectionStatus, setConnectionStatus] = useState<
    'connected' | 'connecting' | 'disconnected'
  >('connecting');
  const [connectedUrl, setConnectedUrl] = useState<string>(
    'ws://localhost:8000/ws/gpu-telemetry'
  );
  const [isAutoScroll, setIsAutoScroll] = useState<boolean>(true);
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Connect to ws://localhost:8000/ws/gpu-telemetry
  useEffect(() => {
    const cleanup = createTelemetryWebSocket(
      (data) => {
        if (data?.gpus && data.gpus.length > 0) {
          const primaryGpu = data.gpus[0];
          setTelemetry({
            gpu_utilization: primaryGpu.gpu_utilization ?? 0,
            vram_used_gb: primaryGpu.vram_used_gb ?? 0,
            vram_total_gb: primaryGpu.vram_total_gb ?? 192.0,
            vram_percent: primaryGpu.vram_percent ?? 0,
            temp_edge_c: primaryGpu.temp_edge_c ?? 45,
            temp_junction_c: primaryGpu.temp_junction_c ?? 58,
            power_watts: primaryGpu.power_watts ?? 250,
            power_cap_watts: primaryGpu.power_cap_watts ?? 750,
            driver: data.driver || 'ROCm 6.2.1',
            name: primaryGpu.name || 'AMD Instinct MI300X',
          });
        }
      },
      (status, url) => {
        setConnectionStatus(status);
        setConnectedUrl(url);
      }
    );

    return cleanup;
  }, []);

  // Auto-scroll terminal log viewer
  useEffect(() => {
    if (isAutoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, isAutoScroll]);

  // Temperature color ramp helper (Mandala Energetic Orange & Crimson Red palette)
  const getTempColor = (c: number) => {
    if (c < 70) return { text: 'text-[#FB8500]', bar: 'bg-gradient-to-r from-[#FB8500] to-[#FF8C00]' };
    if (c < 85) return { text: 'text-orange-400', bar: 'bg-gradient-to-r from-[#FF8C00] to-orange-500' };
    return { text: 'text-[#E63946]', bar: 'bg-gradient-to-r from-[#FB8500] to-[#E63946]' };
  };

  const tempColor = getTempColor(telemetry.temp_edge_c);

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
              GPU TELEMETRY & LOGS
            </span>
          </div>

          {/* WebSocket Status Indicator */}
          <div className="flex items-center gap-1.5 rounded-full bg-[#0B0C10] border border-zinc-800/80 px-2 py-0.5 text-[10px] font-mono">
            {connectionStatus === 'connected' ? (
              <>
                <span className="h-2 w-2 rounded-full bg-[#FFD700] shadow-sm shadow-[#FFD700]/50 animate-pulse"></span>
                <span className="text-[#FFD700] font-medium">ws://localhost:8000 [LIVE]</span>
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
            {telemetry.name}
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
          <div className="w-full md:w-80 shrink-0 border-b md:border-b-0 md:border-r border-zinc-800/80 hover:border-[#FB8500]/30 p-4 space-y-4 bg-[#0E1017]/70 backdrop-blur-sm overflow-y-auto transition-colors">
            {/* Metric 1: VRAM Usage (Primary Accent - Solar Gold #FFD700 / #FFB703) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-zinc-300 font-medium">
                  <HardDrive className="h-3.5 w-3.5 text-[#FFD700]" />
                  VRAM Usage
                </span>
                <span className="font-mono text-[11px] text-[#FFD700] font-semibold">
                  {telemetry.vram_used_gb.toFixed(1)} / {telemetry.vram_total_gb} GB ({telemetry.vram_percent.toFixed(1)}%)
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-900 border border-zinc-800 hover:border-[#FB8500]/40 transition-colors">
                <div
                  className="h-full bg-gradient-to-r from-[#FFB703] to-[#FFD700] transition-all duration-300 ease-out shadow-sm shadow-amber-500/20"
                  style={{ width: `${Math.min(100, telemetry.vram_percent)}%` }}
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
                <span className={`font-mono text-[11px] font-semibold ${tempColor.text}`}>
                  {telemetry.temp_edge_c.toFixed(1)}°C{' '}
                  <span className="text-[10px] text-zinc-400">
                    (Jct: {telemetry.temp_junction_c.toFixed(1)}°C)
                  </span>
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-900 border border-zinc-800 hover:border-[#FB8500]/40 transition-colors">
                <div
                  className={`h-full ${tempColor.bar} transition-all duration-300 ease-out shadow-sm shadow-orange-500/20`}
                  style={{
                    width: `${Math.min(100, (telemetry.temp_edge_c / 105) * 100)}%`,
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
                  {telemetry.gpu_utilization >= 75 && (
                    <span className="rounded bg-[#E63946]/20 border border-[#E63946]/50 px-1 py-0.2 text-[9px] font-mono font-bold text-[#E63946] animate-pulse">
                      HIGH LOAD
                    </span>
                  )}
                  <span className="font-mono text-[11px] text-[#E63946] font-semibold">
                    {telemetry.gpu_utilization.toFixed(1)}%
                  </span>
                </div>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-900 border border-zinc-800 hover:border-[#E63946]/40 transition-colors">
                <div
                  className="h-full bg-gradient-to-r from-[#FB8500] via-[#FF5400] to-[#E63946] transition-all duration-300 ease-out shadow-sm shadow-rose-500/20"
                  style={{ width: `${Math.min(100, telemetry.gpu_utilization)}%` }}
                />
              </div>
            </div>

            {/* Power metric footer */}
            <div className="pt-1 flex items-center justify-between font-mono text-[10px] text-zinc-400 border-t border-zinc-800/80">
              <span className="flex items-center gap-1">
                <Zap className="h-3 w-3 text-[#FFD700]" />
                Package Power:
              </span>
              <span className="text-[#FFB703] font-medium">
                {telemetry.power_watts.toFixed(0)}W / {telemetry.power_cap_watts}W
              </span>
            </div>
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
                  Awaiting kernel dispatch... Ready on AMD CDNA 3.
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

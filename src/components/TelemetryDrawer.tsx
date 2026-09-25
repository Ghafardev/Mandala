import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  Cpu,
  Thermometer,
  Zap,
  HardDrive,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  Terminal,
  Layers,
  Flame,
  Radio,
} from 'lucide-react';
import { TelemetryPayload, GpuTelemetry } from '../types';

interface TelemetryDrawerProps {
  isOpen: boolean;
  onToggle: () => void;
}

export const TelemetryDrawer: React.FC<TelemetryDrawerProps> = ({ isOpen, onToggle }) => {
  const [telemetry, setTelemetry] = useState<TelemetryPayload | null>(null);
  const [selectedGpuIndex, setSelectedGpuIndex] = useState<number>(0);
  const [showRawJson, setShowRawJson] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let reconnectTimeout: any;

    const connectWs = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/gpu-telemetry`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setIsConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const data: TelemetryPayload = JSON.parse(event.data);
            setTelemetry(data);
          } catch (e) {
            console.error('Failed to parse telemetry message', e);
          }
        };

        ws.onclose = () => {
          setIsConnected(false);
          reconnectTimeout = setTimeout(connectWs, 2000);
        };

        ws.onerror = () => {
          setIsConnected(false);
        };
      } catch (err) {
        setIsConnected(false);
        reconnectTimeout = setTimeout(connectWs, 3000);
      }
    };

    connectWs();

    return () => {
      clearTimeout(reconnectTimeout);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const currentGpu: GpuTelemetry | undefined = telemetry?.gpus?.[selectedGpuIndex];

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800 bg-slate-950/95 backdrop-blur-xl transition-all duration-300 shadow-2xl ${
        isOpen ? 'h-72' : 'h-11'
      }`}
    >
      {/* Dock Bar / Toggle Header */}
      <div
        onClick={onToggle}
        className="flex h-11 cursor-pointer items-center justify-between px-4 hover:bg-slate-900/60 transition select-none"
      >
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2 font-semibold text-slate-200">
            <Radio
              className={`h-4 w-4 ${
                isConnected ? 'text-emerald-400 animate-pulse' : 'text-slate-500'
              }`}
            />
            <span>ROCm Hardware Telemetry</span>
            <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-400">
              rocm-smi
            </span>
          </div>

          {currentGpu && (
            <div className="hidden sm:flex items-center gap-4 text-slate-400 text-[11px] font-mono">
              <span className="flex items-center gap-1">
                <Cpu className="h-3 w-3 text-sky-400" />
                {currentGpu.name}
              </span>
              <span className="flex items-center gap-1">
                <HardDrive className="h-3 w-3 text-violet-400" />
                VRAM: {currentGpu.vram_used_gb} / {currentGpu.vram_total_gb} GB ({currentGpu.vram_percent}%)
              </span>
              <span className="flex items-center gap-1">
                <Activity className="h-3 w-3 text-emerald-400" />
                Compute: {currentGpu.gpu_utilization}%
              </span>
              <span className="flex items-center gap-1">
                <Thermometer className="h-3 w-3 text-amber-400" />
                Edge: {currentGpu.temp_edge_c}°C / Jct: {currentGpu.temp_junction_c}°C
              </span>
              <span className="flex items-center gap-1">
                <Zap className="h-3 w-3 text-orange-400" />
                {currentGpu.power_watts}W
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-mono font-medium ${
              isConnected
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                : 'bg-rose-950 text-rose-300 border border-rose-800'
            }`}
          >
            {isConnected ? 'LIVE FEED (1Hz)' : 'RECONNECTING'}
          </span>
          <button className="text-slate-400 hover:text-white">
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Expanded Content Area */}
      {isOpen && (
        <div className="h-[calc(100%-2.75rem)] p-4 overflow-y-auto">
          <div className="flex items-center justify-between mb-3 border-b border-slate-800/80 pb-2">
            {/* GPU Switcher */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400 font-medium">Active OAM Module:</span>
              {telemetry?.gpus.map((gpu, index) => (
                <button
                  key={gpu.id}
                  onClick={() => setSelectedGpuIndex(index)}
                  className={`px-2.5 py-1 rounded text-xs font-mono transition ${
                    selectedGpuIndex === index
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 font-semibold'
                      : 'bg-slate-900 text-slate-400 border border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  GPU {index} ({gpu.name.split(' ')[2] || gpu.id})
                </button>
              ))}
            </div>

            {/* Toggle Raw JSON */}
            <button
              onClick={() => setShowRawJson(!showRawJson)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono transition border ${
                showRawJson
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
              }`}
            >
              <Terminal className="h-3.5 w-3.5" />
              <span>{showRawJson ? 'Hide rocm-smi JSON' : 'Raw rocm-smi JSON'}</span>
            </button>
          </div>

          {showRawJson ? (
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-[11px] text-emerald-300 max-h-44 overflow-y-auto">
              <pre>{JSON.stringify(telemetry, null, 2)}</pre>
            </div>
          ) : currentGpu ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {/* Gauge 1: VRAM */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <HardDrive className="h-3.5 w-3.5 text-violet-400" />
                    VRAM (HBM3)
                  </span>
                  <span className="font-mono text-violet-300 font-semibold">
                    {currentGpu.vram_percent}%
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-500"
                    style={{ width: `${currentGpu.vram_percent}%` }}
                  />
                </div>
                <div className="flex justify-between font-mono text-[10px] text-slate-400">
                  <span>{currentGpu.vram_used_gb} GB used</span>
                  <span>{currentGpu.vram_total_gb} GB</span>
                </div>
              </div>

              {/* Gauge 2: GPU Compute Engine */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <Activity className="h-3.5 w-3.5 text-emerald-400" />
                    Compute Engine
                  </span>
                  <span className="font-mono text-emerald-300 font-semibold">
                    {currentGpu.gpu_utilization}%
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
                    style={{ width: `${currentGpu.gpu_utilization}%` }}
                  />
                </div>
                <div className="flex justify-between font-mono text-[10px] text-slate-400">
                  <span>304 Compute Units</span>
                  <span>19,456 SPs</span>
                </div>
              </div>

              {/* Gauge 3: Memory Bandwidth */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <Layers className="h-3.5 w-3.5 text-sky-400" />
                    Bus Bandwidth
                  </span>
                  <span className="font-mono text-sky-300 font-semibold">
                    {currentGpu.memory_bandwidth_util}%
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-400 transition-all duration-500"
                    style={{ width: `${currentGpu.memory_bandwidth_util}%` }}
                  />
                </div>
                <div className="flex justify-between font-mono text-[10px] text-slate-400">
                  <span>Peak 5.3 TB/s</span>
                  <span>HBM3 Bus</span>
                </div>
              </div>

              {/* Gauge 4: Thermals */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-1.5 font-mono">
                <div className="flex items-center gap-1 text-xs text-slate-400">
                  <Thermometer className="h-3.5 w-3.5 text-amber-400" />
                  <span>Thermals</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Edge:</span>
                  <span className="text-slate-200 font-semibold">{currentGpu.temp_edge_c}°C</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Junction (Hotspot):</span>
                  <span className="text-amber-400 font-semibold">{currentGpu.temp_junction_c}°C</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">HBM Memory:</span>
                  <span className="text-sky-300">{currentGpu.temp_hbm_c}°C</span>
                </div>
              </div>

              {/* Gauge 5: Power & TDP */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <Zap className="h-3.5 w-3.5 text-orange-400" />
                    Package Power
                  </span>
                  <span className="font-mono text-orange-300 font-semibold">
                    {currentGpu.power_watts}W
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-500 to-rose-500 transition-all duration-500"
                    style={{
                      width: `${(currentGpu.power_watts / currentGpu.power_cap_watts) * 100}%`,
                    }}
                  />
                </div>
                <div className="flex justify-between font-mono text-[10px] text-slate-400">
                  <span>TDP Limit</span>
                  <span>{currentGpu.power_cap_watts}W Max</span>
                </div>
              </div>

              {/* Gauge 6: Interconnect & PCIe */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-1.5 font-mono">
                <div className="flex items-center gap-1 text-xs text-slate-400">
                  <Flame className="h-3.5 w-3.5 text-rose-400" />
                  <span>Interconnect & Topology</span>
                </div>
                <div className="text-[10px] text-slate-300 truncate" title={currentGpu.pcie_link}>
                  {currentGpu.pcie_link}
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Infinity Fabric:</span>
                  <span className="text-emerald-400 font-semibold">
                    {currentGpu.infinity_fabric_bandwidth_gbps} GB/s
                  </span>
                </div>
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>HSA Node:</span>
                  <span>{currentGpu.hsa_node}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-6 text-center text-slate-500 text-xs font-mono">
              Waiting for rocm-smi telemetry packet...
            </div>
          )}
        </div>
      )}
    </div>
  );
};

import React from 'react';
import {
    Cpu,
    Layers,
    Sparkles,
    Terminal,
    Activity,
    HardDrive,
    Settings2,
    Play,
    RotateCcw,
} from 'lucide-react';

interface HeaderProps {
    activeView?: 'workflow' | '3d-mandala';
    onToggleView?: (view: 'workflow' | '3d-mandala') => void;
    onRunKernel?: () => void;
    isCompiling?: boolean;
    isCopilotOpen?: boolean;
    onToggleCopilot?: () => void;
    isTelemetryOpen?: boolean;
    onToggleTelemetry?: () => void;
    onResetNodes?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
    activeView = 'workflow',
    onToggleView,
    onRunKernel,
    isCompiling = false,
    isCopilotOpen = true,
    onToggleCopilot,
    isTelemetryOpen = true,
    onToggleTelemetry,
    onResetNodes,
}) => {
    return (
        <header className="flex h-14 w-full items-center justify-between border-b border-zinc-800/80 bg-zinc-950/95 px-4 backdrop-blur-md select-none z-30 font-sans">
            {/*b Left: Brand, Title, Status Indicators */}
            <div className="flex items-center gap-3.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 border border-zinc-700/60 shadow-inner">
                   <Cpu className="h-4 w-4 text-emerald-400" />
                </div>

                <div className="flex items-center gap-3">
                    <h1 className="text-sm font-bold tracking-wider text-zinc-100 uppercase">
            MANDALA DASHBOARD
          </h1>

          {/* Status Indicator Required: [🟢 ROCm ONLINE] */}
          <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-950/40 px-2.5 py-0.5 text-[11px] font-mono font-medium text-emerald-400 shadow-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>[🟢 ROCm ONLINE]</span>
          </div>

          {/* Model Indicator Required: Qwen 3.5 (Local) */}
          <div className="hidden lg:flex items-center gap-1.5 rounded-full border border-zinc-700/60 bg-zinc-900/80 px-2.5 py-0.5 text-[11px] font-mono text-zinc-300">
            <Sparkles className="h-3 w-3 text-cyan-400" />
            <span className="text-zinc-400">LLM:</span>
            <span className="text-cyan-300 font-semibold">Qwen 3.5 (Local)</span>
          </div>
        </div>
      </div>

      {/* Center: Obsidian-inspired View Switcher [ 🎛️ Workflow & Telemetry View | ☸️ 3D Mandala View ] */}
      {onToggleView && (
        <div className="flex items-center rounded-xl bg-zinc-900/90 p-1 border border-zinc-800/80 shadow-inner">
          <button
            onClick={() => onToggleView('workflow')}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              activeView === 'workflow'
                ? 'bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/60 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
            title="Switch to 2D Workflow Canvas & Telemetry Dashboard"
          >
            <span>🎛️</span>
            <span className="hidden sm:inline">Workflow &amp; Telemetry View</span>
            <span className="sm:hidden">Workflow</span>
          </button>

          <button
            onClick={() => onToggleView('3d-mandala')}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              activeView === '3d-mandala'
                ? 'bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/50 text-amber-200 shadow-sm font-semibold'
                : 'text-zinc-400 hover:text-amber-300 hover:bg-zinc-800/40'
            }`}
            title="Switch to Interactive 3D Mandala Radial Graph View"
          >
            <span>☸️</span>
            <span className="hidden sm:inline">3D Mandala View</span>
            <span className="sm:hidden">3D Mandala</span>
          </button>
        </div>
      )}

      {/* Right: Actions & Panel Toggles */}
      <div className="flex items-center gap-2">
        {onResetNodes && (
          <button
            onClick={onResetNodes}
            title="Reset Canvas Layout"
            className="hidden sm:flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/80 px-2.5 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Reset Canvas</span>
          </button>
        )}

        {onRunKernel && (
          <button
            onClick={onRunKernel}
            disabled={isCompiling}
            className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-zinc-950 shadow-md shadow-emerald-950/50 hover:bg-emerald-500 active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play className="h-3.5 w-3.5 fill-zinc-950" />
            <span>{isCompiling ? 'Running ROCm...' : 'Run Kernel'}</span>
          </button>
        )}

        {onToggleTelemetry && (
          <button
            onClick={onToggleTelemetry}
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-mono transition ${
              isTelemetryOpen
                ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-300'
                : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
            }`}
          >
            <Activity className="h-3.5 w-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Telemetry</span>
          </button>
        )}

        {onToggleCopilot && (
          <button
            onClick={onToggleCopilot}
            className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition ${
              isCopilotOpen
                ? 'border-cyan-500/40 bg-cyan-950/40 text-cyan-200 shadow-sm'
                : 'border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
            <span>Mandala Copilot</span>
          </button>
        )}
      </div>
    </header>
  );
};

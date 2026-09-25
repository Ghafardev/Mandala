import React from 'react';
import {
  Layers,
  Sparkles,
  Activity,
  Play,
  FileText,
  Radio,
  Cpu,
  Bookmark,
  ChevronDown,
} from 'lucide-react';
import { WORKFLOW_TEMPLATES, WorkflowTemplate } from '../data/templates';

interface NavbarProps {
  onSelectTemplate: (template: WorkflowTemplate) => void;
  onRunKernel: () => void;
  isCompiling: boolean;
  isTelemetryOpen: boolean;
  onToggleTelemetry: () => void;
  isCopilotOpen: boolean;
  onToggleCopilot: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onSelectTemplate,
  onRunKernel,
  isCompiling,
  isTelemetryOpen,
  onToggleTelemetry,
  isCopilotOpen,
  onToggleCopilot,
}) => {
  return (
    <header className="flex h-14 w-full items-center justify-between border-b border-slate-800 bg-slate-950/90 px-4 backdrop-blur-md select-none z-30">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-rose-600 via-amber-500 to-sky-400 p-0.5 shadow-lg shadow-rose-950/40">
          <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-slate-950">
            <Cpu className="h-5 w-5 text-amber-400" />
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold tracking-tight text-white">MANDALA</h1>
            <span className="rounded bg-rose-950/80 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-rose-300 border border-rose-800/60">
              AMD ROCm 6.2
            </span>
            <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[9px] text-slate-300 border border-slate-700">
              Triton 3.0
            </span>
          </div>
          <p className="text-[10px] text-slate-400 font-mono">
            Low-Code LLM Kernel Engineering Studio (CDNA 3 / MI300X)
          </p>
        </div>
      </div>

      {/* Middle: Workflow Templates */}
      <div className="hidden md:flex items-center gap-2">
        <div className="relative group">
          <button className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 transition">
            <Bookmark className="h-3.5 w-3.5 text-amber-400" />
            <span>Load Kernel Template</span>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </button>

          <div className="absolute left-0 top-full mt-1.5 hidden w-72 rounded-xl border border-slate-800 bg-slate-950 p-2 shadow-2xl group-hover:block z-50">
            <div className="text-[10px] uppercase font-semibold text-slate-500 px-2 py-1">
              Engineered for AMD CDNA
            </div>
            {WORKFLOW_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                onClick={() => onSelectTemplate(tpl)}
                className="flex w-full flex-col rounded-lg p-2 text-left hover:bg-slate-900 transition"
              >
                <div className="flex items-center justify-between text-xs font-medium text-slate-200">
                  <span>{tpl.name}</span>
                  <span className="font-mono text-[9px] text-amber-400 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-800/40">
                    {tpl.archTarget}
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 truncate mt-0.5">
                  {tpl.description}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Compile CTA */}
        <button
          onClick={onRunKernel}
          disabled={isCompiling}
          className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 shadow-md shadow-amber-500/20 hover:brightness-110 active:scale-95 transition disabled:opacity-60"
        >
          <Play className="h-3.5 w-3.5 fill-slate-950" />
          <span>{isCompiling ? 'Benchmarking...' : 'Compile & Run'}</span>
        </button>
      </div>

      {/* Right Controls: Telemetry and Copilot Toggles */}
      <div className="flex items-center gap-2">
        {/* Telemetry Toggle */}
        <button
          onClick={onToggleTelemetry}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-mono transition ${
            isTelemetryOpen
              ? 'border-emerald-500/50 bg-emerald-950/40 text-emerald-300'
              : 'border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Radio
            className={`h-3.5 w-3.5 ${
              isTelemetryOpen ? 'text-emerald-400 animate-pulse' : 'text-slate-400'
            }`}
          />
          <span className="hidden sm:inline">ROCm Telemetry</span>
        </button>

        {/* Copilot Toggle */}
        <button
          onClick={onToggleCopilot}
          className={`flex items-center gap-1.5 rounded-lg border px-3.5 py-1.5 text-xs font-medium transition ${
            isCopilotOpen
              ? 'border-violet-500/50 bg-violet-950/60 text-violet-200 shadow-md shadow-violet-900/30'
              : 'border-slate-800 bg-slate-900 text-slate-200 hover:bg-slate-800'
          }`}
        >
          <Sparkles className="h-3.5 w-3.5 text-violet-400" />
          <span>Mandala Copilot</span>
        </button>
      </div>
    </header>
  );
};

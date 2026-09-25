import React from 'react';
import {
  X,
  Cpu,
  Zap,
  Activity,
  Database,
  Terminal,
  Sparkles,
  Copy,
  Check,
} from 'lucide-react';
import { MandalaNode3D } from './types';

interface MandalaNodeInspectorProps {
  node: MandalaNode3D | null;
  onClose: () => void;
  onFocusNode?: (node: MandalaNode3D) => void;
  onRunKernel?: () => void;
  isCompiling?: boolean;
}

export const MandalaNodeInspector: React.FC<MandalaNodeInspectorProps> = ({
  node,
  onClose,
  onFocusNode,
  onRunKernel,
  isCompiling,
}) => {
  const [copied, setCopied] = React.useState(false);

  if (!node) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(node, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const getLayerBadge = () => {
    switch (node.layer) {
      case 'seed':
        return {
          title: 'Core Seed (AMD ROCm)',
          bg: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
          icon: <Cpu className="h-3.5 w-3.5 text-amber-400" />,
        };
      case 'tensor':
        return {
          title: 'Ring 1: Tensor & Memory',
          bg: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30',
          icon: <Database className="h-3.5 w-3.5 text-yellow-400" />,
        };
      case 'triton':
        return {
          title: 'Ring 2: Triton Execution',
          bg: 'bg-orange-500/10 text-orange-300 border-orange-500/30',
          icon: <Zap className="h-3.5 w-3.5 text-orange-400" />,
        };
      case 'evaluation':
        return {
          title: 'Ring 3: Model & RAG Output',
          bg: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
          icon: <Activity className="h-3.5 w-3.5 text-rose-400" />,
        };
      default:
        return {
          title: 'Node',
          bg: 'bg-zinc-500/10 text-zinc-300 border-zinc-500/30',
          icon: <Sparkles className="h-3.5 w-3.5 text-zinc-400" />,
        };
    }
  };

  const layerBadge = getLayerBadge();

  return (
    <aside className="absolute right-4 top-16 bottom-4 w-96 flex flex-col rounded-2xl border border-zinc-700/80 bg-zinc-950/90 p-5 shadow-2xl backdrop-blur-xl z-30 font-sans text-zinc-100 animate-in fade-in slide-in-from-right-4 duration-200">
      <div className="flex items-start justify-between border-b border-zinc-800/90 pb-4">
        <div className="space-y-1 pr-2">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-mono font-medium ${layerBadge.bg}`}>
              {layerBadge.icon}
              {layerBadge.title}
            </span>
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          </div>

          <h2 className="text-base font-bold tracking-tight text-zinc-100">{node.name}</h2>
          <p className="text-xs font-mono text-zinc-400">{node.subtitle}</p>
        </div>

        <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition" title="Close inspector">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="py-3 border-b border-zinc-900 text-xs text-zinc-300 leading-relaxed">
        {node.description}
      </div>

      <div className="flex-1 overflow-y-auto py-3 space-y-4 text-xs scrollbar-thin scrollbar-thumb-zinc-800">
        <div className="space-y-1.5">
          <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
            Telemetry & Performance
          </label>
          <div className="grid grid-cols-2 gap-2">
            {node.metrics.map((m, idx) => (
              <div key={idx} className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-2.5 space-y-1 shadow-sm">
                <div className="text-[10px] text-zinc-400 truncate">{m.label}</div>
                <div className="text-xs font-mono font-bold text-amber-300 truncate">{m.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3 space-y-2 font-mono text-[11px]">
          <div className="text-[10px] uppercase tracking-wider text-zinc-400">Sacred Geometry Position</div>
          <div className="grid grid-cols-3 gap-2 text-zinc-300">
            <div><span className="text-zinc-400">Radius (r):</span> {node.ringRadius}</div>
            <div><span className="text-zinc-400">Angle (θ):</span> {node.angleDeg}°</div>
            <div><span className="text-zinc-400">Z-Elev:</span> {node.elevation}</div>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
            Runtime Parameters
          </label>
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 divide-y divide-zinc-800/60 font-mono text-[11px]">
            {Object.entries(node.parameters).map(([key, val]) => (
              <div key={key} className="flex justify-between px-3 py-1.5">
                <span className="text-zinc-400">{key}:</span>
                <span className="text-zinc-200 font-medium truncate max-w-[170px]">{String(val)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-zinc-400">
            <span className="flex items-center gap-1">
              <Terminal className="h-3 w-3 text-amber-400" />
              Node Event Stream
            </span>
            <span>{node.logs.length} events</span>
          </div>
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-950 p-2.5 space-y-1 font-mono text-[10px] text-zinc-400 max-h-32 overflow-y-auto">
            {node.logs.map((log, idx) => (
              <div key={idx} className="leading-relaxed text-zinc-300">{log}</div>
            ))}
          </div>
        </div>
      </div>

      <div className="pt-3 border-t border-zinc-800/90 flex items-center gap-2">
        {onFocusNode && (
          <button onClick={() => onFocusNode(node)} className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-800 hover:text-white transition shadow-sm">
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            Focus Node
          </button>
        )}

        {node.layer === 'triton' && onRunKernel && (
          <button onClick={onRunKernel} disabled={isCompiling} className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-2 text-xs font-semibold text-zinc-950 hover:brightness-110 active:scale-95 transition disabled:opacity-50">
            <Zap className="h-3.5 w-3.5 fill-zinc-950" />
            {isCompiling ? 'Running...' : 'Run Triton'}
          </button>
        )}

        <button onClick={handleCopy} title="Copy node payload" className="rounded-lg border border-zinc-800 bg-zinc-900 p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition">
          {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </aside>
  );
};

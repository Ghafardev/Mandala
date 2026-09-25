import React from 'react';
import { Handle, Position } from 'reactflow';
import { Database, Layers, Cpu } from 'lucide-react';
import { TensorInputConfig, DType } from '../../types';

interface TensorInputNodeProps {
  data: {
    config: TensorInputConfig;
    onChange: (config: TensorInputConfig) => void;
  };
}

export const TensorInputNode: React.FC<TensorInputNodeProps> = ({ data }) => {
  const { config, onChange } = data;

  const updateTensorA = (updates: Partial<TensorInputConfig['tensorA']>) => {
    onChange({
      ...config,
      tensorA: { ...config.tensorA, ...updates },
    });
  };

  const updateTensorB = (updates: Partial<TensorInputConfig['tensorB']>) => {
    onChange({
      ...config,
      tensorB: { ...config.tensorB, ...updates },
    });
  };

  const elemBytes = config.tensorA.dtype === 'float32' ? 4 : 2;
  const tensorASizeMB = (
    (config.tensorA.shape[0] * config.tensorA.shape[1] * elemBytes) /
    (1024 * 1024)
  ).toFixed(2);
  const tensorBSizeMB = (
    (config.tensorB.shape[0] * config.tensorB.shape[1] * elemBytes) /
    (1024 * 1024)
  ).toFixed(2);

  return (
    <div className="w-80 rounded-xl border border-sky-500/30 bg-slate-900/95 text-slate-100 shadow-2xl backdrop-blur-md transition-all hover:border-sky-400/60">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/80 px-4 py-3 rounded-t-xl">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-sky-500/20 p-1.5 text-sky-400">
            <Database className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-sky-100">Tensor Inputs</h3>
            <p className="text-[11px] text-slate-400 font-mono">PyTorch ROCm Tensors</p>
          </div>
        </div>
        <span className="rounded bg-sky-950 px-2 py-0.5 text-[10px] font-mono text-sky-300 border border-sky-800/60">
          {config.device}
        </span>
      </div>

      <div className="p-4 space-y-4 text-xs">
        {/* Tensor A */}
        <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-medium text-slate-200">
              <Layers className="h-3.5 w-3.5 text-sky-400" />
              <span>{config.tensorA.name}</span>
            </div>
            <span className="font-mono text-[10px] text-slate-400">{tensorASizeMB} MB</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-400">M (Rows)</label>
              <input
                type="number"
                value={config.tensorA.shape[0]}
                onChange={(e) =>
                  updateTensorA({
                    shape: [parseInt(e.target.value) || 1, config.tensorA.shape[1]],
                  })
                }
                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-xs text-sky-300 focus:border-sky-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400">K (Inner Dim)</label>
              <input
                type="number"
                value={config.tensorA.shape[1]}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 1;
                  updateTensorA({ shape: [config.tensorA.shape[0], val] });
                  // Keep K synced with Tensor B row
                  updateTensorB({ shape: [val, config.tensorB.shape[1]] });
                }}
                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-xs text-sky-300 focus:border-sky-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Tensor B */}
        <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-medium text-slate-200">
              <Layers className="h-3.5 w-3.5 text-indigo-400" />
              <span>{config.tensorB.name}</span>
            </div>
            <span className="font-mono text-[10px] text-slate-400">{tensorBSizeMB} MB</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-400">K (Shared)</label>
              <input
                type="number"
                disabled
                value={config.tensorB.shape[0]}
                className="w-full rounded border border-slate-800 bg-slate-950/80 px-2 py-1 font-mono text-xs text-slate-500 cursor-not-allowed"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400">N (Cols)</label>
              <input
                type="number"
                value={config.tensorB.shape[1]}
                onChange={(e) =>
                  updateTensorB({
                    shape: [config.tensorB.shape[0], parseInt(e.target.value) || 1],
                  })
                }
                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-xs text-sky-300 focus:border-sky-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Dtype & Device Selection */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-slate-400">Precision / Dtype</label>
            <select
              value={config.tensorA.dtype}
              onChange={(e) => {
                const dt = e.target.value as DType;
                updateTensorA({ dtype: dt });
                updateTensorB({ dtype: dt });
              }}
              className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
            >
              <option value="bfloat16">bfloat16 (MFMA native)</option>
              <option value="float16">float16 (IEEE FP16)</option>
              <option value="float32">float32 (Single FP32)</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] text-slate-400">Initialization</label>
            <select
              value={config.tensorA.init}
              onChange={(e) => {
                const init = e.target.value as any;
                updateTensorA({ init });
                updateTensorB({ init });
              }}
              className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
            >
              <option value="normal">torch.randn (Normal)</option>
              <option value="uniform">torch.rand (Uniform)</option>
              <option value="ones">torch.ones</option>
              <option value="zeros">torch.zeros</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800">
          <span className="flex items-center gap-1">
            <Cpu className="h-3 w-3 text-emerald-400" />
            HBM3 Allocation:
          </span>
          <span className="font-mono text-emerald-300 font-semibold">
            {(parseFloat(tensorASizeMB) + parseFloat(tensorBSizeMB)).toFixed(2)} MB
          </span>
        </div>
      </div>

      {/* Output Port to Triton Node */}
      <Handle
        type="source"
        position={Position.Right}
        id="tensor-out"
        className="!w-3 !h-3 !bg-sky-400 !border-slate-900"
      />
    </div>
  );
};

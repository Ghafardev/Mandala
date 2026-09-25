import React, { useState } from 'react';
import { X, Copy, Check, Download, Play, RefreshCw, FileCode } from 'lucide-react';
import { TritonKernelConfig } from '../types';

interface KernelCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  kernelConfig: TritonKernelConfig;
  onSaveCode: (code: string) => void;
  onRunFromModal: () => void;
}

export const KernelCodeModal: React.FC<KernelCodeModalProps> = ({
  isOpen,
  onClose,
  kernelConfig,
  onSaveCode,
  onRunFromModal,
}) => {
  const [code, setCode] = useState(
    kernelConfig.customCode || getDefaultTritonCode(kernelConfig)
  );
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([code], { type: 'text/x-python' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${kernelConfig.kernelName || 'triton_kernel'}.py`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="flex h-[85vh] w-full max-w-4xl flex-col rounded-xl border border-slate-700 bg-slate-950 shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/90 px-5 py-3">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-violet-500/20 p-1.5 text-violet-400">
              <FileCode className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-100">
                Triton Python Kernel: <span className="font-mono text-violet-300">{kernelConfig.kernelName}</span>
              </h2>
              <p className="text-[11px] text-slate-400 font-mono">
                Target: AMD ROCm 6.2 (CDNA 3 Wave64) • Block: {kernelConfig.blockM}×{kernelConfig.blockN}×{kernelConfig.blockK}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 transition"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? 'Copied' : 'Copy Code'}</span>
            </button>

            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 transition"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export .py</span>
            </button>

            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition ml-2"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Code Editor Body */}
        <div className="relative flex-1 bg-slate-950 p-4 font-mono text-xs">
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="h-full w-full resize-none rounded-lg border border-slate-800 bg-slate-900/80 p-4 font-mono text-xs text-sky-200 focus:border-violet-500 focus:outline-none"
            spellCheck={false}
          />
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-slate-800 bg-slate-900/90 px-5 py-3 text-xs">
          <span className="text-slate-400 font-mono">
            ROCm Compiler Pipeline: Triton IR → ROCm LLVM → AMDGPU GCN Assembly
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onSaveCode(code);
                onClose();
              }}
              className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 font-medium text-slate-200 hover:bg-slate-700 transition"
            >
              Save Changes
            </button>
            <button
              onClick={() => {
                onSaveCode(code);
                onClose();
                onRunFromModal();
              }}
              className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 font-semibold text-slate-950 hover:bg-amber-400 transition"
            >
              <Play className="h-3.5 w-3.5 fill-slate-950" />
              <span>Save & Compile on GPU</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

function getDefaultTritonCode(cfg: TritonKernelConfig): string {
  return `import torch
import triton
import triton.language as tl

# AMD ROCm CDNA 3 Native Wavefront 64 Kernel
@triton.jit
def ${cfg.kernelName}(
    a_ptr, b_ptr, c_ptr,
    M, N, K,
    stride_am, stride_ak,
    stride_bk, stride_bn,
    stride_cm, stride_cn,
    BLOCK_SIZE_M: tl.constexpr = ${cfg.blockM},
    BLOCK_SIZE_N: tl.constexpr = ${cfg.blockN},
    BLOCK_SIZE_K: tl.constexpr = ${cfg.blockK},
):
    pid = tl.program_id(axis=0)
    num_pid_m = tl.cdiv(M, BLOCK_SIZE_M)
    num_pid_n = tl.cdiv(N, BLOCK_SIZE_N)
    pid_m = pid // num_pid_n
    pid_n = pid % num_pid_n

    offs_am = (pid_m * BLOCK_SIZE_M + tl.arange(0, BLOCK_SIZE_M)) % M
    offs_bn = (pid_n * BLOCK_SIZE_N + tl.arange(0, BLOCK_SIZE_N)) % N
    offs_k = tl.arange(0, BLOCK_SIZE_K)

    a_ptrs = a_ptr + (offs_am[:, None] * stride_am + offs_k[None, :] * stride_ak)
    b_ptrs = b_ptr + (offs_k[:, None] * stride_bk + offs_bn[None, :] * stride_bn)

    accumulator = tl.zeros((BLOCK_SIZE_M, BLOCK_SIZE_N), dtype=tl.float32)
    for k in range(0, tl.cdiv(K, BLOCK_SIZE_K)):
        a = tl.load(a_ptrs, mask=offs_k[None, :] < K - k * BLOCK_SIZE_K, other=0.0)
        b = tl.load(b_ptrs, mask=offs_k[:, None] < K - k * BLOCK_SIZE_K, other=0.0)
        # Emits AMD MFMA 16x16x16 on gfx942
        accumulator += tl.dot(a, b)
        a_ptrs += BLOCK_SIZE_K * stride_ak
        b_ptrs += BLOCK_SIZE_K * stride_bk

    c = accumulator.to(tl.bfloat16)
    offs_cm = pid_m * BLOCK_SIZE_M + tl.arange(0, BLOCK_SIZE_M)
    offs_cn = pid_n * BLOCK_SIZE_N + tl.arange(0, BLOCK_SIZE_N)
    c_ptrs = c_ptr + stride_cm * offs_cm[:, None] + stride_cn * offs_cn[None, :]
    tl.store(c_ptrs, c, mask=(offs_cm[:, None] < M) & (offs_cn[None, :] < N))
`;
}

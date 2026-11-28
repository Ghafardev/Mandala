import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Cpu, FileUp, Loader2, X } from 'lucide-react';
import {
  inspectModel,
  registerModel,
  uploadGguf,
  type InspectResult,
  type ModelDType,
  type ModelEngine,
  type ModelQuantization,
  type ModelRecord,
  type ModelSource,
  type ModelSourceKind,
  type RuntimePlan,
} from '../../lib/models';

interface AddModelModalProps {
  opened: boolean;
  onClose: () => void;
  onRegistered: (model: ModelRecord) => void;
}

const SOURCE_TABS: { id: ModelSourceKind; label: string }[] = [
  { id: 'huggingface', label: 'Hugging Face' },
  { id: 'local_path', label: 'Local path' },
  { id: 'gguf_upload', label: 'Upload GGUF' },
];

const STEPS = ['Source', 'Inspect', 'Runtime plan', 'Confirm'];

function formatGb(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${value.toFixed(2)} GB`;
}

export const AddModelModal: React.FC<AddModelModalProps> = ({
  opened,
  onClose,
  onRegistered,
}) => {
  const [step, setStep] = useState(0);
  const [sourceKind, setSourceKind] = useState<ModelSourceKind>('local_path');
  const [ref, setRef] = useState('');
  const [revision, setRevision] = useState('');
  const [token, setToken] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [engine, setEngine] = useState<ModelEngine>('transformers');
  const [dtype, setDtype] = useState<ModelDType>('bfloat16');
  const [quantization, setQuantization] = useState<ModelQuantization>('none');
  const [maxContext, setMaxContext] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [inspection, setInspection] = useState<InspectResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plan: RuntimePlan = useMemo(
    () =>
      engine === 'llama_cpp'
        ? {
            engine,
            dtype: 'float16',
            quantization: 'none',
            max_context: maxContext.trim() ? Number(maxContext) : null,
          }
        : {
            engine,
            dtype,
            quantization,
            max_context: maxContext.trim() ? Number(maxContext) : null,
          },
    [engine, dtype, quantization, maxContext]
  );

  const reset = () => {
    setStep(0);
    setSourceKind('local_path');
    setRef('');
    setRevision('');
    setToken('');
    setUploadFile(null);
    setEngine('transformers');
    setDtype('bfloat16');
    setQuantization('none');
    setMaxContext('');
    setDisplayName('');
    setInspection(null);
    setBusy(false);
    setError(null);
  };

  useEffect(() => {
    if (!opened) reset();
  }, [opened]);

  if (!opened) return null;

  const currentSource = (): ModelSource => ({
    kind: sourceKind,
    ref,
    ...(sourceKind === 'huggingface' && revision.trim() ? { revision: revision.trim() } : {}),
    ...(sourceKind === 'huggingface' && token.trim() ? { token: token.trim() } : {}),
  });

  const runInspect = async (nextSource: ModelSource, nextPlan: RuntimePlan) => {
    setBusy(true);
    setError(null);
    try {
      const result = await inspectModel(nextSource, nextPlan);
      setInspection(result);
      if (!displayName.trim()) {
        setDisplayName(result.metadata.display_name);
      }
      return result;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Inspection failed.');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const handleSourceNext = async () => {
    setError(null);
    if (sourceKind === 'local_path' && !ref.trim()) {
      setError('Enter a directory (or .gguf file) inside the models directory.');
      return;
    }
    if (sourceKind === 'huggingface' && !ref.trim()) {
      setError('Enter a Hugging Face repo id, for example Qwen/Qwen2.5-7B-Instruct.');
      return;
    }

    let resolvedRef = ref.trim();
    if (sourceKind === 'gguf_upload') {
      if (!uploadFile) {
        setError('Choose a .gguf file to upload.');
        return;
      }
      setBusy(true);
      try {
        resolvedRef = await uploadGguf(uploadFile);
        setRef(resolvedRef);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Upload failed.');
        setBusy(false);
        return;
      } finally {
        setBusy(false);
      }
    }

    const result = await runInspect({ ...currentSource(), ref: resolvedRef }, plan);
    if (result) setStep(1);
  };

  const handlePlanNext = async () => {
    const result = inspection ?? (await runInspect(currentSource(), plan));
    if (result) setStep(2);
  };

  const handlePlanChange = async (
    nextEngine: ModelEngine,
    nextDtype: ModelDType,
    nextQuant: ModelQuantization,
    nextContext: string
  ) => {
    await runInspect(currentSource(), {
      engine: nextEngine,
      dtype: nextDtype,
      quantization: nextQuant,
      max_context: nextContext.trim() ? Number(nextContext) : null,
    });
  };

  const handleRegister = async () => {
    setBusy(true);
    setError(null);
    try {
      const record = await registerModel(currentSource(), plan, displayName.trim());
      onRegistered(record);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Registration failed.');
    } finally {
      setBusy(false);
    }
  };

  const metadata = inspection?.metadata;
  const estimate = inspection?.estimate;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-emerald-400" />
            <h2 className="text-sm font-semibold tracking-wide text-zinc-100">
              Add a model
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-1 border-b border-zinc-900 px-5 py-2">
          {STEPS.map((label, index) => (
            <React.Fragment key={label}>
              <span
                className={`flex items-center gap-1.5 text-[11px] font-mono ${
                  index === step
                    ? 'text-emerald-300'
                    : index < step
                      ? 'text-zinc-400'
                      : 'text-zinc-600'
                }`}
              >
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-full border text-[10px] ${
                    index <= step
                      ? 'border-emerald-500/50 bg-emerald-950/50'
                      : 'border-zinc-800'
                  }`}
                >
                  {index < step ? <Check className="h-2.5 w-2.5" /> : index + 1}
                </span>
                {label}
              </span>
              {index < STEPS.length - 1 && (
                <span className="mx-1 h-px flex-1 bg-zinc-800" />
              )}
            </React.Fragment>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <div className="mb-3 flex items-start gap-2 rounded-md border border-red-500/30 bg-red-950/30 px-3 py-2 text-xs text-red-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {step === 0 && (
            <div className="space-y-4">
              <div className="flex gap-1 rounded-lg bg-zinc-900/80 p-1">
                {SOURCE_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setSourceKind(tab.id);
                      setRef('');
                      setUploadFile(null);
                    }}
                    className={`flex-1 rounded-md px-2 py-1.5 text-xs transition ${
                      sourceKind === tab.id
                        ? 'bg-zinc-800 font-semibold text-zinc-100'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {sourceKind === 'huggingface' && (
                <>
                  <label className="block text-xs text-zinc-400">
                    Repo id
                    <input
                      value={ref}
                      onChange={(event) => setRef(event.target.value)}
                      placeholder="Qwen/Qwen2.5-7B-Instruct"
                      className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-100 outline-none focus:border-emerald-500/60"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-xs text-zinc-400">
                      Revision (optional)
                      <input
                        value={revision}
                        onChange={(event) => setRevision(event.target.value)}
                        placeholder="main"
                        className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-100 outline-none focus:border-emerald-500/60"
                      />
                    </label>
                    <label className="block text-xs text-zinc-400">
                      HF token (optional, never stored)
                      <input
                        type="password"
                        value={token}
                        onChange={(event) => setToken(event.target.value)}
                        autoComplete="off"
                        className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-100 outline-none focus:border-emerald-500/60"
                      />
                    </label>
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    Registration reads public metadata only. No weights are downloaded in this build.
                  </p>
                </>
              )}

              {sourceKind === 'local_path' && (
                <>
                  <label className="block text-xs text-zinc-400">
                    Directory inside the models root, or a .gguf file
                    <input
                      value={ref}
                      onChange={(event) => setRef(event.target.value)}
                      placeholder="Qwen2.5-7B-Instruct or tiny-model.gguf"
                      className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-100 outline-none focus:border-emerald-500/60"
                    />
                  </label>
                  <p className="text-[11px] text-zinc-500">
                    Paths outside the models directory are rejected. The directory needs
                    config.json plus weights, or a single .gguf file.
                  </p>
                </>
              )}

              {sourceKind === 'gguf_upload' && (
                <>
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-700 bg-zinc-900/50 px-4 py-8 text-xs text-zinc-400 hover:border-emerald-500/50 hover:text-zinc-200">
                    <FileUp className="h-4 w-4" />
                    {uploadFile ? uploadFile.name : 'Choose a .gguf file (max 20 GB)'}
                    <input
                      type="file"
                      accept=".gguf"
                      className="hidden"
                      onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
                    />
                  </label>
                  <p className="text-[11px] text-zinc-500">
                    The file is streamed into the models directory. The GGUF magic bytes are
                    checked before it is accepted.
                  </p>
                </>
              )}
            </div>
          )}

          {step === 1 && metadata && estimate && (
            <div className="space-y-3">
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3">
                <div className="text-sm font-semibold text-zinc-100">
                  {metadata.display_name}
                </div>
                <div className="mt-1 break-all font-mono text-[11px] text-zinc-500">
                  {metadata.source_kind}: {metadata.source_ref}
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <Row label="Architecture" value={metadata.architecture ?? '—'} />
                <Row
                  label="Parameters"
                  value={
                    metadata.params_billions
                      ? `${metadata.params_billions.toFixed(2)} B (${metadata.params_estimated_from})`
                      : '—'
                  }
                />
                <Row label="Context" value={metadata.context_length?.toLocaleString() ?? '—'} />
                <Row label="Layers" value={metadata.layers ?? '—'} />
                <Row
                  label="Attention"
                  value={
                    metadata.kv_heads && metadata.head_dim
                      ? `${metadata.kv_heads} kv heads × ${metadata.head_dim}`
                      : '—'
                  }
                />
                <Row label="Weight dtype" value={metadata.torch_dtype ?? metadata.quantization ?? '—'} />
              </dl>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-[11px] text-zinc-400">
                <span className="font-mono text-zinc-300">{formatGb(estimate.total_gb)}</span>{' '}
                estimated for the current plan.
                {estimate.verdict === 'insufficient' && (
                  <span className="text-amber-300"> It will not fit in the free VRAM reported now.</span>
                )}
                {estimate.verdict === 'unknown' && (
                  <span> No GPU memory reading is available on this host.</span>
                )}
              </div>
              {metadata.files.length > 0 && (
                <div className="text-[11px] text-zinc-500">
                  Files found: {metadata.files.slice(0, 8).join(', ')}
                  {metadata.files.length > 8 ? ` +${metadata.files.length - 8} more` : ''}
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs text-zinc-400">
                  Engine
                  <select
                    value={engine}
                    onChange={async (event) => {
                      const nextEngine = event.target.value as ModelEngine;
                      setEngine(nextEngine);
                      if (nextEngine === 'llama_cpp') {
                        setDtype('float16');
                        setQuantization('none');
                      }
                      await handlePlanChange(
                        nextEngine,
                        nextEngine === 'llama_cpp' ? 'float16' : dtype,
                        nextEngine === 'llama_cpp' ? 'none' : quantization,
                        maxContext
                      );
                    }}
                    className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-emerald-500/60"
                  >
                    <option value="transformers">transformers</option>
                    <option value="llama_cpp">llama.cpp (GGUF)</option>
                  </select>
                </label>
                <label className="block text-xs text-zinc-400">
                  Weight dtype
                  <select
                    value={dtype}
                    disabled={engine === 'llama_cpp'}
                    onChange={async (event) => {
                      const nextDtype = event.target.value as ModelDType;
                      setDtype(nextDtype);
                      await handlePlanChange(engine, nextDtype, quantization, maxContext);
                    }}
                    className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-emerald-500/60 disabled:opacity-50"
                  >
                    <option value="bfloat16">bfloat16</option>
                    <option value="float16">float16</option>
                    <option value="float32">float32</option>
                  </select>
                </label>
                <label className="block text-xs text-zinc-400">
                  Quantization
                  <select
                    value={engine === 'llama_cpp' ? 'none' : quantization}
                    disabled={engine === 'llama_cpp'}
                    onChange={async (event) => {
                      const nextQuant = event.target.value as ModelQuantization;
                      setQuantization(nextQuant);
                      if (nextQuant !== 'none') setDtype('float16');
                      await handlePlanChange(
                        engine,
                        nextQuant === 'none' ? dtype : 'float16',
                        nextQuant,
                        maxContext
                      );
                    }}
                    className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-emerald-500/60 disabled:opacity-50"
                  >
                    <option value="none">none</option>
                    <option value="int8">int8</option>
                    <option value="int4">int4</option>
                  </select>
                </label>
                <label className="block text-xs text-zinc-400">
                  Max context (optional)
                  <input
                    type="number"
                    min={1}
                    value={maxContext}
                    onChange={(event) => setMaxContext(event.target.value)}
                    onBlur={() => handlePlanChange(engine, dtype, quantization, maxContext)}
                    placeholder={inspection?.metadata.context_length?.toString() ?? 'model default'}
                    className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-100 outline-none focus:border-emerald-500/60"
                  />
                </label>
              </div>

              {estimate && (
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-xs">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-semibold text-zinc-200">VRAM verdict</span>
                    <span
                      className={
                        estimate.verdict === 'fits'
                          ? 'font-mono text-emerald-300'
                          : estimate.verdict === 'insufficient'
                            ? 'font-mono text-amber-300'
                            : 'font-mono text-zinc-400'
                      }
                    >
                      {estimate.verdict === 'fits'
                        ? `fits (${formatGb(estimate.available_gb)} free)`
                        : estimate.verdict === 'insufficient'
                          ? `does not fit (${formatGb(estimate.available_gb)} free)`
                          : 'unknown — no GPU reading'}
                    </span>
                  </div>
                  <table className="w-full text-[11px] text-zinc-400">
                    <tbody>
                      <tr>
                        <td className="py-0.5">Weights</td>
                        <td className="py-0.5 text-right font-mono">{formatGb(estimate.weights_gb)}</td>
                      </tr>
                      <tr>
                        <td className="py-0.5">KV cache</td>
                        <td className="py-0.5 text-right font-mono">{formatGb(estimate.kv_cache_gb)}</td>
                      </tr>
                      <tr>
                        <td className="py-0.5">Overhead (20%)</td>
                        <td className="py-0.5 text-right font-mono">{formatGb(estimate.overhead_gb)}</td>
                      </tr>
                      <tr className="border-t border-zinc-800">
                        <td className="py-1 font-semibold text-zinc-200">Total</td>
                        <td className="py-1 text-right font-mono text-zinc-100">
                          {formatGb(estimate.total_gb)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <p className="mt-2 break-words font-mono text-[10px] leading-relaxed text-zinc-600">
                    {estimate.formula}
                  </p>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <label className="block text-xs text-zinc-400">
                Display name
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-emerald-500/60"
                />
              </label>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-xs text-zinc-400">
                <div className="mb-2 font-semibold text-zinc-200">Summary</div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  <Row label="Source" value={sourceKind} />
                  <Row label="Engine" value={engine} />
                  <Row label="Dtype" value={dtype} />
                  <Row label="Quantization" value={engine === 'llama_cpp' ? 'from GGUF' : quantization} />
                  <Row label="Context" value={maxContext || String(inspection?.metadata.context_length ?? 'model default')} />
                  <Row label="Est. VRAM" value={formatGb(estimate?.total_gb)} />
                </dl>
                <p className="mt-3 text-[11px] text-zinc-500">
                  Registration stores metadata only and writes a MODEL_REGISTER task row. The model
                  is not loaded and no weights are fetched.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-zinc-800 px-5 py-3">
          <button
            onClick={() => (step === 0 ? onClose() : setStep(step - 1))}
            disabled={busy}
            className="rounded-md border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-900 disabled:opacity-50"
          >
            {step === 0 ? 'Cancel' : 'Back'}
          </button>
          <button
            onClick={
              step === 0
                ? handleSourceNext
                : step === 1
                  ? handlePlanNext
                  : step === 2
                    ? () => setStep(3)
                    : handleRegister
            }
            disabled={busy || (step === 3 && !displayName.trim())}
            className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3 w-3 animate-spin" />}
            {step === 0
              ? 'Inspect'
              : step === 1
                ? 'Continue'
                : step === 2
                  ? 'Confirm'
                  : 'Register model'}
          </button>
        </div>
      </div>
    </div>
  );
};

const Row: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <>
    <dt className="text-zinc-500">{label}</dt>
    <dd className="truncate text-right font-mono text-zinc-300" title={String(value)}>
      {value}
    </dd>
  </>
);

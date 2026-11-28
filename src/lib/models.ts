import { fetchWithBackendFallback } from './api';

export type ModelSourceKind = 'huggingface' | 'local_path' | 'gguf_upload';
export type ModelEngine = 'transformers' | 'llama_cpp';
export type ModelDType = 'bfloat16' | 'float16' | 'float32';
export type ModelQuantization = 'none' | 'int8' | 'int4';

export interface ModelSource {
  kind: ModelSourceKind;
  ref: string;
  revision?: string;
  token?: string;
}

export interface RuntimePlan {
  engine: ModelEngine;
  dtype: ModelDType;
  quantization: ModelQuantization;
  max_context?: number | null;
}

export interface ModelMetadata {
  source_kind: ModelSourceKind;
  source_ref: string;
  display_name: string;
  architecture: string | null;
  params_billions: number | null;
  params_estimated_from: 'weights' | 'config' | 'gguf_file_size' | null;
  context_length: number | null;
  layers: number | null;
  hidden_size: number | null;
  kv_heads: number | null;
  head_dim: number | null;
  torch_dtype: string | null;
  quantization: string | null;
  files: string[];
}

export interface VramEstimate {
  weights_gb: number;
  kv_cache_gb: number;
  overhead_gb: number;
  total_gb: number;
  bytes_per_param: number;
  engine: ModelEngine;
  dtype: ModelDType;
  quantization: ModelQuantization;
  formula: string;
  available_gb: number | null;
  verdict: 'fits' | 'insufficient' | 'unknown';
}

export interface InspectResult {
  metadata: ModelMetadata;
  plan: RuntimePlan;
  estimate: VramEstimate;
}

export interface ModelRecord {
  id: string;
  display_name: string;
  source_kind: ModelSourceKind;
  source_ref: string;
  architecture: string | null;
  params_billions: number | null;
  context_length: number | null;
  torch_dtype: string | null;
  quantization: string | null;
  engine: string;
  est_vram_gb: number | null;
  state: string;
  last_error: string | null;
  last_used_at: string | null;
  created_at: string | null;
}

function authOptions(options: RequestInit = {}): RequestInit {
  return { credentials: 'include', ...options };
}

async function readError(response: Response): Promise<string> {
  try {
    const payload = await response.json();
    const detail = payload?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((item: any) => item?.msg ?? JSON.stringify(item))
        .join('; ');
    }
  } catch {
    // Fall through to the status text.
  }
  return `Request failed with status ${response.status}.`;
}

export async function listModels(): Promise<ModelRecord[]> {
  const response = await fetchWithBackendFallback('/api/v1/models', authOptions());
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export async function inspectModel(
  source: ModelSource,
  plan: RuntimePlan
): Promise<InspectResult> {
  const response = await fetchWithBackendFallback(
    '/api/v1/models/inspect',
    authOptions({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, plan }),
    })
  );
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export async function registerModel(
  source: ModelSource,
  plan: RuntimePlan,
  displayName: string
): Promise<ModelRecord> {
  const response = await fetchWithBackendFallback(
    '/api/v1/models',
    authOptions({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, plan, display_name: displayName }),
    })
  );
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export async function uploadGguf(file: File): Promise<string> {
  const body = new FormData();
  body.append('file', file);
  const response = await fetchWithBackendFallback(
    '/api/v1/models/upload',
    authOptions({ method: 'POST', body })
  );
  if (!response.ok) throw new Error(await readError(response));
  const payload = await response.json();
  return payload.filename as string;
}

export async function deleteModel(modelId: string): Promise<ModelRecord> {
  const response = await fetchWithBackendFallback(
    `/api/v1/models/${modelId}`,
    authOptions({ method: 'DELETE' })
  );
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

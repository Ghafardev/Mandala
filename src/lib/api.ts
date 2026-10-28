const DEFAULT_BACKEND_URL =
  (typeof window !== 'undefined' && (window as any).__MANDALA_BACKEND_URL) ||
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_BACKEND_URL) ||
  'http://localhost:8000';

function backendToWs(base: string) {
  try {
    const url = new URL(base);
    const proto = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${url.host}/ws/gpu-telemetry`;
  } catch {
    return 'ws://localhost:8000/ws/gpu-telemetry';
  }
}

export const DEFAULT_BACKEND = DEFAULT_BACKEND_URL;

export interface RuntimeCapabilityState {
  status: 'available' | 'unavailable' | 'failed';
  backend: 'cpu' | 'cuda' | 'rocm';
  triton_available: boolean;
  execution_environment?: string | null;
  device_name?: string | null;
  device_arch?: string | null;
  diagnostic?: string | null;
  ready_for_execution?: boolean;
}

export async function fetchRuntimeCapability(): Promise<RuntimeCapabilityState | null> {
  try {
    const response = await fetchWithBackendFallback('/api/v1/health');
    if (!response.ok) {
      return null;
    }
    const payload = await response.json();
    return payload.runtime_capability ?? payload;
  } catch {
    return null;
  }
}

export function canAttemptKernelExecution(
  capability: RuntimeCapabilityState | null | undefined,
  targetArch?: string
): boolean {
  if (!capability || capability.status !== 'available') return false;
  if (capability.backend === 'cpu' || capability.triton_available === false) return false;

  const arch = (targetArch || '').toLowerCase();
  if (capability.backend === 'cuda' && arch.startsWith('gfx')) return false;
  if (capability.backend === 'rocm' && arch.startsWith('sm')) return false;

  return true;
}

export async function fetchWithBackendFallback(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const targetUrl = `${DEFAULT_BACKEND_URL}${endpoint}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);

  try {
    return await fetch(targetUrl, { ...options, signal: controller.signal });
  } catch {
    // local backend unavailable; fall through to relative fetch for local dev
  } finally {
    clearTimeout(timer);
  }

  return fetch(endpoint, options);
}

export function createTelemetryWebSocket(
  onMessage: (data: any) => void,
  onStatusChange: (status: 'connected' | 'connecting' | 'disconnected', url: string) => void
): () => void {
  let ws: WebSocket | null = null;
  let isCleanedUp = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const tryConnect = () => {
    if (isCleanedUp) return;

    const target = backendToWs(DEFAULT_BACKEND_URL);
    onStatusChange('connecting', target);

    try {
      ws = new WebSocket(target);
    } catch {
      onStatusChange('disconnected', target);
      if (!isCleanedUp) {
        retryTimer = setTimeout(tryConnect, 3000);
      }
      return;
    }

    ws.onopen = () => {
      onStatusChange('connected', target);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch (error) {
        console.error('Failed to parse telemetry packet', error);
      }
    };

    ws.onerror = () => {
      onStatusChange('disconnected', target);
    };

    ws.onclose = () => {
      onStatusChange('disconnected', target);
      if (!isCleanedUp) {
        retryTimer = setTimeout(tryConnect, 3000);
      }
    };
  };

  tryConnect();

  return () => {
    isCleanedUp = true;
    if (retryTimer) clearTimeout(retryTimer);
    if (ws) {
      ws.close();
      ws = null;
    }
  };
}

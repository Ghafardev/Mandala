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

export async function fetchWithBackendFallback(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const targetUrl = `${DEFAULT_BACKEND_URL}${endpoint}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);

    const directRes = await fetch(targetUrl, { ...options, signal: controller.signal });
    clearTimeout(timer);
    if (directRes.ok) {
      return directRes;
    }
    if (directRes.status >= 400 && directRes.status < 500) {
      return directRes;
    }
  } catch {
    // local backend unavailable; fall through to relative fetch for local dev
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

export const DEFAULT_BACKEND_URL = 'http://localhost:8000';

export async function fetchWithBackendFallback(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const targetUrl = `${DEFAULT_BACKEND_URL}${endpoint}`;

  if (typeof window !== 'undefined' && window.location.port === '8000') {
    return fetch(targetUrl, options);
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);

    const directRes = await fetch(targetUrl, { ...options, signal: controller.signal });
    clearTimeout(timer);
    if (directRes.ok) {
      return directRes;
    }
  } catch {
    // localhost failed or was blocked by mixed content
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
    onStatusChange('connecting', 'ws://localhost:8000/ws/gpu-telemetry');

    let localWs: WebSocket | null = null;
    let fallbackScheduled = false;

    try {
      localWs = new WebSocket('ws://localhost:8000/ws/gpu-telemetry');
    } catch {
      // direct instantiation may fail if protocol is blocked
    }

    const triggerFallback = () => {
      if (fallbackScheduled || isCleanedUp) return;
      fallbackScheduled = true;

      try {
        if (localWs) {
          localWs.onopen = null;
          localWs.onerror = null;
          localWs.onclose = null;
          localWs.close();
        }
      } catch {
        // ignore cleanup errors
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const fallbackUrl = `${protocol}//${window.location.host}/ws/gpu-telemetry`;

      onStatusChange('connecting', fallbackUrl);

      try {
        const fbWs = new WebSocket(fallbackUrl);
        ws = fbWs;

        fbWs.onopen = () => {
          onStatusChange('connected', fallbackUrl);
        };

        fbWs.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            onMessage(data);
          } catch (e) {
            console.error('Failed to parse telemetry packet', e);
          }
        };

        fbWs.onerror = () => {
          onStatusChange('disconnected', fallbackUrl);
        };

        fbWs.onclose = () => {
          onStatusChange('disconnected', fallbackUrl);
          if (!isCleanedUp) {
            retryTimer = setTimeout(tryConnect, 3000);
          }
        };
      } catch {
        onStatusChange('disconnected', fallbackUrl);
        if (!isCleanedUp) {
          retryTimer = setTimeout(tryConnect, 4000);
        }
      }
    };

    if (localWs) {
      ws = localWs;
      const timeoutId = setTimeout(() => {
        if (localWs?.readyState !== WebSocket.OPEN) {
          triggerFallback();
        }
      }, 1500);

      localWs.onopen = () => {
        clearTimeout(timeoutId);
        onStatusChange('connected', 'ws://localhost:8000/ws/gpu-telemetry');
      };

      localWs.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onMessage(data);
        } catch (e) {
          console.error('Failed to parse telemetry packet', e);
        }
      };

      localWs.onerror = () => {
        clearTimeout(timeoutId);
        triggerFallback();
      };

      localWs.onclose = () => {
        clearTimeout(timeoutId);
        triggerFallback();
      };
    } else {
      triggerFallback();
    }
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

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Cpu, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { fetchWithBackendFallback } from '../lib/api';
import { Login } from '../pages/Login';
import { Setup } from '../pages/Setup';

type AuthStage = 'checking' | 'onboarding' | 'login' | 'authenticated' | 'offline';

interface AuthStatusResponse {
  is_setup_completed: boolean;
  requires_onboarding: boolean;
}

export interface AuthGuardProps {
  /** The protected dashboard tree (App shell) rendered only when authenticated. */
  children: React.ReactNode;
}

/**
 * AuthGuard
 * ---------
 * Mount-time gate in front of the Mandala dashboard.
 *
 *  1. `GET /api/auth/status`  -> first boot? render <Setup />.
 *  2. `GET /api/auth/me`      -> cookie still valid? render children.
 *  3. Otherwise               -> render <Login />.
 *
 * Every request is sent with `credentials: 'include'` so the HTTP-Only
 * `mandala_session` cookie travels with it.
 */
export const AuthGuard: React.FC<AuthGuardProps> = ({ children }) => {
  const [stage, setStage] = useState<AuthStage>('checking');
  const [failure, setFailure] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const resolveSession = useCallback(async () => {
    if (mountedRef.current) {
      setStage('checking');
      setFailure(null);
    }

    try {
      const statusResponse = await fetchWithBackendFallback('/api/auth/status', {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });

      if (!statusResponse.ok) {
        throw new Error(`Auth status request failed (HTTP ${statusResponse.status}).`);
      }

      const status = (await statusResponse.json()) as AuthStatusResponse;

      if (!mountedRef.current) return;

      if (status.requires_onboarding || !status.is_setup_completed) {
        setStage('onboarding');
        return;
      }

      const sessionResponse = await fetchWithBackendFallback('/api/auth/me', {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });

      if (!mountedRef.current) return;

      if (sessionResponse.ok) {
        setStage('authenticated');
        return;
      }

      // 401/403 => no valid cookie. Anything else is treated as "not signed in"
      // as well, so the guard fails closed instead of leaking the dashboard.
      setStage('login');
    } catch (error) {
      if (!mountedRef.current) return;
      setFailure(
        error instanceof Error && error.message
          ? error.message
          : 'The Mandala backend could not be reached.'
      );
      setStage('offline');
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void resolveSession();
    return () => {
      mountedRef.current = false;
    };
  }, [resolveSession]);

  if (stage === 'authenticated') {
    return <>{children}</>;
  }

  if (stage === 'onboarding') {
    return <Setup onSetupComplete={() => setStage('authenticated')} />;
  }

  if (stage === 'login') {
    return <Login onLoginSuccess={() => setStage('authenticated')} />;
  }

  if (stage === 'offline') {
    return <BackendUnavailableScreen message={failure} onRetry={resolveSession} />;
  }

  return <SessionCheckScreen />;
};

const SessionCheckScreen: React.FC = () => (
  <div className="relative flex h-screen w-screen flex-col items-center justify-center overflow-hidden bg-zinc-950 font-sans text-zinc-100 select-none">
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.14),transparent_55%)]" />
    <div
      className="pointer-events-none absolute inset-0 opacity-[0.18]"
      style={{
        backgroundImage:
          'linear-gradient(rgba(148,163,184,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.18) 1px, transparent 1px)',
        backgroundSize: '44px 44px',
        maskImage: 'radial-gradient(circle at center, black, transparent 72%)',
        WebkitMaskImage: 'radial-gradient(circle at center, black, transparent 72%)',
      }}
    />

    <div className="relative flex flex-col items-center gap-6">
      <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-500 via-cyan-400 to-sky-500 p-[2px] shadow-2xl shadow-emerald-950/50">
        <div className="flex h-full w-full items-center justify-center rounded-[14px] bg-zinc-950">
          <Cpu className="h-7 w-7 text-emerald-400" />
        </div>
        <span className="absolute -inset-2 animate-ping rounded-3xl border border-emerald-500/20" />
      </div>

      <div className="flex flex-col items-center gap-2">
        <h1 className="text-lg font-bold tracking-[0.35em] text-zinc-100 uppercase">Mandala</h1>
        <p className="font-mono text-[10px] tracking-[0.25em] text-emerald-400/80 uppercase">
          Verifying local session
        </p>
      </div>

      <div className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/70 px-3 py-1.5 font-mono text-[10px] text-zinc-400">
        <Loader2 className="h-3 w-3 animate-spin text-cyan-400" />
        <span>GET /api/auth/status</span>
      </div>
    </div>
  </div>
);

interface BackendUnavailableScreenProps {
  message: string | null;
  onRetry: () => void;
}

const BackendUnavailableScreen: React.FC<BackendUnavailableScreenProps> = ({
  message,
  onRetry,
}) => (
  <div className="relative flex h-screen w-screen flex-col items-center justify-center overflow-hidden bg-zinc-950 px-6 font-sans text-zinc-100 select-none">
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(244,63,94,0.12),transparent_55%)]" />

    <div className="relative w-full max-w-md rounded-2xl border border-rose-500/25 bg-zinc-900/70 p-7 shadow-2xl shadow-black/60 backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-rose-500/30 bg-rose-950/40">
          <AlertTriangle className="h-5 w-5 text-rose-400" />
        </div>
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-zinc-100">
            Backend unreachable
          </h2>
          <p className="font-mono text-[10px] text-zinc-500">
            Mandala security gate cannot verify your session
          </p>
        </div>
      </div>

      <p className="mt-5 font-mono text-[11px] leading-relaxed text-zinc-400">
        Start the API engine with{' '}
        <span className="rounded bg-zinc-950 px-1.5 py-0.5 text-emerald-300">
          python main-api.py
        </span>{' '}
        and make sure it is listening on{' '}
        <span className="text-cyan-300">http://localhost:8000</span>.
      </p>

      {message && (
        <p className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 py-2 font-mono text-[10px] text-rose-300/90">
          {message}
        </p>
      )}

      <button
        type="button"
        onClick={onRetry}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2.5 text-xs font-semibold text-zinc-950 transition hover:brightness-110 active:scale-[0.99]"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Retry connection
      </button>

      <div className="mt-5 flex items-center justify-center gap-1.5 font-mono text-[9px] tracking-widest text-zinc-600 uppercase">
        <ShieldCheck className="h-3 w-3" />
        fail-closed authentication
      </div>
    </div>
  </div>
);

export default AuthGuard;

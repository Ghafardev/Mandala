import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Cpu,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  ShieldCheck,
  Terminal,
  User,
} from 'lucide-react';
import { fetchWithBackendFallback } from '../lib/api';

export interface LoginProps {
  /** Called after `POST /api/auth/login` returns 200 and the cookie is stored. */
  onLoginSuccess?: (username: string) => void;
}

interface ApiPayload {
  detail?: unknown;
  message?: string;
  username?: string;
}

function extractApiError(response: Response, payload: ApiPayload | null): string {
  const detail = payload?.detail;

  if (typeof detail === 'string' && detail.trim().length > 0) {
    return detail;
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (item && typeof item === 'object' && 'msg' in item) {
          return String((item as { msg: unknown }).msg);
        }
        return null;
      })
      .filter((item): item is string => Boolean(item));

    if (messages.length > 0) {
      return messages.join(' ');
    }
  }

  if (typeof payload?.message === 'string' && payload.message.trim().length > 0) {
    return payload.message;
  }

  if (response.status === 401) {
    return 'Invalid username or password. Access denied.';
  }

  if (response.status === 422) {
    return 'Username and password are required.';
  }

  return `Login failed (HTTP ${response.status}). Is the Mandala backend running on port 8000?`;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    const trimmedUsername = username.trim();

    if (!trimmedUsername || !password) {
      setError('Username and password are required.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetchWithBackendFallback('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          username: trimmedUsername,
          password,
        }),
      });

      let payload: ApiPayload | null = null;
      try {
        payload = (await response.json()) as ApiPayload;
      } catch {
        payload = null;
      }

      if (!response.ok) {
        setError(extractApiError(response, payload));
        setPassword('');
        return;
      }

      onLoginSuccess?.(payload?.username ?? trimmedUsername);
    } catch {
      setError('Cannot reach the Mandala backend. Start it with `python main-api.py` on port 8000.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-y-auto bg-zinc-950 px-4 py-10 font-sans text-zinc-100 select-none">
      {/* Ambient cyberpunk backdrop */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(56,189,248,0.16),transparent_55%),radial-gradient(circle_at_15%_90%,rgba(16,185,129,0.12),transparent_50%)]" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.16]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(148,163,184,0.22) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.22) 1px, transparent 1px)',
          backgroundSize: '46px 46px',
          maskImage: 'radial-gradient(circle at center, black, transparent 72%)',
          WebkitMaskImage: 'radial-gradient(circle at center, black, transparent 72%)',
        }}
      />

      <div className="relative w-full max-w-md">
        {/* Brand header */}
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-500 via-cyan-400 to-sky-500 p-[2px] shadow-2xl shadow-emerald-950/50">
            <div className="flex h-full w-full items-center justify-center rounded-[13px] bg-zinc-950">
              <Cpu className="h-6 w-6 text-emerald-400" />
            </div>
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-[0.35em] text-zinc-100 uppercase">
              Mandala
            </h1>
            <p className="mt-1 font-mono text-[10px] tracking-wide text-zinc-500">
              Local GPU Kernel IDE · AMD ROCm
            </p>
          </div>
        </div>

        {/* Login card */}
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-7 shadow-2xl shadow-black/60 backdrop-blur"
        >
          <header className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold tracking-wide text-zinc-100">
                Administrator sign-in
              </h2>
              <p className="mt-1 font-mono text-[10px] text-zinc-500">
                POST /api/auth/login
              </p>
            </div>
            <span className="flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-950/40 px-2 py-0.5 font-mono text-[9px] tracking-widest text-emerald-300 uppercase">
              <ShieldCheck className="h-3 w-3" />
              local
            </span>
          </header>

          <div className="space-y-4">
            {/* Username */}
            <div>
              <label
                htmlFor="login-username"
                className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] tracking-widest text-zinc-400 uppercase"
              >
                <User className="h-3 w-3 text-emerald-400" />
                Username
              </label>
              <input
                id="login-username"
                name="username"
                type="text"
                autoComplete="username"
                autoFocus
                required
                maxLength={64}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="ghafar"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 py-2.5 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 outline-none transition focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="login-password"
                className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] tracking-widest text-zinc-400 uppercase"
              >
                <Lock className="h-3 w-3 text-emerald-400" />
                Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  maxLength={256}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 py-2.5 pr-10 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 outline-none transition focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-zinc-500 transition hover:text-zinc-300"
                >
                  {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2.5"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
              <p className="font-mono text-[10px] leading-relaxed text-rose-200">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 via-cyan-500 to-sky-500 px-4 py-2.5 text-xs font-semibold text-zinc-950 shadow-lg shadow-emerald-950/40 transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Authenticating…
              </>
            ) : (
              <>
                Unlock dashboard
                <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </button>

          <div className="mt-5 flex items-center justify-center gap-1.5 border-t border-zinc-800/80 pt-4 font-mono text-[9px] tracking-wide text-zinc-600">
            <Terminal className="h-3 w-3" />
            Session cookie · HTTP-Only · SameSite=Strict · 24h
          </div>
        </form>

        <p className="mt-5 text-center font-mono text-[9px] leading-relaxed text-zinc-600">
          No account yet? Restart Mandala with an empty{' '}
          <span className="text-zinc-500">users</span> table to run first-boot onboarding.
        </p>
      </div>
    </div>
  );
};

export default Login;

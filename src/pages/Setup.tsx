import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Compass,
  Cpu,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Server,
  ShieldCheck,
  Sparkles,
  Terminal,
  User,
  Wrench,
} from 'lucide-react';
import { fetchWithBackendFallback } from '../lib/api';

export type VoiceCharacter = 'koji_engineer' | 'koji_guide';

export interface SetupProps {
  /** Called after `POST /api/auth/setup` succeeds and the session cookie is set. */
  onSetupComplete?: () => void;
}

interface ApiPayload {
  detail?: unknown;
  message?: string;
}

const ROCM_PRESETS = ['/opt/rocm', '/opt/rocm-6.1.0', '/opt/rocm-6.2.0'];

const VOICE_OPTIONS: Array<{
  id: VoiceCharacter;
  title: string;
  blurb: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'koji_engineer',
    title: 'Koji · Engineer',
    blurb: 'Terse, compiler-grade diagnostics. Kernel diffs, wavefront tuning, ROCm flags.',
    icon: Wrench,
  },
  {
    id: 'koji_guide',
    title: 'Koji · Guide',
    blurb: 'Step-by-step mentoring for Triton, HIP and PyTorch workflows.',
    icon: Compass,
  },
];

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

  if (response.status === 400) {
    return 'Mandala is already configured. Please sign in instead.';
  }

  if (response.status === 422) {
    return 'Some fields are invalid: username needs 3+ characters and the password needs 8+.';
  }

  return `Setup failed (HTTP ${response.status}). Is the Mandala backend running on port 8000?`;
}

export const Setup: React.FC<SetupProps> = ({ onSetupComplete }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rocmPath, setRocmPath] = useState('/opt/rocm');
  const [voiceCharacter, setVoiceCharacter] = useState<VoiceCharacter>('koji_engineer');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    const trimmedUsername = username.trim();
    const trimmedRocmPath = rocmPath.trim() || '/opt/rocm';

    if (trimmedUsername.length < 3) {
      setError('Master username must be at least 3 characters long.');
      return;
    }

    if (password.length < 8) {
      setError('Master password must be at least 8 characters long.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetchWithBackendFallback('/api/auth/setup', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          username: trimmedUsername,
          password,
          rocm_path: trimmedRocmPath,
          voice_character: voiceCharacter,
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
        return;
      }

      onSetupComplete?.();
    } catch {
      setError('Cannot reach the Mandala backend. Start it with `python main-api.py` on port 8000.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-y-auto bg-zinc-950 px-4 py-10 font-sans text-zinc-100 select-none">
      {/* Ambient cyberpunk backdrop */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(16,185,129,0.16),transparent_55%),radial-gradient(circle_at_85%_15%,rgba(56,189,248,0.12),transparent_50%)]" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.16]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(148,163,184,0.22) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.22) 1px, transparent 1px)',
          backgroundSize: '46px 46px',
          maskImage: 'radial-gradient(circle at center, black, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(circle at center, black, transparent 75%)',
        }}
      />

      <div className="relative grid w-full max-w-5xl gap-6 lg:grid-cols-[1.02fr_1fr]">
        {/* ── Left: identity panel ─────────────────────────────────────── */}
        <aside className="flex flex-col justify-between rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-7 shadow-2xl shadow-black/50 backdrop-blur">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-500 via-cyan-400 to-sky-500 p-[2px] shadow-lg shadow-emerald-950/50">
                <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-zinc-950">
                  <Cpu className="h-5 w-5 text-emerald-400" />
                </div>
              </div>
              <div>
                <h1 className="text-base font-bold tracking-[0.3em] text-zinc-100 uppercase">
                  Mandala
                </h1>
                <p className="font-mono text-[10px] text-zinc-500">
                  Local GPU Kernel IDE · AMD ROCm
                </p>
              </div>
            </div>

            <div className="mt-7 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-950/40 px-2.5 py-1 font-mono text-[10px] tracking-widest text-emerald-300 uppercase">
              <Sparkles className="h-3 w-3" />
              First boot · onboarding
            </div>

            <h2 className="mt-5 text-2xl leading-tight font-semibold text-zinc-50">
              Create the local
              <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                {' '}
                master administrator
              </span>
            </h2>
            <p className="mt-3 text-xs leading-relaxed text-zinc-400">
              Mandala runs entirely on this machine. This account protects the kernel
              compiler, task history and telemetry console. No cloud account, no
              telemetry upload — everything stays local.
            </p>

            <ul className="mt-6 space-y-3">
              {[
                { icon: ShieldCheck, text: 'bcrypt password hash + HTTP-Only JWT session' },
                { icon: Terminal, text: 'One-time setup, enforced by the backend' },
                { icon: Server, text: 'ROCm toolchain path stored in system_config' },
              ].map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-start gap-2.5 text-[11px] text-zinc-400">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950">
                    <Icon className="h-3 w-3 text-cyan-400" />
                  </span>
                  <span className="leading-relaxed">{text}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-8 border-t border-zinc-800/80 pt-4 font-mono text-[10px] tracking-wide text-zinc-600">
            <span className="text-emerald-500/80">●</span> local-only · no_dos · scope_strict
          </div>
        </aside>

        {/* ── Right: onboarding form ───────────────────────────────────── */}
        <form
          onSubmit={handleSubmit}
          className="flex flex-col rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-7 shadow-2xl shadow-black/60 backdrop-blur"
        >
          <header className="mb-5">
            <h3 className="text-sm font-semibold tracking-wide text-zinc-100">
              Administrator credentials
            </h3>
            <p className="mt-1 font-mono text-[10px] text-zinc-500">
              POST /api/auth/setup
            </p>
          </header>

          <div className="space-y-4">
            {/* Username */}
            <div>
              <label
                htmlFor="setup-username"
                className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] tracking-widest text-zinc-400 uppercase"
              >
                <User className="h-3 w-3 text-emerald-400" />
                Master username
              </label>
              <input
                id="setup-username"
                name="username"
                type="text"
                autoComplete="username"
                autoFocus
                required
                minLength={3}
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
                htmlFor="setup-password"
                className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] tracking-widest text-zinc-400 uppercase"
              >
                <Lock className="h-3 w-3 text-emerald-400" />
                Master password
              </label>
              <div className="relative">
                <input
                  id="setup-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  minLength={8}
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
              <p className="mt-1 font-mono text-[9px] text-zinc-600">
                Minimum 8 characters. Hashed with bcrypt before it touches the database.
              </p>
            </div>

            {/* ROCm path */}
            <div>
              <label
                htmlFor="setup-rocm"
                className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] tracking-widest text-zinc-400 uppercase"
              >
                <Server className="h-3 w-3 text-cyan-400" />
                ROCm installation path
              </label>
              <input
                id="setup-rocm"
                name="rocm_path"
                type="text"
                spellCheck={false}
                required
                maxLength={512}
                value={rocmPath}
                onChange={(event) => setRocmPath(event.target.value)}
                placeholder="/opt/rocm"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 py-2.5 font-mono text-xs text-cyan-200 placeholder:text-zinc-600 outline-none transition focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {ROCM_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setRocmPath(preset)}
                    className={`rounded border px-2 py-0.5 font-mono text-[9px] transition ${
                      rocmPath === preset
                        ? 'border-cyan-500/50 bg-cyan-950/50 text-cyan-200'
                        : 'border-zinc-800 bg-zinc-950/60 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Voice character */}
            <div>
              <span className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] tracking-widest text-zinc-400 uppercase">
                <Sparkles className="h-3 w-3 text-violet-400" />
                Voice assistant character
              </span>
              <div className="grid gap-2 sm:grid-cols-2">
                {VOICE_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const isActive = voiceCharacter === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setVoiceCharacter(option.id)}
                      aria-pressed={isActive}
                      className={`flex flex-col gap-1.5 rounded-xl border p-3 text-left transition ${
                        isActive
                          ? 'border-violet-500/50 bg-violet-950/30 shadow-inner shadow-violet-950/40'
                          : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-700 hover:bg-zinc-900/60'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-md border ${
                            isActive
                              ? 'border-violet-500/40 bg-violet-950/60 text-violet-300'
                              : 'border-zinc-800 bg-zinc-900 text-zinc-500'
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <span
                          className={`text-[11px] font-semibold ${
                            isActive ? 'text-violet-200' : 'text-zinc-300'
                          }`}
                        >
                          {option.title}
                        </span>
                      </span>
                      <span className="text-[10px] leading-relaxed text-zinc-500">
                        {option.blurb}
                      </span>
                    </button>
                  );
                })}
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
                Provisioning Mandala…
              </>
            ) : (
              <>
                Initialize Mandala
                <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </button>

          <p className="mt-4 text-center font-mono text-[9px] tracking-wide text-zinc-600">
            This action can only run once. The account is stored in backend/db/mandala.db.
          </p>
        </form>
      </div>
    </div>
  );
};

export default Setup;

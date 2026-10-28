---
slug: fix-auth-router-mounting
status: approved-for-execution
intent: clear
pending-action: write .omo/plans/fix-auth-router-mounting.md
approach: Fix the backend import paths so FastAPI boots from the repo root, initialize the SQLite schema on startup, declare the auth dependencies, add router + live-boot verification, and mount the existing AuthGuard so the setup/login flow is reachable.
---

# Draft: fix-auth-router-mounting

## Components (topology ledger)
<!-- id | outcome (one line) | status: active|deferred | evidence path -->
- boot-and-router-wiring | FastAPI imports cleanly and mounts `/api/auth` + `/api/tasks` from the repo root | active | `main-api.py:30-31,48-49`, `backend/routers/auth.py:26-34`, `backend/routers/task.py:3`
- database-bootstrap | `backend/db/mandala.db` is created from `schema.sql` on startup, idempotently | active | `backend/db/mandala.db` (0 bytes), `backend/db/schema.sql`, `backend/database.py` (0 bytes)
- dependency-contract | Runtime and test dependencies are declared and installable from a clean environment | active | `requirements.txt`
- auth-route-tests | Pytest proves status/setup/login/me/logout/task-history contracts against a temp DB | active | `tests/`
- live-boot-smoke | A real `python main-api.py` process serves the auth endpoints on a temp port/DB | active | `tests/smoke_auth_live.py` (new)
- frontend-entry | `AuthGuard` wraps the app so Setup/Login are actually reachable | active | `src/main.tsx`, `src/components/AuthGuard.tsx`
- repo-hygiene | No committed `.pyc`; runtime SQLite DB is ignored, schema remains tracked | active | `.gitignore`, `backend/__pycache__`, `backend/routers/__pycache__`

## Open assumptions (announced defaults)
<!-- assumption | adopted default | rationale | reversible? -->
- Import style | Use fully-qualified `backend.*` imports in `main-api.py` and both routers; no `sys.path` hacks | `python main-api.py` puts the repo root on `sys.path`; this matches the existing `backend.telemetry/runtime/copilot_agent` imports | yes
- DB bootstrap | FastAPI `lifespan` calls `initialize_database()` from `backend/database.py` | Runs under `python main-api.py` and `uvicorn`; `schema.sql` is idempotent (`IF NOT EXISTS` / `INSERT OR IGNORE`) | yes
- Test isolation | `MANDALA_DB_PATH` env override + temp DB for tests/smoke | Avoids mutating the user's real DB and allows repeatable QA | yes
- Frontend wiring | Mount the existing `AuthGuard` in `src/main.tsx` | The same commit shipped `Setup.tsx`/`Login.tsx`/`AuthGuard.tsx` but never mounted them, so the endpoints are unreachable from the UI | yes
- Test strategy | Tests-after: pytest router tests + a standalone live-boot smoke script | Unit tests cover contracts; the smoke test covers the exact bug (app fails to boot) | yes

## Findings (cited - path:lines)
- `main-api.py:30` imports `backend.routers.auth`; `backend/routers/auth.py:26-34` imports bare `from security import ...`, so the app raises `ModuleNotFoundError: No module named 'security'` before `include_router` runs.
- `main-api.py:31` imports `from routers.tasks import task_router`; there is no top-level `routers` package and the real module is `backend/routers/task.py` (singular, exposes `task_router`). Reproduced: `ModuleNotFoundError: No module named 'routers'`.
- `backend/routers/task.py:3` also uses bare `from security import DB_PATH, get_current_user`.
- `backend/routers/auth.py:36` prefix `/api/auth`; `backend/routers/task.py:5` prefix `/api/tasks`; both are included at `main-api.py:48-49`.
- `backend/db/mandala.db` is 0 bytes and has no tables; `backend/db/schema.sql` is valid (creates `users`, `system_config`, `task_history`), but no code executes it and `backend/database.py` is empty.
- `requirements.txt` lacks `aiosqlite`, `passlib`, `bcrypt`, `PyJWT` (all imported by `backend/routers/auth.py` / `backend/security.py`) and lacks `pytest`/`httpx` used by the test suite.
- `src/main.tsx:1-10` renders `<App />` directly; `AuthGuard` is imported nowhere. `src/components/AuthGuard.tsx:31-114` already implements checking/onboarding/login/authenticated/offline stages.
- `src/lib/api.ts:56-79` returns direct 2xx/4xx responses but falls through to a relative fetch on 5xx, which can mask a backend error as an Express 404.
- `main-api.py:14` and `main-api.py:25-28` import `parse_rocm_smi` twice and never use it.
- Committed `backend/__pycache__/security.cpython-313.pyc` and `backend/routers/__pycache__/auth.cpython-313.pyc`; `.gitignore` has no Python cache rule.
- Baseline: `python -m pytest -q` → 14 passed.

## Decisions (with rationale)
- Standardize on `backend.*` absolute imports; keep the existing router objects, prefixes, and endpoint logic unchanged.
- Bootstrap the DB through a FastAPI lifespan in `main-api.py`; keep the schema as the single source of truth and do not add a migration framework.
- Add `MANDALA_DB_PATH` (and `MANDALA_PORT`) env overrides so tests and the live smoke never touch the real database or port 8000.
- Keep auth/security behavior untouched: bcrypt hashing, JWT cookie, `SameSite=Strict`, and the single-admin rule stay as-is.
- Mount the existing AuthGuard rather than adding a router library; the component already owns the five auth stages.
- Return configured-backend HTTP responses (including 5xx) from `fetchWithBackendFallback`; only network failures should fall back, so auth errors surface truthfully.

## Scope IN
- Fix `main-api.py`, `backend/routers/auth.py`, and `backend/routers/task.py` imports so the app boots.
- Initialize `backend/db/mandala.db` from `backend/db/schema.sql` at startup, idempotently.
- Add runtime and development dependency declarations.
- Add pytest coverage for the auth and task routers with an isolated temp DB.
- Add a live boot smoke test that starts `python main-api.py` and exercises the real HTTP endpoints.
- Mount `AuthGuard` in `src/main.tsx` and make backend 5xx responses visible to the UI.
- Remove committed `.pyc` files and ignore runtime SQLite files.

## Scope OUT (Must NOT have)
- No changes to password hashing, JWT format, cookie flags, or the single-administrator rule.
- No new auth features (registration, OAuth, multi-user, password reset, roles).
- No migration framework, ORM, or schema redesign; `schema.sql` stays authoritative.
- No CORS redesign, TLS/HTTPS setup, or production secret management.
- No changes to telemetry, Triton execution, Copilot, or unrelated frontend components.
- No `sys.path` mutation, router renaming, or prefix changes.

## Open questions
- None. The user approved the fix-plan request; remaining choices are recorded as announced defaults above.

## Approval gate
status: approved-for-execution
approved-by: user ("Yeah, you can do that now talos, give me your best.")
next-action: Execute `.omo/plans/fix-auth-router-mounting.md` after the user explicitly starts work.

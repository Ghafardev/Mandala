# fix-auth-router-mounting - Work Plan

## TL;DR (For humans)
<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** Your backend will actually start, and the local setup/login API will be live. The dashboard will open on a first-run setup screen, sign you in, and protect the task-history endpoint.

**Why this approach:** The app was crashing on a bad import before it could ever register the auth routes, and the database file was an empty placeholder. The plan fixes the import paths, creates the schema on boot, and connects the already-written auth screens — without rewriting authentication.

**What it will NOT do:** No new login features, no changes to password/cookie security, no database migration framework, and no unrelated GPU/Copilot changes.

**Effort:** Medium
**Risk:** Low - changes are limited to wiring, imports, and database bootstrap; auth logic is untouched.
**Decisions to sanity-check:** Package-safe imports; schema bootstrapped on startup; auth screens mounted in the app shell; tests use a temporary database and port.

Your next move: approve and start work, or run a high-accuracy Sentinel review first. Full execution detail follows below.

---

> TL;DR (machine): Medium, low risk: fix boot-blocking imports, bootstrap the SQLite schema, declare dependencies, add pytest + live-boot smoke, and mount AuthGuard.

## Scope
### Must have
- `python main-api.py` starts from the repository root with no `ModuleNotFoundError`; the FastAPI app exposes `/api/auth/status`, `/api/auth/setup`, `/api/auth/login`, `/api/auth/me`, `/api/auth/logout`, and `/api/tasks/history`.
- `backend/db/mandala.db` is created from `backend/db/schema.sql` on startup, idempotently (safe to run on every boot and on an existing DB).
- `requirements.txt` declares every runtime package the auth path imports; test dependencies are declared separately.
- A fresh clone can run the auth flow (status -> setup -> login -> me -> logout) without manual DB setup.
- `AuthGuard` is mounted in `src/main.tsx` so the existing Setup/Login screens are reachable, and backend 5xx responses are not masked by the fallback transport.
- No committed `.pyc` files; the runtime SQLite DB is ignored while `schema.sql` stays tracked.
- Automated verification exists for both the router contracts and the real boot path.

### Must NOT have (guardrails, anti-slop, scope boundaries)
- No changes to password hashing, JWT format/claims, cookie flags (`HttpOnly`, `SameSite=Strict`, `secure=False`), or the single-administrator rule.
- No new auth features: registration, OAuth/social login, multi-user roles, password reset, email verification, or rate limiting.
- No migration framework, ORM, or schema redesign; `backend/db/schema.sql` remains the single source of truth.
- No `sys.path` mutation, router renaming, prefix changes, or duplicate router declarations.
- No CORS/TLS/production-secret redesign; no changes to telemetry, Triton execution, Copilot, or unrelated UI components.
- No deletion of `backend/db/schema.sql`, source files, or the user's local database contents.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: tests-after with `pytest` 9 + FastAPI `TestClient` (`httpx`) for router contracts, plus a standalone live-boot smoke script that starts the real `python main-api.py` process.
- Evidence: `.omo/evidence/task-<N>-fix-auth-router-mounting.<ext>` (`.txt` for command output, `.png` only if a browser check is used).
- All commands run from `C:\Users\Administrator\Documents\Mandala.AI`; use `.venv\Scripts\python.exe` if the venv is not activated.
- Baseline to preserve: `python -m pytest -q` is currently `14 passed`; it must be `14 + new` after this plan.

## Execution strategy
### Parallel execution waves
> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.
- Wave 1: Todo 1 (imports/boot), Todo 3 (dependency declarations).
- Wave 2: Todo 2 (DB bootstrap), Todo 6 (frontend entry + 5xx transport).
- Wave 3: Todo 4 (router tests), Todo 5 (live boot smoke), Todo 7 (repo hygiene).
- Final wave: F1-F4 (all must APPROVE).

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | none | 2, 4, 5, 6, 7 | 3 |
| 2 | 1 | 4, 5 | 3, 6 |
| 3 | none | 4, 5 | 1, 2, 6 |
| 4 | 1, 2, 3 | final | 5, 7 |
| 5 | 1, 2, 3 | final | 4, 7 |
| 6 | 1 | final | 2, 3, 7 |
| 7 | 1, 2, 4, 5, 6 | final | none |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->
- [x] 1. Fix package imports so the FastAPI app boots and both routers mount.
  What to do / Must NOT do: In `main-api.py`, keep `from backend.routers.auth import router as auth_router` at line 30 and replace line 31 `from routers.tasks import task_router` with `from backend.routers.task import task_router`; keep `app.include_router(auth_router)` and `app.include_router(task_router)` at lines 48-49. In `backend/routers/auth.py`, replace the `from security import (...)` block at lines 26-34 with `from backend.security import (...)`. In `backend/routers/task.py`, replace line 3 `from security import DB_PATH, get_current_user` with `from backend.security import DB_PATH, get_current_user`. Remove the duplicate, unused `parse_rocm_smi` import at `main-api.py:14` and the try/except at `main-api.py:25-28` (grep confirms it is referenced nowhere else). Do NOT add `sys.path` hacks, rename `task.py`, change router prefixes, reorder router includes, or touch endpoint bodies.
  Parallelization: Wave 1 | Blocked by: none | Blocks: 2, 4, 5, 6, 7.
  References (executor has NO interview context - be exhaustive): `main-api.py:1-49`; `backend/routers/auth.py:1-40`; `backend/routers/task.py:1-14`; `backend/security.py:1-40`; `backend/telemetry.py` (for `parse_rocm_smi`). Current failure reproduced: `python main-api.py` -> `File "main-api.py", line 30 ... File "backend/routers/auth.py", line 26 ... ModuleNotFoundError: No module named 'security'`; `from routers.tasks import task_router` -> `ModuleNotFoundError: No module named 'routers'`.
  Acceptance criteria (agent-executable): `python -c "from backend.routers.auth import router; from backend.routers.task import task_router; print(router.prefix, task_router.prefix)"` prints `/api/auth /api/tasks`. `python -c "import importlib.util as u; s=u.spec_from_file_location('main_api','main-api.py'); m=u.module_from_spec(s); s.loader.exec_module(m); print('APP_OK', len(m.app.routes))"` prints `APP_OK <n>` with `n > 0` and no traceback; allow up to 60s for this command because `pydantic_ai` import alone measured ~10s on this host. `python -m pytest -q` still reports `14 passed` (no regression).
  QA scenarios (name the exact tool + invocation): happy - run both acceptance commands and capture stdout to `.omo/evidence/task-1-fix-auth-router-mounting.txt`. failure - run `Select-String -Path backend/routers/auth.py,backend/routers/task.py -Pattern '^from security import'` and confirm zero matches; run `python -m pytest -q` and confirm exit code 0. Evidence `.omo/evidence/task-1-fix-auth-router-mounting.txt`.
  Commit: Y | fix(api): mount auth and task routers with package-safe imports

- [x] 2. Bootstrap the SQLite schema on startup and make the DB path/port overridable.
  What to do / Must NOT do: Implement `backend/database.py` (currently 0 bytes) with `SCHEMA_PATH = Path(__file__).resolve().parent / "db" / "schema.sql"` and `def initialize_database(db_path: str | None = None) -> None:` that creates the parent directory, opens `sqlite3.connect(target)`, runs `connection.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))`, and commits. It must be idempotent because `schema.sql` uses `CREATE TABLE IF NOT EXISTS` / `INSERT OR IGNORE`. In `backend/security.py:73`, change the DB path to `DB_PATH = os.getenv("MANDALA_DB_PATH", str(BACKEND_DIR / "db" / "mandala.db"))`. In `main-api.py`, add `import os`, `from contextlib import asynccontextmanager`, and `from backend.database import initialize_database`; define `@asynccontextmanager async def lifespan(_: FastAPI): await asyncio.to_thread(initialize_database); yield` before the `FastAPI(...)` call and pass `lifespan=lifespan`; change the `uvicorn.run(...)` port to `int(os.getenv("MANDALA_PORT", "8000"))`. Add `tests/test_database.py` that calls `initialize_database(str(tmp_path / "nested" / "mandala.db"))` twice and asserts the set of tables contains `users`, `system_config`, `task_history`. Do NOT drop/alter existing tables, add a migration framework, or change `schema.sql` semantics.
  Parallelization: Wave 2 | Blocked by: 1 | Blocks: 4, 5.
  References (executor has NO interview context - be exhaustive): `backend/database.py` (0 bytes); `backend/db/schema.sql:1-40`; `backend/security.py:66-74`; `main-api.py:1-12,33-49,300-302`; `tests/test_runtime.py` / `tests/test_telemetry.py` for pytest style; `backend/routers/auth.py:26-34,124,153,212` and `backend/routers/task.py:3,10` (both consume `DB_PATH`). Verified failure: `backend/db/mandala.db` is 0 bytes and `sqlite_master` is empty; `backend/database.py` is empty; no `executescript`/`lifespan` exists in the repo.
  Acceptance criteria (agent-executable): `python -m pytest tests/test_database.py -q` passes. `python -c "import tempfile, pathlib; from backend.database import initialize_database; p=str(pathlib.Path(tempfile.mkdtemp())/'t.db'); initialize_database(p); initialize_database(p); print('DB_OK')"` prints `DB_OK`. With `MANDALA_DB_PATH` set before import, `python -c "from backend.security import DB_PATH; print(DB_PATH)"` prints that path.
  QA scenarios (name the exact tool + invocation): happy - `python -m pytest tests/test_database.py -q` and the idempotency command, captured to `.omo/evidence/task-2-fix-auth-router-mounting.txt`. failure - create a temp DB, run `initialize_database` twice, then assert `SELECT COUNT(*) FROM users` is still 0 (no duplicate setup/seed corruption); assert a missing `schema.sql` raises `FileNotFoundError` (rename is NOT allowed in the test - monkeypatch `backend.database.SCHEMA_PATH` to a missing path instead). Evidence `.omo/evidence/task-2-fix-auth-router-mounting.txt`.
  Commit: Y | feat(db): bootstrap sqlite schema on FastAPI startup

- [x] 3. Declare runtime and development dependencies for the auth path.
  What to do / Must NOT do: Append to `requirements.txt`: `aiosqlite>=0.20.0`, `passlib[bcrypt]>=1.7.4`, `bcrypt>=4.1.0`, `PyJWT>=2.8.0` (these are imported by `backend/routers/auth.py`, `backend/routers/task.py`, and `backend/security.py`). Create `requirements-dev.txt` containing `-r requirements.txt`, `pytest>=8.0.0`, and `httpx>=0.27.0` (FastAPI `TestClient` needs httpx). Do NOT pin exact versions that conflict with the installed stack, add unused packages, or remove existing pins.
  Parallelization: Wave 1 | Blocked by: none | Blocks: 4, 5.
  References (executor has NO interview context - be exhaustive): `requirements.txt:1-9`; `backend/routers/auth.py:19-34`; `backend/routers/task.py:1-3`; `backend/security.py:18-29`; installed versions for sanity: starlette 1.6.0, fastapi 0.141.1, httpx 0.28.1, pytest 9.1.1.
  Acceptance criteria (agent-executable): `python -c "import aiosqlite, passlib, bcrypt, jwt, httpx, pytest; print('DEPS_OK')"` prints `DEPS_OK`. `python -m pip install --dry-run -r requirements-dev.txt` exits 0 (or `python -m pip install -r requirements-dev.txt` when the venv is disposable). `python -m pip check` reports no broken requirements.
  QA scenarios (name the exact tool + invocation): happy - run the import check and `pip check`, capture to `.omo/evidence/task-3-fix-auth-router-mounting.txt`. failure - run `python -m pip install --dry-run -r requirements-dev.txt` in a clean temp venv (or with `--ignore-installed --dry-run`) and confirm it resolves; if the network is unavailable, record that fact and keep the exact command in evidence rather than claiming success. Evidence `.omo/evidence/task-3-fix-auth-router-mounting.txt`.
  Commit: Y | chore(deps): declare auth and test dependencies

- [x] 4. Add pytest coverage for the auth and task-history router contracts.
  What to do / Must NOT do: Create `tests/test_auth_routes.py`. Build a fixture that creates a temp DB with `initialize_database(str(tmp_path / "auth-test.db"))`, monkeypatches `backend.routers.auth.DB_PATH` and `backend.routers.task.DB_PATH` to that path, constructs `FastAPI()`, includes `auth_module.router` and `task_module.task_router`, and returns `TestClient(app)`. Do NOT import `main-api.py` (hyphenated filename), touch `backend/db/mandala.db`, or change endpoint behavior. Tests must cover: status on a fresh DB (`200`, `is_setup_completed=false`, `requires_onboarding=true`); setup success (`201`, cookie `mandala_session` set, `GET /api/auth/me` `200`); duplicate setup (`400`); login with bad password (`401`) and good password (`200`, cookie set); `me` without cookie (`401`); logout (`200`, then `me` `401`); `GET /api/tasks/history` without cookie (`401`) and with the setup cookie (`200`, JSON list `[]`); setup with an 8-character-minimum violation (`422`).
  Parallelization: Wave 3 | Blocked by: 1, 2, 3 | Blocks: final.
  References (executor has NO interview context - be exhaustive): `backend/routers/auth.py:36-252` (all five endpoints and the `SetupRequest`/`LoginRequest` validators); `backend/routers/task.py:1-14`; `backend/security.py:73,84-86,140-172`; `backend/db/schema.sql:1-40`; `tests/test_runtime.py` / `tests/test_telemetry.py` (Given/When/Then style); `fastapi.testclient.TestClient` docs.
  Acceptance criteria (agent-executable): `python -m pytest tests/test_auth_routes.py -q` passes all tests. `python -m pytest -q` passes the existing 14 tests plus the new ones. The test run must show zero references to `backend/db/mandala.db` in the failure output.
  QA scenarios (name the exact tool + invocation): happy - `python -m pytest tests/test_auth_routes.py -q` and `python -m pytest -q`, capture to `.omo/evidence/task-4-fix-auth-router-mounting.txt`. failure - intentionally run one test with a wrong expected status (or `-k bad_password`) and confirm the assertion fails for the intended reason, then revert; record that `401`/`400`/`422` paths are asserted, not just `200`. Evidence `.omo/evidence/task-4-fix-auth-router-mounting.txt`.
  Commit: Y | test(auth): cover setup, login, session, and task-history contracts

- [x] 5. Add a live boot smoke test for the real `python main-api.py` process.
  What to do / Must NOT do: Create `tests/smoke_auth_live.py` (standalone, not collected by pytest unless named `test_*`). It must create a temp DB, set `MANDALA_DB_PATH` and `MANDALA_PORT=8123` in the child environment, start `subprocess.Popen([sys.executable, "main-api.py"], cwd=repo_root, env=env, stdout=..., stderr=...)`, poll `http://127.0.0.1:8123/api/auth/status` with `httpx` for up to 60s (first startup imports `pydantic_ai`, measured ~10s on this host), then run the full flow with one `httpx.Client` (cookies persist): status `200`/`requires_onboarding=true`; setup `201`; status now `is_setup_completed=true`; `me` `200`; `tasks/history` `200`; `logout` `200`; `me` `401`; bad login `401`; good login `200`. On timeout, print the captured child stdout/stderr before failing. Always terminate and `wait(timeout=10)` the child in a `finally` block, and kill it if it does not exit. Do NOT use port 8000, the real DB, or leave orphan processes.
  Parallelization: Wave 3 | Blocked by: 1, 2, 3 | Blocks: final.
  References (executor has NO interview context - be exhaustive): `main-api.py:300-302` (uvicorn entry point); `backend/security.py:73` (`MANDALA_DB_PATH` after Todo 2); `backend/routers/auth.py:121-252`; `backend/routers/task.py:7-14`; `src/lib/api.ts:1-4` (expected local origin); baseline bug reproduction in the draft.
  Acceptance criteria (agent-executable): `python tests/smoke_auth_live.py` prints `LIVE AUTH SMOKE: PASS`, exits 0, and leaves no process listening on 8123 (`Get-NetTCPConnection -LocalPort 8123` returns nothing). Child stdout/stderr are captured to `.omo/evidence/task-5-fix-auth-router-mounting-server.log`.
  QA scenarios (name the exact tool + invocation): happy - `python tests/smoke_auth_live.py`, capture stdout to `.omo/evidence/task-5-fix-auth-router-mounting.txt`. failure - temporarily set `MANDALA_PORT` to an already-occupied port and confirm the script fails fast with a clear message (then rerun on the free port); also assert the pre-setup `me` is `401` and post-logout `me` is `401`. Evidence `.omo/evidence/task-5-fix-auth-router-mounting.txt`.
  Commit: Y | test(auth): add live boot smoke for the mounted endpoints

- [x] 6. Mount `AuthGuard` and stop masking backend 5xx responses.
  What to do / Must NOT do: In `src/main.tsx`, import `{ AuthGuard } from './components/AuthGuard'` and render `<AuthGuard><App /></AuthGuard>` inside `React.StrictMode`. In `src/lib/api.ts:56-79`, change `fetchWithBackendFallback` so it returns the configured backend response for any HTTP status (including 4xx/5xx) and falls back to the relative `fetch(endpoint, options)` only when the configured-backend fetch throws (network error/abort); keep the existing 2s `AbortController` and `clearTimeout` behavior (`finally`). Do NOT edit `AuthGuard.tsx`, `Setup.tsx`, `Login.tsx`, add a router library, or change `DEFAULT_BACKEND_URL`.
  Parallelization: Wave 2 | Blocked by: 1 | Blocks: final.
  References (executor has NO interview context - be exhaustive): `src/main.tsx:1-10`; `src/components/AuthGuard.tsx:31-114` (checking/onboarding/login/authenticated/offline); `src/pages/Setup.tsx:121-134` and `src/pages/Login.tsx:86-97` (`credentials: 'include'`); `src/lib/api.ts:1-16,56-79`; `backend/routers/auth.py:74-82` (cookie flags).
  Acceptance criteria (agent-executable): `npm run lint` (`tsc --noEmit`) exits 0. `npm run build` exits 0. `Select-String -Path src/main.tsx -Pattern "AuthGuard"` shows both the import and the wrapper. `Select-String -Path src/lib/api.ts -Pattern "directRes"` shows no status-based early return remains.
  QA scenarios (name the exact tool + invocation): happy - `npm run lint` and `npm run build`, capture to `.omo/evidence/task-6-fix-auth-router-mounting.txt`. failure - run `npm run dev` with no backend on 8000 and confirm the UI renders the `BackendUnavailableScreen` ("http://localhost:8000") instead of the dashboard; with the backend running and no admin, confirm the Setup screen renders. Evidence `.omo/evidence/task-6-fix-auth-router-mounting.txt` plus a screenshot `.omo/evidence/task-6-fix-auth-router-mounting.png` if Playwright is used.
  Commit: Y | feat(ui): gate the app with the existing auth guard

- [x] 7. Stop tracking Python caches and the runtime SQLite database.
  What to do / Must NOT do: Run `git rm --cached backend/__pycache__/security.cpython-313.pyc backend/routers/__pycache__/auth.cpython-313.pyc backend/db/mandala.db` (this keeps the local files). Append to `.gitignore`: `__pycache__/`, `*.py[cod]`, and `backend/db/*.db`. Keep `backend/db/schema.sql` tracked. Do NOT delete source files, the local DB, or `schema.sql`; do NOT rewrite the existing `.gitignore` lines.
  Parallelization: Wave 3 | Blocked by: 1, 2, 4, 5, 6 | Blocks: final.
  References (executor has NO interview context - be exhaustive): `.gitignore:1-7`; `git ls-files backend/__pycache__ backend/routers/__pycache__ backend/db`; `.omo/drafts/fix-auth-router-mounting.md` findings.
  Acceptance criteria (agent-executable): `git check-ignore -v backend/db/mandala.db backend/__pycache__/security.cpython-313.pyc` prints both paths. `git ls-files "*.pyc" "backend/db/*.db"` prints nothing. `git status --short` no longer lists `.pyc` or `backend/db/mandala.db` as tracked changes.
  QA scenarios (name the exact tool + invocation): happy - run the three commands above, capture to `.omo/evidence/task-7-fix-auth-router-mounting.txt`. failure - confirm `git ls-files backend/db/schema.sql` still returns the schema (it must NOT be ignored), and `Test-Path backend/db/mandala.db` is still `True` after `git rm --cached`. Evidence `.omo/evidence/task-7-fix-auth-router-mounting.txt`.
  Commit: Y | chore(repo): ignore python caches and the runtime sqlite db

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance audit - re-read this plan and confirm every todo's "What to do" and "Must NOT do" was obeyed, every acceptance command was actually run, and every evidence file exists and is non-empty. Reject self-reported success without command output. Evidence `.omo/evidence/f1-fix-auth-router-mounting.txt`.
- [ ] F2. Code quality review - inspect the final diff for bare `from security import`, duplicate `parse_rocm_smi`, `sys.path` hacks, unused imports, non-idempotent SQL, hard-coded absolute paths, and any auth-logic change. Confirm `python -m pytest -q` and `python tests/smoke_auth_live.py` both pass from a clean shell. Evidence `.omo/evidence/f2-fix-auth-router-mounting.txt`.
- [ ] F3. Real manual QA - start `python main-api.py` with `MANDALA_DB_PATH` pointed at a temp DB, then use a real browser (`npm run dev` + Playwright) to verify: first boot shows Setup, setup succeeds, the dashboard renders, logout returns to Login, and a stopped backend shows `BackendUnavailableScreen` rather than the dashboard. Also `curl`/`Invoke-RestMethod` each endpoint. Evidence `.omo/evidence/f3-fix-auth-router-mounting/`.
- [ ] F4. Scope fidelity - verify the diff touches only `main-api.py`, `backend/database.py`, `backend/security.py` (DB path line only), `backend/routers/auth.py` (import block only), `backend/routers/task.py` (import line only), `requirements.txt`, `requirements-dev.txt`, `tests/test_database.py`, `tests/test_auth_routes.py`, `tests/smoke_auth_live.py`, `src/main.tsx`, `src/lib/api.ts` (transport function only), and `.gitignore`. Confirm no changes to auth behavior, telemetry, Triton, Copilot, or unrelated UI. Evidence `.omo/evidence/f4-fix-auth-router-mounting.txt`.

## Commit strategy
- One commit per todo, in dependency order: `fix(api)` -> `feat(db)` -> `chore(deps)` -> `test(auth)` -> `test(auth)` -> `feat(ui)` -> `chore(repo)`.
- Stage only the files named in each todo; never `git add -A`.
- The plan/draft artifacts under `.omo/plans/` and `.omo/drafts/` are committed with the final `chore(repo)` commit, matching the repository's existing tracked `.omo` state. Evidence files under `.omo/evidence/` stay local unless the user asks to commit them.
- Do not amend or rewrite the two existing commits (`71463c9`, `1553f48`); add new commits on top.
- If a hook rejects a commit, fix the issue and add a new commit; do not bypass hooks.

## Success criteria
- `python main-api.py` starts from the repo root and logs a listening Uvicorn server with no import error.
- On a fresh temp DB: `GET /api/auth/status` -> `200` with `requires_onboarding=true`; `POST /api/auth/setup` -> `201` and sets `mandala_session`; repeat setup -> `400`; bad login -> `401`; good login -> `200`; `GET /api/auth/me` -> `200` with cookie and `401` without; `POST /api/auth/logout` -> `200`; `GET /api/tasks/history` -> `401` unauthenticated and `200` with a list when authenticated.
- `python -m pytest -q` passes all tests (existing 14 + new database/router tests).
- `python tests/smoke_auth_live.py` prints `LIVE AUTH SMOKE: PASS` and leaves no orphan process.
- `npm run lint` and `npm run build` pass, and `AuthGuard` wraps `<App />` in `src/main.tsx`.
- `git ls-files "*.pyc" "backend/db/*.db"` returns nothing; `backend/db/schema.sql` remains tracked.
- No auth/security logic changed; no new auth features; no changes outside the files listed in F4.

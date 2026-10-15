# mandala-real-rocm-backend - Work Plan

## TL;DR (For humans)
<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** The dashboard will call a real FastAPI GPU backend that reports actual device capability, executes supported Triton kernels, measures elapsed time, and checks results against PyTorch. It will also report honest telemetry and actionable unavailable-runtime states on machines without a supported GPU stack.

**Why this approach:** Python is the only layer that can own PyTorch, Triton, ROCm, CUDA, HIP, and hardware telemetry consistently. The current GUI contract is preserved through a typed adapter instead of rewriting the dashboard.

**What it will NOT do:** It will not execute arbitrary user-provided code, claim that Colab's NVIDIA GPU validates ROCm, or retain simulated measurements as real results.

**Effort:** Large
**Risk:** High - real GPU execution depends on host-specific ROCm/CUDA/Triton compatibility.
**Decisions to sanity-check:** Implement a controlled vector-add and GEMM kernel suite first; custom source execution remains disabled until it has a sandbox.

Your next move: run the documented Colab CUDA and AMD ROCm smoke procedures after implementation. Full execution detail follows below.

---

> TL;DR (machine): Large, high-risk hardware integration; replace simulated GPU responses with typed real-runtime execution, telemetry, contract wiring, tests, and reproducible CUDA/ROCm validation.

## Scope
### Must have
- One typed Python API contract for capability/health, compile-and-run, telemetry, and Copilot response compatibility.
- Real Triton vector-add and GEMM execution when Triton plus an eligible GPU backend are available.
- Actual timing, synchronization, Torch-reference verification, and structured runtime failures.
- Normalized ROCm/CUDA telemetry and WebSocket transport without fabricated GPU data.
- Frontend transport configuration and fallback behavior that route the existing GUI to FastAPI.
- CPU-only contract tests plus reproducible CUDA Colab and AMD ROCm notebook smoke procedures.
### Must NOT have (guardrails, anti-slop, scope boundaries)
- No arbitrary custom source execution, synthetic metrics presented as real, or simulated telemetry presented as hardware data.
- No dashboard redesign, multi-tenant deployment platform, or claim that CUDA validates ROCm behavior.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: TDD with `pytest` for Python unit/API contracts; Vite build and live HTTP/WebSocket smoke checks for integration.
- Evidence: `.omo/evidence/task-<N>-mandala-real-rocm-backend.<ext>`.

## Execution strategy
### Parallel execution waves
- Wave 1: runtime models/capabilities, real kernel execution, normalized telemetry.
- Wave 2: FastAPI routes/configuration, frontend transport adapter, test suite, documentation/notebook qualification.
- Wave 3: integrated API/build/manual QA and final independent review.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | none | 2, 4, 6 | 3 |
| 2 | 1 | 4, 6 | 3 |
| 3 | none | 4, 6 | 1 |
| 4 | 1, 2, 3 | 5, 6, 7 | none |
| 5 | 4 | 7 | 6 |
| 6 | 2, 3, 4 | 7 | 5 |
| 7 | 4, 5, 6 | 8 | none |
| 8 | 7 | final wave | none |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->
- [ ] 1. Define typed runtime capability and API result models.
  What to do / Must NOT do: Add a small Python schema/runtime module that represents available, unavailable, and failed GPU execution without untyped dictionaries; do not add a custom-code execution field.
  Parallelization: Wave 1 | Blocked by: none | Blocks: 2, 4, 6.
  References: `main-api.py:43-64`, `backend/triton_compiler.py:9-25`, `src/types.ts:43-105`.
  Acceptance criteria: CPU-only import reports a typed non-ready capability; valid and invalid compile requests serialize through Pydantic without fabricated GPU fields.
  QA scenarios: `pytest -q tests/test_runtime.py`; failure case invokes an unsupported kernel request and asserts the typed rejection. Evidence `.omo/evidence/task-1-mandala-real-rocm-backend.txt`.
  Commit: N | feat(runtime): add typed capability contract.
- [ ] 2. Replace simulated kernel metrics with real controlled Triton vector-add and GEMM execution.
  What to do / Must NOT do: Implement active-device detection, fixed `@triton.jit` kernels, tensor allocation, warmup, synchronization/event timing, and Torch-reference validation; reject unsupported kernels and CPU execution; do not fabricate ISA, throughput, verification, or compiler logs.
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 4, 6.
  References: `backend/triton_compiler.py:26-220`, `triton_kernel_dev.ipynb` cells for active device, vector-add, `torch.cuda.Event`, and `torch.cuda.synchronize`.
  Acceptance criteria: a GPU-ready host returns real elapsed timing and `torch.allclose` result for vector-add and GEMM; CPU-only hosts return an explicit non-success runtime state.
  QA scenarios: `pytest -q tests/test_triton_compiler.py`; live `curl`/`Invoke-RestMethod` compile request on CPU must not report success; GPU smoke runs 128x128 request. Evidence `.omo/evidence/task-2-mandala-real-rocm-backend.txt`.
  Commit: N | feat(execution): run and verify controlled Triton kernels.
- [ ] 3. Normalize real ROCm and CUDA telemetry without simulation fallbacks.
  What to do / Must NOT do: Build one normalized telemetry adapter from ROCm SMI or NVML, cache sampling off the event loop, and return explicit unavailable states; do not synthesize MI300X values when drivers are absent.
  Parallelization: Wave 1 | Blocked by: none | Blocks: 4, 6.
  References: `backend/telemetry.py:12-143`, `main-api.py:64-176`, `src/types.ts:84-105`.
  Acceptance criteria: telemetry response matches `TelemetryPayload`; missing CLI/library produces `detected=false`, `is_emulated=false`, and diagnostic status.
  QA scenarios: `pytest -q tests/test_telemetry.py`; manual health request validates no fabricated GPU name in CPU-only environment. Evidence `.omo/evidence/task-3-mandala-real-rocm-backend.txt`.
  Commit: N | feat(telemetry): expose truthful normalized hardware samples.
- [ ] 4. Make FastAPI the authoritative, configured API and WebSocket backend.
  What to do / Must NOT do: Route health, compile/run, telemetry, and Copilot through typed FastAPI contracts; add environment-based CORS/origin and timeout configuration; return status codes and body shapes that distinguish invalid request, unavailable runtime, and runtime failure; do not retain Express as an alternative compute backend.
  Parallelization: Wave 2 | Blocked by: 1, 2, 3 | Blocks: 5, 6, 7.
  References: `main-api.py:24-281`, `backend/copilot_agent.py:50-143`, `server.ts:116-390`.
  Acceptance criteria: OpenAPI documents the responses; `/api/v1/health`, compile/run, `/ws/gpu-telemetry`, and Copilot conform to one schema family.
  QA scenarios: `pytest -q tests/test_api.py`; start uvicorn and execute HTTP plus WebSocket smoke tests. Evidence `.omo/evidence/task-4-mandala-real-rocm-backend.txt`.
  Commit: N | feat(api): make FastAPI the authoritative runtime service.
- [ ] 5. Rewire the active GUI transport to the authoritative Python backend.
  What to do / Must NOT do: Replace hard-coded ngrok behavior with configured backend selection, repair local WebSocket fallback, consume typed capability/errors, align Copilot history/response fields, and pass telemetry to the 3D view; do not redesign components or revive inactive legacy workflow code.
  Parallelization: Wave 2 | Blocked by: 4 | Blocks: 7.
  References: `src/lib/api.ts:1-160`, `src/App.tsx:9-91`, `src/components/NodeCanvas.tsx:360-411`, `src/components/CopilotSidebar.tsx:89-119`, `src/components/mandala3d/Mandala3DGraphView.tsx:36-149`.
  Acceptance criteria: configured FastAPI origin serves REST and WSS; unavailable capability is displayed as an error rather than success.
  QA scenarios: `npm run build`; browser/manual page run against local FastAPI and inspect a compile failure state on CPU. Evidence `.omo/evidence/task-5-mandala-real-rocm-backend.txt`.
  Commit: N | fix(frontend): use the real backend contract.
- [ ] 6. Add API and runtime regression coverage for real-versus-unavailable behavior.
  What to do / Must NOT do: Add tests for typed request validation, CPU/missing-dependency states, telemetry normalization, response contract, and simulated-data prohibition; mock only hardware boundaries.
  Parallelization: Wave 2 | Blocked by: 2, 3, 4 | Blocks: 7.
  References: all Wave 1/2 runtime modules; no existing tests are present.
  Acceptance criteria: every real-runtime claim has a CPU-testable contract; no test asserts generated prose or fake performance constants.
  QA scenarios: `pytest -q`; temporarily force a missing-runtime branch and verify its exact status response. Evidence `.omo/evidence/task-6-mandala-real-rocm-backend.txt`.
  Commit: N | test(api): cover real and unavailable runtime paths.
- [ ] 7. Document reproducible CUDA Colab and AMD ROCm qualification workflows.
  What to do / Must NOT do: Replace exposed tunnel credentials with environment/secret instructions; document version/capability checks, CUDA Colab expectations, AMD ROCm setup, real kernel smoke requests, telemetry checks, and HIPIFY compile/test separation; do not embed secrets or claim HIPIFY validates performance/correctness by itself.
  Parallelization: Wave 2 | Blocked by: 4, 5, 6 | Blocks: 8.
  References: `README.md:1`, `colab_setup_T4.ipynb:46-106`, AMD notebooks `Lab_3_Libraries_PyTorch`, `Lab_4_HIP_Programming_Porting`, `Lab_5-1_Performance_Optimization`, `Lab_5-2_Architecture_Microbenchmarks`, `Lab_5-3_Kernel_Tuning`, `triton_kernel_dev`.
  Acceptance criteria: docs contain copyable setup and verification commands for CPU, CUDA Colab, and AMD ROCm; no token-shaped secret remains in project notebooks/docs.
  QA scenarios: scan project documentation/notebooks for the old token; execute the CPU setup/check commands. Evidence `.omo/evidence/task-7-mandala-real-rocm-backend.txt`.
  Commit: N | docs(runtime): add reproducible GPU qualification guides.
- [ ] 8. Run integrated build and live API validation.
  What to do / Must NOT do: Run Python tests, TypeScript build, FastAPI live health/compile/WebSocket checks, and record CPU-only or hardware-ready evidence honestly; do not claim GPU execution without a GPU.
  Parallelization: Wave 3 | Blocked by: 7 | Blocks: final wave.
  References: `package.json:5-12`, `requirements.txt`, `main-api.py`, `src/lib/api.ts`.
  Acceptance criteria: changed-file diagnostics are clean, tests/build pass, and a live API request demonstrates the expected local runtime state.
  QA scenarios: run server on a temporary port, invoke health and compile routes, and close the process. Evidence `.omo/evidence/task-8-mandala-real-rocm-backend.txt`.
  Commit: N | chore(qa): record integrated runtime verification.

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance audit
- [ ] F2. Independent code quality and security review
- [ ] F3. Live API and GUI manual QA
- [ ] F4. Scope fidelity and reproducibility review

## Commit strategy
- Keep all changes uncommitted unless the user explicitly requests a commit.

## Success criteria
- A supported CUDA or ROCm host executes controlled Triton kernels and returns measured, verified results.
- An unsupported host truthfully returns an actionable typed non-success status with no synthetic GPU data.
- The existing GUI reaches FastAPI for REST/WSS and displays backend outcomes accurately.
- Test/build/manual smoke evidence and repeatable setup instructions exist for future comparison work.

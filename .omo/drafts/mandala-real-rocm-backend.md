---
slug: mandala-real-rocm-backend
status: approved-for-execution
intent: clear
review_required: true
pending-action: write .omo/plans/mandala-real-rocm-backend.md
approach: Replace the simulated Python compilation path with a real, typed kernel execution service while preserving the existing GUI payload shape through a versioned API adapter; make telemetry and backend selection truthful; qualify both CUDA/Colab and AMD/ROCm notebook paths with hardware-aware tests and explicit capability states.
---

# Draft: mandala-real-rocm-backend

## Components (topology ledger)
<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->
- api-contract | One canonical request/response schema consumed unchanged by the GUI and Python backend | active | `src/lib/api.ts`, `src/components/NodeCanvas.tsx`, `main-api.py:43-64`, `server.ts:141-298`
- execution-engine | Real PyTorch/Triton kernel dispatch, synchronization, correctness comparison, metrics, and truthful failures | active | `backend/triton_compiler.py:26-174`, `src/components/NodeCanvas.tsx:362-411`
- telemetry-transport | Cached hardware telemetry normalized into the frontend `TelemetryPayload` schema and streamed over WebSocket | active | `backend/telemetry.py:12-143`, `main-api.py:64-228`, `src/lib/api.ts:39-140`
- runtime-adapters | Explicit CUDA/Colab and AMD/ROCm capability detection with compatible install/run guidance | active | `main-api.py:156-191`, `colab_setup_T4.ipynb`, `requirements.txt`
- security-and-operations | Safe public-tunnel behavior, secret handling, request limits, timeouts, and actionable health/readiness reporting | active | `main-api.py:24-39`, `backend/copilot_agent.py:50-73`, `colab_setup_T4.ipynb:102-106`
- frontend-integration | Preserve the existing GUI while removing misleading simulated status and fixing disconnected backend paths | active | `src/App.tsx:9-75`, `src/components/CopilotSidebar.tsx:89-119`, `src/components/mandala3d/Mandala3DGraphView.tsx:106-149`

## Open assumptions (announced defaults)
<!-- Record any default you adopt instead of asking, so the user can veto it at the gate. -->
<!-- assumption | adopted default | rationale | reversible? -->
- Backend authority | FastAPI/Python becomes the only authoritative execution and telemetry backend; Express/TypeScript remains the GUI dev/static host and has no simulated GPU API behavior | Two independent backend contracts currently return incompatible shapes and synthetic results | yes
- Execution scope | Implement and qualify a fixed, safe kernel suite first (at least vector-add and GEMM/matmul); arbitrary `custom_code` execution is disabled or rejected until sandboxing exists | Executing caller-provided Python/Triton/HIP code through a public tunnel is a remote-code-execution boundary | yes, but requires an explicit security design
- Cross-platform truth | Colab/T4 is a real CUDA validation target, not a ROCm target; AMD notebook/host is the real ROCm qualification target, and the API reports the active backend instead of claiming MI300X on CUDA | PyTorch ROCm intentionally reuses `torch.cuda` interfaces, but Colab hardware is NVIDIA | yes
- AMD script integration | The supplied AMD official script will be treated as the reference for kernel semantics, HIP/HIPIFY commands, supported versions, and acceptance tests; no exact implementation is locked before it arrives | The current repository contains no authoritative AMD example and prior reports are evidence, not instructions | yes
- Review gate | Run a high-accuracy plan review before execution handoff because this is an architecture-scale, hardware-dependent change | Prevents a plan that passes simulated tests while failing on real ROCm/CUDA hosts | no

## Findings (cited - path:lines)
- `server.ts:46-113` generates synthetic MI300X telemetry; `server.ts:141-297` synthesizes compilation metrics and ISA text without invoking Triton or a GPU.
- `backend/triton_compiler.py:26-174` calculates a heuristic performance model and random numerical error; it does not allocate tensors, launch a Triton kernel, synchronize, or compare outputs.
- `main-api.py:237-249` routes the GUI to that simulated compiler, while `main-api.py:64-191` has separate ROCm/CUDA detection and telemetry formats.
- `backend/telemetry.py:12-143` can call `rocm-smi`, but the universal FastAPI telemetry path returns `{backend, vendor, data}` rather than the frontend's `{detected, is_emulated, driver, timestamp, gpus}` contract.
- `src/lib/api.ts:13-37` tries a hard-coded ngrok origin then relative fetch; `src/lib/api.ts:49-109` retries the same ngrok WebSocket URL rather than falling back to the local API.
- `src/components/CopilotSidebar.tsx:90-101` sends `history` and reads `response`; FastAPI expects `conversation_history` and returns `diagnosis` at `main-api.py:252-281`.
- `src/App.tsx:52-75` renders the active workflow and telemetry panel, but does not pass telemetry into the 3D view; `TelemetryDrawer` and the older node components are disconnected paths.
- `tsconfig.json` uses misspelled compiler option keys; `src/components/nodes/ExecutionNode.tsx:4` imports `TArgetArch`, which is not defined in `src/types.ts`.
- `main-api.py:24-39` enables wildcard CORS with credentials; `main-api.py:286-287` binds publicly; `colab_setup_T4.ipynb:102-106` contains a live ngrok token that must be revoked/rotated before any public testing.
- Prior reports correctly identify blocking telemetry calls, missing dependency/version pinning, local Ollama assumptions, and the risk of executing `custom_code`; their proposed changes are not yet implemented.
- AMD documentation confirms Triton-on-ROCm requires a compatible AMD GPU/ROCm stack and version matrix, and HIPIFY is translation rather than proof of correctness; HIPIFY output must be compiled and tested on the target. Sources: `https://rocm.docs.amd.com/projects/ai-developer-hub/en/v8.0/notebooks/gpu_dev_optimize/triton_kernel_dev.html`, `https://rocm.docs.amd.com/projects/HIPIFY/en/latest/index.html`, `https://docs.pytorch.org/docs/main/notes/hip.html`.

## Decisions (with rationale)
- The plan will define one versioned API contract for compile/run, health/capabilities, telemetry, and Copilot; both Python and frontend adapters must conform to it.
- Real execution will be observable: backend responses must include active backend/device, kernel identifier, actual launch status, synchronization/correctness result, measured timing, and structured error details; simulated values cannot be reported as SUCCESS.
- Verification will use real PyTorch tensors and real Triton/HIP execution where the platform supports it, with CPU or unavailable-backend states represented as explicit non-success capability results.
- Telemetry collection will be cached/backgrounded so WebSocket clients read the latest sample rather than each connection invoking blocking `rocm-smi`/NVML calls.
- The GUI surface remains in scope only for contract wiring and truthful status; visual redesign and unrelated legacy components are out of scope.

## Scope IN
- Replace simulated compile/run behavior with a real execution adapter and backend capability checks.
- Define and implement the shared JSON API schemas and error/status semantics.
- Normalize ROCm and CUDA telemetry to the GUI schema and stream it reliably.
- Fix endpoint selection, WebSocket fallback, Copilot response compatibility, and 3D telemetry wiring where required for the active GUI.
- Add deterministic unit, API/integration, and notebook/real-device smoke verification for CUDA Colab and AMD ROCm environments.
- Add runtime configuration for backend URL, CORS origins, AI endpoint, timeouts, and tunnel-safe secrets.
- Document prerequisites, supported version combinations, expected device access, and real-versus-unavailable behavior.

## Scope OUT (Must NOT have)
- No frontend redesign or rewrite of the existing dashboard.
- No arbitrary remote execution of user-submitted Python/Triton/HIP source without an explicit sandbox.
- No claim that NVIDIA Colab validates AMD ROCm behavior; it validates the CUDA-compatible adapter only.
- No requirement to make the 3D visualization itself a kernel compiler.
- No Kubernetes, Prometheus/Grafana, multi-tenant auth system, or production deployment platform unless the later AMD script or user request makes it necessary.
- No preservation of synthetic telemetry/benchmark numbers as if they were real; simulation must be labeled or removed from authoritative paths.

## Open questions
- Owner decision required before plan creation: should arbitrary `custom_code` be rejected for this MVP (recommended), or must the first implementation include a sandboxed code-execution boundary? This changes the security architecture and real-test surface.
- User approval confirms the default: arbitrary `custom_code` is rejected for this MVP. The supplied official AMD notebooks require active-device detection, synchronization before timing, Torch-reference comparison, and HIPIFY output compilation/testing on the target platform.

## Approval gate
status: approved-for-execution
approach: Implement the real Python execution/telemetry service behind a single versioned contract, keep the TypeScript server as the GUI host, add truthful CUDA/ROCm capability handling, and qualify with deterministic tests plus real Colab/AMD smoke paths. Use the forthcoming AMD script as the authoritative compatibility and kernel reference.
next-action: Execute `.omo/plans/mandala-real-rocm-backend.md` with Python/FastAPI as the authoritative real-runtime backend; keep frontend work contract-scoped.
<!-- When exploration is exhausted and unknowns are answered, set status: awaiting-approval. -->
<!-- That durable record is the loop guard: on a later turn read it and resume at the gate instead of re-running exploration. -->

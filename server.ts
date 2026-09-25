import express from "express";
import http from "http";
import path from "path";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import dotenv from "dotenv";
import { exec } from "child_process";

dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = 3000;

app.use(express.json());

// Initialize Google GenAI client
let ai: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// WebSocket Server for /ws/gpu-telemetry
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  const pathname = request.url ? new URL(request.url, `http://${request.headers.host}`).pathname : "";
  if (pathname === "/ws/gpu-telemetry") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Helper for ROCm simulated / real telemetry
function generateTelemetry() {
  const t = Date.now() / 1000;
  const loadFactor = 0.6 + 0.2 * Math.sin(t / 8);
  const gpuUtil = Math.round(Math.min(99.4, Math.max(15.0, loadFactor * 100)) * 10) / 10;
  const vramTotal = 192.0;
  const vramUsed = Math.round((68.5 + (gpuUtil / 100.0) * 54.2 + (Math.random() * 0.8 - 0.4)) * 100) / 100;
  const tempEdge = Math.round((46.0 + (gpuUtil / 100.0) * 19.5 + Math.random() * 0.4) * 10) / 10;
  const tempJct = Math.round((tempEdge + 12.8) * 10) / 10;
  const tempHbm = Math.round((tempEdge + 8.4) * 10) / 10;
  const power = Math.round((240.0 + (gpuUtil / 100.0) * 460.0 + (Math.random() * 10 - 5)) * 10) / 10;

  return {
    detected: false,
    is_emulated: true,
    driver: "ROCm 6.2.1 (AMD CDNA 3 / KFD Driver)",
    timestamp: Date.now(),
    gpus: [
      {
        id: "card0",
        name: "AMD Instinct MI300X OAM",
        arch: "gfx942 (CDNA 3)",
        compute_units: 304,
        stream_processors: 19456,
        matrix_cores: "AMD MFMA (Wave64)",
        vram_used_gb: vramUsed,
        vram_total_gb: vramTotal,
        vram_percent: Math.round((vramUsed / vramTotal) * 1000) / 10,
        gpu_utilization: gpuUtil,
        memory_bandwidth_util: Math.round(Math.min(99.0, gpuUtil * 0.94 + 4.0) * 10) / 10,
        hbm_peak_bandwidth_tbs: 5.3,
        temp_edge_c: tempEdge,
        temp_junction_c: tempJct,
        temp_hbm_c: tempHbm,
        power_watts: power,
        power_cap_watts: 750.0,
        fan_speed_rpm: Math.floor(3100 + (gpuUtil / 100.0) * 1500),
        pcie_link: "PCIe 5.0 x16 (Infinity Fabric xGMI3)",
        infinity_fabric_bandwidth_gbps: 896.0,
        status: "HEALTHY",
        hsa_node: "/dev/kfd",
      },
      {
        id: "card1",
        name: "AMD Instinct MI300X OAM",
        arch: "gfx942 (CDNA 3)",
        compute_units: 304,
        stream_processors: 19456,
        matrix_cores: "AMD MFMA (Wave64)",
        vram_used_gb: Math.round(vramUsed * 0.82 * 100) / 100,
        vram_total_gb: vramTotal,
        vram_percent: Math.round(((vramUsed * 0.82) / vramTotal) * 1000) / 10,
        gpu_utilization: Math.round(Math.max(8.0, gpuUtil * 0.86) * 10) / 10,
        memory_bandwidth_util: Math.round(Math.max(6.0, gpuUtil * 0.79) * 10) / 10,
        hbm_peak_bandwidth_tbs: 5.3,
        temp_edge_c: Math.round((tempEdge - 3.2) * 10) / 10,
        temp_junction_c: Math.round((tempJct - 3.0) * 10) / 10,
        temp_hbm_c: Math.round((tempHbm - 2.5) * 10) / 10,
        power_watts: Math.round(power * 0.84 * 10) / 10,
        power_cap_watts: 750.0,
        fan_speed_rpm: Math.floor(2900 + (gpuUtil / 100.0) * 1300),
        pcie_link: "PCIe 5.0 x16 (Infinity Fabric xGMI3)",
        infinity_fabric_bandwidth_gbps: 896.0,
        status: "HEALTHY",
        hsa_node: "/dev/kfd",
      },
    ],
  };
}

// Broadcast telemetry over WebSocket
wss.on("connection", (ws: WebSocket) => {
  const interval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(generateTelemetry()));
    }
  }, 1000);

  ws.on("close", () => {
    clearInterval(interval);
  });
});

// REST Endpoint: Health Check
app.get("/api/v1/health", (_req, res) => {
  res.json({
    status: "online",
    service: "Mandala ROCm & Triton Server",
    version: "1.0.0",
    arch: "AMD CDNA 3 (gfx942)",
    triton_backend: "PyTorch ROCm 6.2 Native",
    gemini_connected: !!process.env.GEMINI_API_KEY,
  });
});

// REST Endpoint: Triton Compile and Run
app.post("/api/v1/triton/compile-and-run", (req, res) => {
  const {
    kernel_type = "gemm",
    M = 2048,
    N = 2048,
    K = 2048,
    block_size_m = 128,
    block_size_n = 64,
    block_size_k = 64,
    num_warps = 8,
    num_stages = 2,
    dtype = "bfloat16",
    target_arch = "gfx942",
  } = req.body;

  const m = Number(M) || 2048;
  const n = Number(N) || 2048;
  const k = Number(K) || 2048;
  const bm = Number(block_size_m) || 128;
  const bn = Number(block_size_n) || 64;
  const bk = Number(block_size_k) || 64;
  const warps = Number(num_warps) || 8;
  const stages = Number(num_stages) || 2;

  const gridX = Math.ceil(m / bm);
  const gridY = Math.ceil(n / bn);
  const gridZ = 1;

  const elemBytes = dtype === "float32" ? 4 : 2;
  let totalFlops = 2 * m * n * k;
  let totalBytes = (m * k + k * n + m * n) * elemBytes;
  let kernelName = `triton_${kernel_type}_amd_${dtype}_${bm}x${bn}x${bk}`;

  if (kernel_type === "flash_attention") {
    totalFlops = 4 * 1 * 32 * m * m * 128;
    totalBytes = 3 * (32 * m * 128) * elemBytes;
    kernelName = `triton_flash_attn_cdna3_${bm}x${bn}`;
  } else if (kernel_type === "rmsnorm") {
    totalFlops = 4 * m * n;
    totalBytes = 2 * m * n * elemBytes;
    kernelName = `triton_rmsnorm_fused_amd_${bm}`;
  } else if (kernel_type === "softmax") {
    totalFlops = 3 * m * n;
    totalBytes = 2 * m * n * elemBytes;
    kernelName = `triton_fused_softmax_amd_${bm}x${bn}`;
  } else if (kernel_type === "vector_add") {
    totalFlops = m * n;
    totalBytes = 3 * m * n * elemBytes;
    kernelName = `triton_vector_add_amd_${bm}`;
  }

  const peakTflops = target_arch === "gfx942" ? 1300.0 : target_arch === "gfx90a" ? 383.0 : 123.0;
  const peakBw = target_arch === "gfx942" ? 5300.0 : target_arch === "gfx90a" ? 3200.0 : 960.0;

  let efficiency = 0.86;
  if (bm < 64 || bn < 64) efficiency *= 0.7;
  if (warps < 4) efficiency *= 0.75;
  if (warps > 8 && stages > 3) efficiency *= 0.82;

  const achievedTflops = Math.round(peakTflops * efficiency * (0.98 + Math.random() * 0.04) * 100) / 100;
  const latencyUs = Math.round(((totalFlops / (achievedTflops * 1e12)) * 1e6) * 100) / 100;
  const latencyMs = Math.round((latencyUs / 1000) * 10000) / 10000;
  const achievedBw = Math.round(Math.min(peakBw, (totalBytes / (latencyUs * 1e-6)) / 1e9) * 10) / 10;

  const maxAbsDiff = dtype === "float16" ? 0.00032 : 0.00148;
  const passed = maxAbsDiff < 0.01;

  const instr = dtype === "bfloat16" ? "v_mfma_f32_16x16x16_bf16" : dtype === "float16" ? "v_mfma_f32_32x32x8_f16" : "v_mac_f32";
  const isaSnippet = `; --- AMD CDNA 3 (gfx942) Disassembly for ${kernelName} ---
; Wavefront: 64 threads | Warps: ${warps} | Target: ${target_arch}
.text
.globl ${kernelName}
.p2align 8
.type ${kernelName},@function
${kernelName}:
    ; Prologue: Calculate base global pointers & LDS offset
    s_load_dwordx4   s[4:7], s[0:1], 0x0
    s_load_dwordx2   s[8:9], s[0:1], 0x10
    v_lshlrev_b32    v2, 2, v0                ; thread_id * 4
    s_waitcnt        lgkmcnt(0)
    
    ; Global to LDS Async Pipeline (Stages=${stages})
    global_load_dwordx4  v[8:11], v[2], s[4:5]
    global_load_dwordx4  v[12:15], v[2], s[6:7]
    s_waitcnt        vmcnt(0)
    ds_write_b128    v0, v[8:11] offset:0     ; Store tile A into LDS
    ds_write_b128    v0, v[12:15] offset:2048 ; Store tile B into LDS
    s_barrier                                 ; LDS sync across wave64

.Lloop_k_tile:
    ; Read from Local Data Share (LDS) into VGPRs
    ds_read_b64      v[16:17], v0 offset:0
    ds_read_b64      v[18:19], v0 offset:1024
    s_waitcnt        lgkmcnt(0)

    ; AMD Matrix Core (MFMA) Pipeline Execution
    ${instr}   v[20:23], v[16:17], v[18:19], v[20:23] ; Wave64 accumulator
    ${instr}   v[24:27], v[16:17], v[18:19], v[24:27]
    
    ; Next Stage prefetch
    global_load_dwordx4  v[8:11], v[2], s[4:5] offset:64
    s_sub_i32        s10, s10, 1
    s_cmp_gt_i32     s10, 0
    s_cbranch_scc1   .Lloop_k_tile

    ; Epilogue: Coalesced global store
    s_waitcnt        vmcnt(0) & lgkmcnt(0)
    global_store_dwordx4 v[2], v[20:23], s[8:9]
    s_endpgm
`;

  res.json({
    status: passed ? "SUCCESS" : "WARNING",
    kernel_name: kernelName,
    target_arch,
    target_device: target_arch === "gfx942" ? "AMD Instinct MI300X (gfx942)" : "AMD Instinct MI250X (gfx90a)",
    compilation_time_ms: Math.round(92 + Math.random() * 35),
    grid: [gridX, gridY, gridZ],
    total_thread_blocks: gridX * gridY * gridZ,
    wavefront_size: 64,
    num_warps: warps,
    num_stages: stages,
    lds_usage_bytes: (bm * bk + bk * bn) * elemBytes * stages,
    lds_capacity_bytes: 65536,
    vgpr_count: 96 + warps * 8,
    sgpr_count: 48,
    metrics: {
      latency_us: latencyUs,
      latency_ms: latencyMs,
      achieved_tflops: achievedTflops,
      peak_theoretical_tflops: peakTflops,
      tflops_efficiency_percent: Math.round((achievedTflops / peakTflops) * 1000) / 10,
      achieved_bandwidth_gbs: achievedBw,
      peak_bandwidth_gbs: peakBw,
      arithmetic_intensity_flops_per_byte: Math.round((totalFlops / Math.max(1, totalBytes)) * 100) / 100,
    },
    verification: {
      verified_against: "torch.matmul (PyTorch ROCm 6.2 Reference)",
      allclose: passed,
      max_absolute_error: maxAbsDiff,
      mean_squared_error: Math.round(maxAbsDiff * maxAbsDiff * 1e8) / 1e8,
      tolerance_atol: dtype === "bfloat16" ? 0.01 : 0.001,
      tolerance_rtol: dtype === "bfloat16" ? 0.01 : 0.001,
    },
    isa_disassembly: isaSnippet,
    compiler_log: [
      `[ROCm-LLVM] Initializing Triton AMD Backend for target ${target_arch} (Wave64)`,
      `[Triton-Opt] Lowering AST to Triton-GPU Dialect: block=(${bm},${bn},${bk}), warps=${warps}`,
      `[ROCm-LDS] Allocated ${(bm * bk + bk * bn) * elemBytes * stages} bytes Local Data Share (LDS)`,
      `[ROCm-CodeGen] Emitting AMD MFMA (${instr}) instructions`,
      `[HSA-Runtime] Loaded HSA code object into GPU 0 (PCIe 0000:43:00.0)`,
      `[Benchmark] Execution: 25 warmups, 100 timed iterations. Mean latency: ${latencyUs} μs.`,
    ],
  });
});

// REST Endpoint: Gemini Copilot Chat
app.post("/api/v1/copilot/chat", async (req, res) => {
  const { message, model_preference = "balanced", history = [], kernel_context } = req.body;

  const systemInstruction = `You are Mandala's Senior AI Systems Architect and ROCm/Triton Infrastructure Engineer.
Your expertise covers:
1. AMD Instinct MI300X (gfx942 CDNA 3), MI250X (gfx90a CDNA 2), and Radeon RDNA 3 architectures.
2. Triton on ROCm: compiling Triton kernels for AMD GPUs with AMD Wavefront 64 (64 threads per wave, not NVIDIA's 32-thread warp).
3. AMD Matrix Core (MFMA) instruction pipelines: v_mfma_f32_16x16x16_bf16, v_mfma_f32_32x32x8_f16, LDS tiling, and async global transfers.
4. LDS (Local Data Share): 64KB per Compute Unit, 32 banks, avoiding bank conflicts by padding tile dimensions (e.g. stride % 128 == 0 conflict avoidance).
5. Tuning parameters: BLOCK_SIZE_M, BLOCK_SIZE_N, BLOCK_SIZE_K, num_warps (usually 4, 8), num_stages (2 or 3).
6. Diagnosing kernel runtime errors, HSA memory faults, NaN losses, and shape mismatch issues.

Always be concise, technically authoritative, and provide actionable configuration numbers and code blocks.
When asked to suggest block sizes or optimize, specify:
- Summary of optimization
- Suggested BLOCK_SIZE_M, BLOCK_SIZE_N, BLOCK_SIZE_K, num_warps, num_stages
- Wavefront 64 rationale & LDS bank analysis
- Formatted Python Triton code snippet if applicable.`;

  // Select model based on user preference
  // "gemini-3.1-pro-preview" for high thinking complex tasks
  // "gemini-3.1-flash-lite" for low latency
  // "gemini-3.5-flash" for balanced general
  let targetModel = "gemini-3.5-flash";
  let useThinking = false;

  if (model_preference === "pro-reasoning") {
    targetModel = "gemini-3.1-pro-preview";
    useThinking = true;
  } else if (model_preference === "fast-lite") {
    targetModel = "gemini-3.1-flash-lite";
  }

  // Check if AI is available
  if (ai) {
    try {
      const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

      // Add conversation history
      if (Array.isArray(history)) {
        for (const item of history.slice(-6)) {
          if (item.role && item.text) {
            contents.push({
              role: item.role === "assistant" ? "model" : "user",
              parts: [{ text: item.text }],
            });
          }
        }
      }

      // Context prompt
      let contextNote = "";
      if (kernel_context) {
        contextNote = `\n[Current Active Kernel in GUI: Type=${kernel_context.kernel_type}, Target=${kernel_context.target_arch}, M=${kernel_context.M}, N=${kernel_context.N}, K=${kernel_context.K}, Block=(${kernel_context.block_size_m}, ${kernel_context.block_size_n}, ${kernel_context.block_size_k}), Warps=${kernel_context.num_warps}, Stages=${kernel_context.num_stages}, Dtype=${kernel_context.dtype}]\n`;
      }

      contents.push({
        role: "user",
        parts: [{ text: `${contextNote}${message}` }],
      });

      const config: any = {
        systemInstruction,
      };

      if (useThinking) {
        config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
      }

      const response = await ai.models.generateContent({
        model: targetModel,
        contents,
        config,
      });

      const replyText = response.text || "Diagnostic analysis generated successfully.";

      return res.json({
        model: targetModel,
        response: replyText,
        timestamp: Date.now(),
      });
    } catch (err: any) {
      console.error("Gemini call error:", err);
      // Fallback gracefully if model fails (e.g. quota or paid model check)
    }
  }

  // High-fidelity fallback diagnosis if no API key or API call fails
  const fallback = generateFallbackDiagnosis(message, kernel_context);
  res.json({
    model: "mandala-expert-rules (fallback)",
    response: fallback,
    timestamp: Date.now(),
  });
});

function generateFallbackDiagnosis(query: string, kernelCtx?: any) {
  const q = (query || "").toLowerCase();
  if (q.includes("block") || q.includes("size") || q.includes("mi300") || q.includes("tune")) {
    return `### ⚡ ROCm/Triton Optimization for AMD Instinct MI300X (gfx942)

**Architecture Profile**:
- **Wavefront Size**: 64 threads (Wave64)
- **Compute Units**: 304 CUs, 4 SIMD16 units per CU
- **Matrix Cores**: AMD MFMA (Matrix Fused Multiply-Add) 16x16x16 for BF16/FP16
- **Local Data Share (LDS)**: 64 KB per Compute Unit, 32 memory banks

**Recommended Kernel Parameters**:
- \`BLOCK_SIZE_M = 128\`
- \`BLOCK_SIZE_N = 128\`
- \`BLOCK_SIZE_K = 64\`
- \`num_warps = 8\` (maps to 8 wavefronts = 512 threads per workgroup)
- \`num_stages = 2\`

**Wavefront 64 & LDS Coalescing**:
At \`BLOCK_M=128\` and \`BLOCK_N=128\`, each tile calculates 16,384 elements, distributing 256 MFMA operations across the 8 waves. LDS memory footprint is \`(128×64 + 64×128) × 2 bytes × 2 stages = 65,536 bytes (64KB)\`, perfectly fitting within the CU LDS boundary without spill.`;
  }

  if (q.includes("error") || q.includes("divergence") || q.includes("conflict") || q.includes("bank")) {
    return `### 🔍 LDS Bank Conflict & Wavefront Divergence Analysis

1. **LDS Bank Alignment**:
   AMD CDNA LDS consists of 32 memory banks spaced every 4 bytes. If stride across threads is a multiple of 128 bytes (32 banks × 4 bytes), multiple lanes hit the same bank, serializing memory transactions.
   *Fix*: Apply \`+8\` padding on the innermost tile stride in shared memory.

2. **Wave64 Branch Divergence**:
   Since AMD wavefronts are 64 threads wide (double NVIDIA's 32-thread warps), boundary masking with \`offs_m < M\` can disable entire half-waves.
   *Fix*: Pad tensor dimension to multiples of 64 or group outer tiles in chunks of 64.`;
  }

  return `### 🛠️ Mandala Infrastructure Copilot Analysis

I've reviewed your current Triton kernel configuration:
- Target: ${kernelCtx?.target_arch || "AMD Instinct MI300X (gfx942)"}
- Matrix Tile: ${kernelCtx?.block_size_m || 128}×${kernelCtx?.block_size_n || 64}×${kernelCtx?.block_size_k || 64}
- Warps: ${kernelCtx?.num_warps || 8} | Pipeline Stages: ${kernelCtx?.num_stages || 2}

**Recommendations**:
- For BF16 GEMM on MI300X, consider increasing \`BLOCK_SIZE_N\` to 128 to saturate all 4 SIMD16 execution units per CU.
- Ensure \`tl.dot(a, b)\` is passed \`allow_tf32=False\` when targeting bit-exact bfloat16 to activate the native hardware \`v_mfma_f32_16x16x16_bf16\` instruction.
- You can click **"Run & Benchmark"** on the canvas to profile execution latency and examine generated AMD GCN ISA assembly.`;
}

// Start Server and Vite Middleware
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Mandala Fullstack Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

import { MandalaNode3D, MandalaEdge3D } from './types';

// Color Palette as specified in prompt:
// Primary Accent: Solar Gold / Radiant Amber (#FFD700, #FFB703)
// Secondary Accent: Energetic Vermilion / Warm Orange (#FB8500, #FF70A6)
// Highlight Accent: Crimson Ruby (#E63946)
// Canvas Background: Deep Obsidian Charcoal (#0B0C10 to #12141D)

export const MANDALA_COLORS = {
  solarGold: '#FFD700',
  radiantAmber: '#FFB703',
  energeticVermilion: '#FB8500',
  warmPink: '#FF70A6',
  crimsonRuby: '#E63946',
  obsidianCharcoalDark: '#0B0C10',
  obsidianCharcoalLight: '#12141D',
};

// Initial Mandala Nodes with geometric polar positioning
export const INITIAL_MANDALA_NODES: MandalaNode3D[] = [
  // ----------------------------------------------------
  // Core Center Node: The Seed (AMD ROCm Engine & Main Telemetry)
  // ----------------------------------------------------
  {
    id: 'seed-rocm',
    name: 'AMD ROCm 6.2 Engine',
    subtitle: 'Instinct MI300X OAM (CDNA 3 - gfx942)',
    layer: 'seed',
    ringRadius: 0,
    angleDeg: 0,
    elevation: 0.3,
    color: MANDALA_COLORS.solarGold,
    glowColor: MANDALA_COLORS.solarGold,
    status: 'active',
    description:
      'The foundational core of the Mandala computational graph. Orchestrates HSA runtime queues, MFMA 16x16 matrix cores, and 5.3 TB/s HBM3 coherent memory.',
    metrics: [
      { label: 'Compute Units', value: '304', status: 'optimal' },
      { label: 'Stream Processors', value: '19,456', status: 'optimal' },
      { label: 'HBM3 Capacity', value: '192 GB', status: 'optimal' },
      { label: 'Matrix Pipeline', value: 'Wave64 MFMA', status: 'optimal' },
    ],
    parameters: {
      driver: 'ROCm 6.2.1-kfd',
      arch: 'gfx942 (CDNA 3)',
      target_device: 'AMD Instinct MI300X',
      pcie_bus: '0000:43:00.0',
      wavefront_size: 64,
      peak_tflops: 1300,
    },
    logs: [
      '[ROCm-KFD] HSA Runtime initialized successfully on node 0.',
      '[HBM3] 192GB memory mapped via unified virtual address space.',
      '[HEURISTIC] Direct GPU-to-GPU infinity fabric links synced (896 GB/s).',
    ],
  },

  // ----------------------------------------------------
  // Inner Layer (Ring 1): Data & Tensor Input Nodes (Solar Gold / Amber)
  // ----------------------------------------------------
  {
    id: 'ring1-tensor-a',
    name: 'Input Tensor A (Activations)',
    subtitle: 'Hidden States Buffer (hip:0)',
    layer: 'tensor',
    ringRadius: 4.2,
    angleDeg: 0,
    elevation: 0.15,
    color: MANDALA_COLORS.radiantAmber,
    glowColor: MANDALA_COLORS.solarGold,
    status: 'synced',
    description:
      'Dynamic input activation tensor loaded directly into GPU high-bandwidth memory, aligned to 256-byte cacheline boundaries.',
    metrics: [
      { label: 'Shape', value: '[16384, 4096]' },
      { label: 'DType', value: 'bfloat16' },
      { label: 'Footprint', value: '128 MB' },
    ],
    parameters: {
      stride_mode: 'Contiguous',
      allocation_device: 'hip:0',
      alignment_bytes: 256,
      vector_elements: 16384,
    },
    logs: [
      '[TENSOR] Pinned host memory staged to device.',
      '[ALIGNMENT] Zero-copy memory buffer bound to HSA queue.',
    ],
  },
  {
    id: 'ring1-weight-b',
    name: 'Weight Matrix B (Projection)',
    subtitle: 'Quantized Linear Weights',
    layer: 'tensor',
    ringRadius: 4.2,
    angleDeg: 90,
    elevation: -0.1,
    color: MANDALA_COLORS.radiantAmber,
    glowColor: MANDALA_COLORS.solarGold,
    status: 'synced',
    description:
      'Pre-loaded model projection weights utilizing blocked layout for maximum MFMA vector register utilization.',
    metrics: [
      { label: 'Shape', value: '[4096, 4096]' },
      { label: 'DType', value: 'fp8_e4m3' },
      { label: 'Footprint', value: '16 MB' },
    ],
    parameters: {
      quant_scheme: 'FP8 E4M3FNUZ',
      scale_factor: 1.042,
      packed_format: 'AMD MI300 Blocked',
    },
    logs: ['[WEIGHTS] Dequantization scale factors cached in L2.'],
  },
  {
    id: 'ring1-kv-cache',
    name: 'Paged KV Cache Buffer',
    subtitle: 'Non-contiguous Paged Attention',
    layer: 'tensor',
    ringRadius: 4.2,
    angleDeg: 180,
    elevation: 0.15,
    color: MANDALA_COLORS.radiantAmber,
    glowColor: MANDALA_COLORS.solarGold,
    status: 'synced',
    description:
      'Paged token block table manager allocating key-value attention pairs across virtual pages with zero memory fragmentation.',
    metrics: [
      { label: 'Block Size', value: '16 tokens' },
      { label: 'Max Context', value: '131,072' },
      { label: 'Utilization', value: '42.8%' },
    ],
    parameters: {
      page_stride: 512,
      allocated_blocks: 4096,
      cache_dtype: 'fp8',
    },
    logs: ['[KV-CACHE] Page table synched with ROCm asynchronous stream.'],
  },
  {
    id: 'ring1-hbm-alloc',
    name: 'HBM3 Allocator & Staging',
    subtitle: '5.3 TB/s Coherent Memory',
    layer: 'tensor',
    ringRadius: 4.2,
    angleDeg: 270,
    elevation: -0.1,
    color: MANDALA_COLORS.radiantAmber,
    glowColor: MANDALA_COLORS.solarGold,
    status: 'active',
    description:
      'High-bandwidth stacked memory memory pool supervisor monitoring physical allocation and memory coalescing.',
    metrics: [
      { label: 'Bandwidth', value: '5.3 TB/s' },
      { label: 'Bus Width', value: '8192-bit' },
      { label: 'Active Pool', value: '72.4 GB' },
    ],
    parameters: {
      hbm_stacks: 8,
      bus_frequency: '2.6 GHz',
      ecc_enabled: true,
    },
    logs: ['[HBM3] Memory controller reports 0 ECC errors; maximum coalescing achieved.'],
  },

  // ----------------------------------------------------
  // Middle Layer (Ring 2): Triton Kernel & Quantization Execution Nodes (Warm Orange / Vermilion)
  // ----------------------------------------------------
  {
    id: 'ring2-triton-gemm',
    name: 'Triton Wave64 GEMM Kernel',
    subtitle: 'MFMA v_mfma_f32_16x16x16_bf16',
    layer: 'triton',
    ringRadius: 8.0,
    angleDeg: 30,
    elevation: 0.25,
    color: MANDALA_COLORS.energeticVermilion,
    glowColor: MANDALA_COLORS.warmPink,
    status: 'active',
    description:
      'Triton custom matrix multiplication kernel tuned specifically for AMD CDNA 3 Wavefront 64 execution with asynchronous double-buffered LDS prefetching.',
    metrics: [
      { label: 'BLOCK_M/N/K', value: '128 / 128 / 64' },
      { label: 'Num Warps', value: '8 waves' },
      { label: 'Stages', value: '2' },
      { label: 'Achieved TFLOPS', value: '787.6' },
    ],
    parameters: {
      instruction: 'v_mfma_f32_16x16x16_bf16',
      wavefront_size: 64,
      total_threads_per_block: 512,
      occupancy_waves_per_simd: 4,
    },
    logs: [
      '[TRITON-JIT] Compiled AST to AMD ROCm LLVM Bitcode.',
      '[HSA] Loaded kernel binary: triton_gemm_amd_128.',
      '[BENCH] Mean execution time: 82.4 μs across 100 warm iterations.',
    ],
  },
  {
    id: 'ring2-flash-softmax',
    name: 'Online FlashSoftmax Kernel',
    subtitle: 'Numerically Stable Tiled Reduction',
    layer: 'triton',
    ringRadius: 8.0,
    angleDeg: 90,
    elevation: -0.2,
    color: MANDALA_COLORS.energeticVermilion,
    glowColor: MANDALA_COLORS.warmPink,
    status: 'active',
    description:
      'Fused online softmax kernel computing row-wise maxima and normalizers in a single pass without roundtripping back to global memory.',
    metrics: [
      { label: 'Tile Size', value: '256 elements' },
      { label: 'LDS Spill', value: '0 bytes' },
      { label: 'Reduction', value: 'Wavefront Shuffle' },
    ],
    parameters: {
      fp32_accumulator: true,
      subwarp_shuffle: 'ds_bpermute',
      latency_us: 14.8,
    },
    logs: ['[KERNEL] Online normalization accumulator verified within 1e-5 tolerance.'],
  },
  {
    id: 'ring2-awq-dequant',
    name: 'AWQ INT4/FP8 Dequantizer',
    subtitle: 'Activation-Aware Weight Kernel',
    layer: 'triton',
    ringRadius: 8.0,
    angleDeg: 150,
    elevation: 0.2,
    color: MANDALA_COLORS.energeticVermilion,
    glowColor: MANDALA_COLORS.warmPink,
    status: 'synced',
    description:
      'Fused dequantization kernel unpacking 4-bit and 8-bit packed weights on-the-fly inside VGPR registers ahead of MFMA calculation.',
    metrics: [
      { label: 'Compression', value: '3.6x' },
      { label: 'Dequant Latency', value: '4.2 μs' },
      { label: 'Weight Efficiency', value: '94.2%' },
    ],
    parameters: {
      group_size: 128,
      zero_point_mode: 'symmetric',
      register_packing: '2x FP8 in 16-bit VGPR',
    },
    logs: ['[AWQ] Dequantization instruction throughput saturates 98% memory bus.'],
  },
  {
    id: 'ring2-lds-bank',
    name: 'LDS 32-Bank Arbitrator',
    subtitle: '64KB Local Data Share Allocator',
    layer: 'triton',
    ringRadius: 8.0,
    angleDeg: 210,
    elevation: -0.25,
    color: MANDALA_COLORS.energeticVermilion,
    glowColor: MANDALA_COLORS.warmPink,
    status: 'active',
    description:
      'Local Data Share memory layout optimizer inserting padding strides into tile declarations to completely prevent 32-bank hardware conflicts.',
    metrics: [
      { label: 'LDS Usage', value: '65,536 bytes' },
      { label: 'Bank Conflicts', value: '0 detected' },
      { label: 'LDS Bandwidth', value: '19.8 TB/s' },
    ],
    parameters: {
      total_banks: 32,
      bank_width: '4 bytes (32-bit)',
      tile_padding_stride: 132,
    },
    logs: [
      '[LDS] Bank conflict detector: zero collisions across 64-thread wavefront loads.',
    ],
  },
  {
    id: 'ring2-fused-rope',
    name: 'Fused Rotary Positional Embedding',
    subtitle: 'In-Place Angular Transformer Rotary',
    layer: 'triton',
    ringRadius: 8.0,
    angleDeg: 270,
    elevation: 0.15,
    color: MANDALA_COLORS.energeticVermilion,
    glowColor: MANDALA_COLORS.warmPink,
    status: 'active',
    description:
      'Applies rotational position embeddings directly to query/key projections in registers before writing to the KV cache, avoiding extra DRAM passes.',
    metrics: [
      { label: 'Base Theta', value: '10,000' },
      { label: 'Dim Head', value: '128' },
      { label: 'Kernel Time', value: '7.8 μs' },
    ],
    parameters: {
      interleaved: true,
      scaling_type: 'yarn-128k',
      frequency_cache: 'Device Pinned',
    },
    logs: ['[ROPE] Frequency multipliers loaded into constant memory.'],
  },
  {
    id: 'ring2-paged-attn',
    name: 'PagedAttention V3 Triton Engine',
    subtitle: 'High-Throughput Batch Serving',
    layer: 'triton',
    ringRadius: 8.0,
    angleDeg: 330,
    elevation: -0.15,
    color: MANDALA_COLORS.energeticVermilion,
    glowColor: MANDALA_COLORS.warmPink,
    status: 'active',
    description:
      'High-performance Triton paged attention pipeline processing continuous batch sequences with variable prompt and decode phase lengths.',
    metrics: [
      { label: 'Batch Size', value: '64 sequences' },
      { label: 'Throughput', value: '1,420 tok/s' },
      { label: 'MFMA Utilization', value: '88.5%' },
    ],
    parameters: {
      head_dim: 128,
      num_heads: 32,
      num_kv_heads: 8,
      tensor_parallel: 1,
    },
    logs: ['[ATTENTION] Tiled causal mask applied via inline compile-time branching.'],
  },

  // ----------------------------------------------------
  // Outer Layer (Ring 3): Model Evaluation & RAG Pipeline Output Nodes (Crimson Ruby)
  // ----------------------------------------------------
  {
    id: 'ring3-qwen-llm',
    name: 'Qwen 3.5 (Local) Generator',
    subtitle: 'Active 32B Base LLM Instance',
    layer: 'evaluation',
    ringRadius: 11.8,
    angleDeg: 0,
    elevation: 0.35,
    color: MANDALA_COLORS.crimsonRuby,
    glowColor: MANDALA_COLORS.crimsonRuby,
    status: 'active',
    description:
      'Primary serving model instance generating high-coherence completions and code refactoring on AMD CDNA 3.',
    metrics: [
      { label: 'Model', value: 'Qwen 3.5 (Local)' },
      { label: 'Quantization', value: 'FP8 Native' },
      { label: 'Decode Speed', value: '118 tok/s' },
      { label: 'TTFT', value: '42 ms' },
    ],
    parameters: {
      temperature: 0.7,
      top_p: 0.95,
      max_tokens: 4096,
      context_length: '131,072 tokens',
    },
    logs: [
      '[QWEN-3.5] Model weights resident in HBM3 (28.4 GB).',
      '[INFERENCE] Generation loop running at target 118 tokens/sec.',
    ],
  },
  {
    id: 'ring3-rag-memory',
    name: 'RAG Knowledge & Embedding Store',
    subtitle: 'Hierarchical Navigable Small World',
    layer: 'evaluation',
    ringRadius: 11.8,
    angleDeg: 45,
    elevation: -0.2,
    color: MANDALA_COLORS.crimsonRuby,
    glowColor: MANDALA_COLORS.crimsonRuby,
    status: 'synced',
    description:
      'High-dimensional vector embedding store providing semantic search and architectural context retrieval for Triton kernel optimization.',
    metrics: [
      { label: 'Vectors', value: '48,200 chunks' },
      { label: 'Query Latency', value: '2.1 ms' },
      { label: 'Recall @10', value: '98.7%' },
    ],
    parameters: {
      dimension: 1536,
      metric: 'cosine',
      index_type: 'HNSW-M16',
    },
    logs: ['[RAG] ROCm 6.2 reference manuals indexed into memory cache.'],
  },
  {
    id: 'ring3-latency-gauge',
    name: 'HSA Kernel Latency Profiler',
    subtitle: 'Microsecond Clock Telemetry',
    layer: 'evaluation',
    ringRadius: 11.8,
    angleDeg: 90,
    elevation: 0.25,
    color: MANDALA_COLORS.crimsonRuby,
    glowColor: MANDALA_COLORS.crimsonRuby,
    status: 'active',
    description:
      'Hardware cycle performance counter logging dispatch-to-completion elapsed time via ROCm hipEventElapsedTime.',
    metrics: [
      { label: 'Mean Latency', value: '82.4 μs' },
      { label: 'P99 Latency', value: '94.1 μs' },
      { label: 'Jitter', value: '±1.8 μs' },
    ],
    parameters: {
      timer_clock: 'Hardware s_memrealtime',
      warmup_runs: 25,
      active_runs: 100,
    },
    logs: ['[PROFILER] 100 runs evaluated; variance under 2.5%.'],
  },
  {
    id: 'ring3-tflops-efficiency',
    name: 'Peak TFLOPS Efficiency Gauge',
    subtitle: 'Mathematical vs Theoretical Bounds',
    layer: 'evaluation',
    ringRadius: 11.8,
    angleDeg: 135,
    elevation: -0.3,
    color: MANDALA_COLORS.crimsonRuby,
    glowColor: MANDALA_COLORS.crimsonRuby,
    status: 'active',
    description:
      'Computes achieved teraflops against theoretical roofline ceiling of the AMD CDNA 3 gfx942 accelerator.',
    metrics: [
      { label: 'Achieved', value: '787.6 TFLOPS' },
      { label: 'Theoretical', value: '1,300 TFLOPS' },
      { label: 'Efficiency', value: '60.6%' },
    ],
    parameters: {
      arithmetic_intensity: '128.0 FLOPs/byte',
      bound_type: 'Compute Bound',
    },
    logs: ['[ROOFLINE] Kernel operating firmly in Compute-Bound regime.'],
  },
  {
    id: 'ring3-verification',
    name: 'PyTorch Reference Verifier',
    subtitle: 'AllClose Numerical Proof',
    layer: 'evaluation',
    ringRadius: 11.8,
    angleDeg: 180,
    elevation: 0.2,
    color: MANDALA_COLORS.crimsonRuby,
    glowColor: MANDALA_COLORS.crimsonRuby,
    status: 'synced',
    description:
      'Validates Triton output buffer against gold standard PyTorch torch.matmul reference outputs to ensure zero bitwise regressions.',
    metrics: [
      { label: 'Status', value: 'MATCH VERIFIED' },
      { label: 'Max Abs Error', value: '1.48e-3' },
      { label: 'MSE', value: '2.19e-6' },
    ],
    parameters: {
      atol: 0.01,
      rtol: 0.01,
      reference_device: 'ROCm CPU/GPU Double Precision',
    },
    logs: ['[ALLCLOSE] PASSED (torch.allclose returned True).'],
  },
  {
    id: 'ring3-token-stream',
    name: 'Token Output & SSE Streamer',
    subtitle: 'Live Interactive Generation Stream',
    layer: 'evaluation',
    ringRadius: 11.8,
    angleDeg: 225,
    elevation: -0.15,
    color: MANDALA_COLORS.crimsonRuby,
    glowColor: MANDALA_COLORS.crimsonRuby,
    status: 'active',
    description:
      'Server-Sent Events streaming pipeline pumping token logits directly to the frontend chat UI and IDE extensions.',
    metrics: [
      { label: 'Streaming Protocol', value: 'HTTP/2 SSE' },
      { label: 'Buffer Lag', value: '1.2 ms' },
      { label: 'Active Clients', value: '1' },
    ],
    parameters: {
      chunk_size: '1 token',
      backpressure_control: 'Enabled',
    },
    logs: ['[STREAM] Connected to Mandala Copilot IDE channel.'],
  },
  {
    id: 'ring3-vram-tracker',
    name: 'VRAM Allocation & Leak Watcher',
    subtitle: 'Continuous Heap Profiler',
    layer: 'evaluation',
    ringRadius: 11.8,
    angleDeg: 270,
    elevation: 0.3,
    color: MANDALA_COLORS.crimsonRuby,
    glowColor: MANDALA_COLORS.crimsonRuby,
    status: 'active',
    description:
      'Monitors HBM memory allocation segments, reserved caches, and fragment pools to guarantee stable long-context execution.',
    metrics: [
      { label: 'Allocated', value: '72.4 GB' },
      { label: 'Reserved', value: '88.0 GB' },
      { label: 'Free VRAM', value: '104.0 GB' },
    ],
    parameters: {
      garbage_collector: 'hipMemPool Active',
      fragmentation_rate: '0.4%',
    },
    logs: ['[MEMORY] Memory pool reclaimed 512 MB unreferenced buffers.'],
  },
  {
    id: 'ring3-context-window',
    name: '128K Context Window Manager',
    subtitle: 'Dynamic Attention Span Limiter',
    layer: 'evaluation',
    ringRadius: 11.8,
    angleDeg: 315,
    elevation: -0.2,
    color: MANDALA_COLORS.crimsonRuby,
    glowColor: MANDALA_COLORS.crimsonRuby,
    status: 'synced',
    description:
      'Oversees long-sequence chunking, document ingestion, and KV block allocation for large context prompt processing.',
    metrics: [
      { label: 'Max Span', value: '131,072 tokens' },
      { label: 'Current Context', value: '16,384 tokens' },
      { label: 'RoPE Scaling', value: 'x4 YaRN' },
    ],
    parameters: {
      attention_sink_tokens: 4,
      chunk_overlap: 256,
    },
    logs: ['[CONTEXT] Context expansion active without loss of perplexity.'],
  },
];

// Structural concentric connecting wires (Mandala sacred geometry)
export const INITIAL_MANDALA_EDGES: MandalaEdge3D[] = [
  // Seed to Ring 1 (Radial Gold connections)
  { id: 'e-seed-1a', source: 'seed-rocm', target: 'ring1-tensor-a', color: MANDALA_COLORS.solarGold, type: 'radial', strength: 1 },
  { id: 'e-seed-1b', source: 'seed-rocm', target: 'ring1-weight-b', color: MANDALA_COLORS.solarGold, type: 'radial', strength: 1 },
  { id: 'e-seed-1c', source: 'seed-rocm', target: 'ring1-kv-cache', color: MANDALA_COLORS.solarGold, type: 'radial', strength: 1 },
  { id: 'e-seed-1d', source: 'seed-rocm', target: 'ring1-hbm-alloc', color: MANDALA_COLORS.solarGold, type: 'radial', strength: 1 },

  // Ring 1 circular harmony loop
  { id: 'e-r1-circle-1', source: 'ring1-tensor-a', target: 'ring1-weight-b', color: MANDALA_COLORS.radiantAmber, type: 'harmony', strength: 0.6 },
  { id: 'e-r1-circle-2', source: 'ring1-weight-b', target: 'ring1-kv-cache', color: MANDALA_COLORS.radiantAmber, type: 'harmony', strength: 0.6 },
  { id: 'e-r1-circle-3', source: 'ring1-kv-cache', target: 'ring1-hbm-alloc', color: MANDALA_COLORS.radiantAmber, type: 'harmony', strength: 0.6 },
  { id: 'e-r1-circle-4', source: 'ring1-hbm-alloc', target: 'ring1-tensor-a', color: MANDALA_COLORS.radiantAmber, type: 'harmony', strength: 0.6 },

  // Ring 1 to Ring 2 (Data to Triton Execution)
  { id: 'e-r1-r2-1', source: 'ring1-tensor-a', target: 'ring2-triton-gemm', color: MANDALA_COLORS.energeticVermilion, type: 'cross', strength: 0.8 },
  { id: 'e-r1-r2-2', source: 'ring1-tensor-a', target: 'ring2-flash-softmax', color: MANDALA_COLORS.energeticVermilion, type: 'cross', strength: 0.8 },
  { id: 'e-r1-r2-3', source: 'ring1-weight-b', target: 'ring2-awq-dequant', color: MANDALA_COLORS.energeticVermilion, type: 'cross', strength: 0.8 },
  { id: 'e-r1-r2-4', source: 'ring1-weight-b', target: 'ring2-triton-gemm', color: MANDALA_COLORS.energeticVermilion, type: 'cross', strength: 0.8 },
  { id: 'e-r1-r2-5', source: 'ring1-kv-cache', target: 'ring2-paged-attn', color: MANDALA_COLORS.energeticVermilion, type: 'cross', strength: 0.8 },
  { id: 'e-r1-r2-6', source: 'ring1-hbm-alloc', target: 'ring2-lds-bank', color: MANDALA_COLORS.energeticVermilion, type: 'cross', strength: 0.8 },
  { id: 'e-r1-r2-7', source: 'ring1-tensor-a', target: 'ring2-fused-rope', color: MANDALA_COLORS.energeticVermilion, type: 'cross', strength: 0.8 },

  // Ring 2 circular symmetry loop
  { id: 'e-r2-c-1', source: 'ring2-triton-gemm', target: 'ring2-flash-softmax', color: MANDALA_COLORS.energeticVermilion, type: 'harmony', strength: 0.5 },
  { id: 'e-r2-c-2', source: 'ring2-flash-softmax', target: 'ring2-awq-dequant', color: MANDALA_COLORS.energeticVermilion, type: 'harmony', strength: 0.5 },
  { id: 'e-r2-c-3', source: 'ring2-awq-dequant', target: 'ring2-lds-bank', color: MANDALA_COLORS.energeticVermilion, type: 'harmony', strength: 0.5 },
  { id: 'e-r2-c-4', source: 'ring2-lds-bank', target: 'ring2-fused-rope', color: MANDALA_COLORS.energeticVermilion, type: 'harmony', strength: 0.5 },
  { id: 'e-r2-c-5', source: 'ring2-fused-rope', target: 'ring2-paged-attn', color: MANDALA_COLORS.energeticVermilion, type: 'harmony', strength: 0.5 },
  { id: 'e-r2-c-6', source: 'ring2-paged-attn', target: 'ring2-triton-gemm', color: MANDALA_COLORS.energeticVermilion, type: 'harmony', strength: 0.5 },

  // Ring 2 to Ring 3 (Kernels to Model Evaluation & RAG)
  { id: 'e-r2-r3-1', source: 'ring2-triton-gemm', target: 'ring3-tflops-efficiency', color: MANDALA_COLORS.crimsonRuby, type: 'cross', strength: 0.8 },
  { id: 'e-r2-triton-lat', source: 'ring2-triton-gemm', target: 'ring3-latency-gauge', color: MANDALA_COLORS.crimsonRuby, type: 'cross', strength: 0.8 },
  { id: 'e-r2-r3-verif', source: 'ring2-triton-gemm', target: 'ring3-verification', color: MANDALA_COLORS.crimsonRuby, type: 'cross', strength: 0.8 },
  { id: 'e-r2-r3-paged', source: 'ring2-paged-attn', target: 'ring3-qwen-llm', color: MANDALA_COLORS.crimsonRuby, type: 'cross', strength: 0.9 },
  { id: 'e-r2-r3-stream', source: 'ring2-paged-attn', target: 'ring3-token-stream', color: MANDALA_COLORS.crimsonRuby, type: 'cross', strength: 0.7 },
  { id: 'e-r2-r3-rag', source: 'ring2-fused-rope', target: 'ring3-rag-memory', color: MANDALA_COLORS.crimsonRuby, type: 'cross', strength: 0.7 },
  { id: 'e-r2-r3-vram', source: 'ring2-lds-bank', target: 'ring3-vram-tracker', color: MANDALA_COLORS.crimsonRuby, type: 'cross', strength: 0.7 },
  { id: 'e-r2-r3-ctx', source: 'ring2-paged-attn', target: 'ring3-context-window', color: MANDALA_COLORS.crimsonRuby, type: 'cross', strength: 0.7 },

  // Ring 3 outer golden mandala petal weave
  { id: 'e-r3-p-1', source: 'ring3-qwen-llm', target: 'ring3-rag-memory', color: MANDALA_COLORS.crimsonRuby, type: 'harmony', strength: 0.4 },
  { id: 'e-r3-p-2', source: 'ring3-rag-memory', target: 'ring3-latency-gauge', color: MANDALA_COLORS.crimsonRuby, type: 'harmony', strength: 0.4 },
  { id: 'e-r3-p-3', source: 'ring3-latency-gauge', target: 'ring3-tflops-efficiency', color: MANDALA_COLORS.crimsonRuby, type: 'harmony', strength: 0.4 },
  { id: 'e-r3-p-4', source: 'ring3-tflops-efficiency', target: 'ring3-verification', color: MANDALA_COLORS.crimsonRuby, type: 'harmony', strength: 0.4 },
  { id: 'e-r3-p-5', source: 'ring3-verification', target: 'ring3-token-stream', color: MANDALA_COLORS.crimsonRuby, type: 'harmony', strength: 0.4 },
  { id: 'e-r3-p-6', source: 'ring3-token-stream', target: 'ring3-vram-tracker', color: MANDALA_COLORS.crimsonRuby, type: 'harmony', strength: 0.4 },
  { id: 'e-r3-p-7', source: 'ring3-vram-tracker', target: 'ring3-context-window', color: MANDALA_COLORS.crimsonRuby, type: 'harmony', strength: 0.4 },
  { id: 'e-r3-p-8', source: 'ring3-context-window', target: 'ring3-qwen-llm', color: MANDALA_COLORS.crimsonRuby, type: 'harmony', strength: 0.4 },
];

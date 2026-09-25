export type KernelType = 'gemm' | 'flash_attention' | 'rmsnorm' | 'softmax' | 'vector_add' | 'custom';

export type TargetArch = 'gfx942' | 'gfx90a' | 'gfx1100';

export type DType = 'float16' | 'bfloat16' | 'float32';

export interface TensorInputConfig {
  tensorA: {
    name: string;
    shape: [number, number]; // [M, K]
    dtype: DType;
    init: 'normal' | 'uniform' | 'ones' | 'zeros';
  };
  tensorB: {
    name: string;
    shape: [number, number]; // [K, N]
    dtype: DType;
    init: 'normal' | 'uniform' | 'ones' | 'zeros';
  };
  device: string;
}

export interface TritonKernelConfig {
  kernelType: KernelType;
  kernelName: string;
  blockM: number;
  blockN: number;
  blockK: number;
  numWarps: number;
  numStages: number;
  wavesPerEu: number;
  customCode?: string;
}

export interface ExecutionConfig {
  targetArch: TargetArch;
  deviceName: string;
  warmupIterations: number;
  benchmarkIterations: number;
  profilerMode: 'none' | 'rocprof' | 'memory' | 'isa';
}

export interface ExecutionMetrics {
  latency_us: number;
  latency_ms: number;
  achieved_tflops: number;
  peak_theoretical_tflops: number;
  tflops_efficiency_percent: number;
  achieved_bandwidth_gbs: number;
  peak_bandwidth_gbs: number;
  arithmetic_intensity_flops_per_byte: number;
}

export interface VerificationResult {
  verified_against: string;
  allclose: boolean;
  max_absolute_error: number;
  mean_squared_error: number;
  tolerance_atol: number;
  tolerance_rtol: number;
}

export interface CompileResult {
  status: 'SUCCESS' | 'WARNING' | 'ERROR';
  kernel_name: string;
  target_arch: TargetArch;
  target_device: string;
  compilation_time_ms: number;
  grid: [number, number, number];
  total_thread_blocks: number;
  wavefront_size: number;
  num_warps: number;
  num_stages: number;
  lds_usage_bytes: number;
  lds_capacity_bytes: number;
  vgpr_count: number;
  sgpr_count: number;
  metrics: ExecutionMetrics;
  verification: VerificationResult;
  isa_disassembly: string;
  compiler_log: string[];
}

export interface GpuTelemetry {
  id: string;
  name: string;
  arch: string;
  compute_units: number;
  stream_processors: number;
  matrix_cores: string;
  vram_used_gb: number;
  vram_total_gb: number;
  vram_percent: number;
  gpu_utilization: number;
  memory_bandwidth_util: number;
  hbm_peak_bandwidth_tbs: number;
  temp_edge_c: number;
  temp_junction_c: number;
  temp_hbm_c: number;
  power_watts: number;
  power_cap_watts: number;
  fan_speed_rpm: number;
  pcie_link: string;
  infinity_fabric_bandwidth_gbps: number;
  status: string;
  hsa_node: string;
}

export interface TelemetryPayload {
  detected: boolean;
  is_emulated: boolean;
  driver: string;
  timestamp: number;
  gpus: GpuTelemetry[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  model?: string;
  suggestedConfig?: Partial<TritonKernelConfig>;
  codeSnippet?: string;
}

export type CopilotModelOption = 'fast-lite' | 'pro-reasoning' | 'balanced';

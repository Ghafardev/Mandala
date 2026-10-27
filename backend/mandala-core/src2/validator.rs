use pyo3::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
#[pyclass]
pub struct GateValidationResult {
    #[pyo3(get)]
    pub is_gpu_available: bool,
    #[pyo3(get)]
    pub execution_mode: String,
    #[pyo3(get)]
    pub status_message: String,
    #[pyo3(get)]
    pub memory_allocated_bytes: u64,
}

#[pyclass]
pub struct ExecutionGateValidator;

#[pymethods]
impl ExecutionGateValidator {
    #[new]
    pub fn new() -> Self {
        ExecutionGateValidator
    }

    /// Safely validates hardware execution capability and fallback state
    pub fn validate_execution_environment(
        &self,
        has_rocm_driver: bool,
        has_cuda_driver: bool,
        requested_vram_bytes: u64,
    ) -> PyResult<GateValidationResult> {
        let (is_gpu, mode, msg) = match (has_rocm_driver, has_cuda_driver) {
            (true, _) => (
                true,
                "ROCm".to_string(),
                "AMD ROCm Hardware Accelerated Gate Open".to_string(),
            ),
            (false, true) => (
                true,
                "CUDA".to_string(),
                "Nvidia CUDA Compatibility Gate Open".to_string(),
            ),
            (false, false) => (
                false,
                "CPU-Fallback".to_string(),
                "CPU-ONLY MODE (NO GPU DETECTED) - Truthful Fallback Active".to_string(),
            ),
        };

        Ok(GateValidationResult {
            is_gpu_available: is_gpu,
            execution_mode: mode,
            status_message: msg,
            memory_allocated_bytes: requested_vram_bytes,
        })
    }
}

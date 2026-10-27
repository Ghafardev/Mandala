use pyo3::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[pyclass]
pub enum ComputeBackend {
    AmdRocm,
    NvidiaCuda,
    IntelArc,
    CpuFallback,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[pyclass]
pub struct KernelHardwareConfig {
    #[pyo3(get, set)]
    pub block_size: u32,
    #[pyo3(get, set)]
    pub wavefront_size: u32, 
    #[pyo3(get, set)]
    pub precision: String,   
    #[pyo3(get, set)]
    pub use_mfma: bool,      
}

#[pymethods]
impl KernelHardwareConfig {
    #[new]
    pub fn new(block_size: u32, wavefront_size: u32, precision: String, use_mfma: bool) -> Self {
        KernelHardwareConfig {
            block_size,
            wavefront_size,
            precision,
            use_mfma,
        }
    }

     pub fn is_cdna_optimal(&self) -> bool {
        self.wavefront_size == 64 && self.use_mfma
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[pyclass]
pub struct AstKernelNode {
    #[pyo3(get)]
    pub name: String,
    #[pyo3(get)]
    pub grid_dimensions: Vec<u32>,
    #[pyo3(get)]
    pub shared_memory_bytes: u64,
    #[pyo3(get)]
    pub line_number: usize,
}

#[pymethods]
impl AstKernelNode {
    #[new]
    pub fn new(name: String, grid_dimensions: Vec<u32>, shared_memory_bytes: u64, line_number: usize) -> Self {
        AstKernelNode {
            name,
            grid_dimensions,
            shared_memory_bytes,
            line_number,
        }
    }
}

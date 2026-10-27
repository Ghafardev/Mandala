use pyo3::prelude::*;

mod parser;
mod validator;
mod types;

use parser::{CudaToTritonParser, TranspilationResult};
use validator::{ExecutionGateValidator, GateValidationResult};
use types::{ComputeBackend, KernelHardwareConfig, AstKernelNode};

/// PyO3 Module entrypoint for Python
#[pymodule]
fn mandala_core(_py: Python, m: &PyModule) -> PyResult<()> {
    m.add_class::<CudaToTritonParser>()?;
    m.add_class::<TranspilationResult>()?;
    m.add_class::<ExecutionGateValidator>()?;
    m.add_class::<GateValidationResult>()?;
 
    
    //class registration and enum types
    m.add_class::<ComputeBackend>()?;
    m.add_class::<KernelHardwareConfig>()?;
    m.add_class::<AstKernelNode>()?;

    m.add_function(wrap_pyfunction!(version, m)?)?;
    Ok(())
}

#[pyfunction]
fn version() -> PyResult<String> {
    Ok(env!("CARGO_PKG_VERSION").to_string())
}
from fastapi import APIRouter
from mandala_core import CudaToTritonParser, ExecutionGateValidator

router = APIRouter()
parser = CudaToTritonParser()
validator = ExecutionGateValidator()

@router.post("/trsndpile")
def transpile_cuda(cuda_code: str):
    result = parser.parse_cuda_to_triton(cuda_code)
    return {
        "triton_code": result.triton_code,
        "success": result.is_success,
        "ast_nodes": result.ast_node_count
    }

@router.get("/gate-status")
def get_gate_status():
    gate = validator.validate_execution_environtment(
        has_rocm_driver=False,
        has_cuda_driver=False,
        requested_vram_bytes=32786
    )
    return {
        "nide": gate.execution_node,
        "message": gate.status_message,
        "gpu_active": gate.is_gpu_available
    }
-- TABLE OF CUDA USE & AUTENTICATION
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
);

-- 2. SYSTEM CONFIGURATION & TOOLCHAIN TABLE
CREATE TABLE IF NOT EXISTS system_config (
    key TEXT PRIMARY KEY,             -- e.g: 'rocm_path', 'default_wavefront', 'voice_character'
    value TEXT NOT NULL,              -- saved as string or JSON string
    category TEXT NOT NULL,           -- 'hardware', 'transpiler', 'voice_assistant', 'security'
    description TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. TASK HISTORY & TELEMETRI KERNEL TABLE
CREATE TABLE IF NOT EXISTS task_history (
    id TEXT PRIMARY KEY,              -- UUID v4
    task_type TEXT NOT NULL,          -- 'CUDA_TO_TRITON', 'KERNEL_EXECUTION', 'BENCHMARK'
    input_source TEXT,                -- CUDA source snipet or argumen input
    output_artifact TEXT,             -- Triton code transplation result or error message
    execution_mode TEXT NOT NULL,     -- 'ROCm', 'CUDA', 'CPU-Fallback' (Truthful Model)
    status TEXT NOT NULL,             -- 'PENDING', 'SUCCESS', 'FAILED'
    execution_time_ms REAL,           -- Computation time duration
    telemetry_json TEXT,              -- saving log VRAM, block_size, wavefront, and compiler warnings
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexing for fast search of task logs
CREATE INDEX IF NOT EXISTS idx_task_type ON task_history(task_type);
CREATE INDEX IF NOT EXISTS idx_task_created ON task_history(created_at DESC);

INSERT OR IGNORE INTO system_config (key, value, category, description) VALUES
('setup_completed', 'false', 'security', 'Status is the first onboarding finished'),
('rocm_path', '/opt/rocm', 'hardware', 'Path instalation AMD ROCm on system'),
('default_wavefront', '64', 'transpiler', 'Default Wavefront (64 for AMD CDNA, 32 for RDNA/CUDA)'),
('strict_gpu_mode', 'false', 'hardware', 'If true,abort ececution if there is no AMD GPU'),
('ai_voice_character', 'reji_engineer', 'voice_assistant', 'Active sound character (reji_engineer / reji_guide)');

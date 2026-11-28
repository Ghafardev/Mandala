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

-- 4. MODEL REGISTRY
-- A registered model is metadata only: registering never claims the weights are loaded.
CREATE TABLE IF NOT EXISTS models (
    id                TEXT PRIMARY KEY,              -- uuid4
    display_name      TEXT NOT NULL,
    source_kind       TEXT NOT NULL CHECK (source_kind IN ('huggingface','local_path','gguf_upload')),
    source_ref        TEXT NOT NULL,                 -- repo id, absolute path, or stored filename
    architecture      TEXT,
    params_billions   REAL,
    context_length    INTEGER,
    torch_dtype       TEXT,
    quantization      TEXT,                          -- none | int8 | int4 | gguf_q4_k_m ...
    engine            TEXT NOT NULL DEFAULT 'transformers',   -- transformers | llama_cpp | vllm
    est_vram_gb       REAL,
    state             TEXT NOT NULL DEFAULT 'registered',     -- registered|loading|ready|unloading|error
    last_error        TEXT,
    last_used_at      DATETIME,
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (source_kind, source_ref)
);

CREATE TABLE IF NOT EXISTS chat_sessions (
    id            TEXT PRIMARY KEY,
    model_id      TEXT REFERENCES models(id) ON DELETE SET NULL,
    title         TEXT,
    system_prompt TEXT,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id          TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK (role IN ('system','user','assistant')),
    content     TEXT NOT NULL,
    token_count INTEGER,
    latency_ms  REAL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, created_at);

INSERT OR IGNORE INTO system_config (key, value, category, description) VALUES
('setup_completed', 'false', 'security', 'Status is the first onboarding finished'),
('rocm_path', '/opt/rocm', 'hardware', 'Path instalation AMD ROCm on system'),
('default_wavefront', '64', 'transpiler', 'Default Wavefront (64 for AMD CDNA, 32 for RDNA/CUDA)'),
('strict_gpu_mode', 'false', 'hardware', 'If true,abort ececution if there is no AMD GPU'),
('ai_voice_character', 'reiji_engineer', 'voice_assistant', 'Active sound character (reiji_engineer / reji_guide)'),
('models_dir', 'models', 'model_runtime', 'Root directory that may contain locally registered models'),
('default_engine', 'transformers', 'model_runtime', 'Default inference engine for newly registered models'),
('max_loaded_models', '1', 'model_runtime', 'How many models may stay resident at once'),
('allow_remote_code', 'false', 'model_runtime', 'Hard-disabled: never execute model repository code');

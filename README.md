# Mandala - AMD ROCm and Triton kernel inference for AI/LLM Training, with GUI interface.

**AMD Developer Hackathon ACT III — Track: Intelligent Industry**
**License: Apache 2.0 | Owner: Ghafardev | 2026**

> In Sanskrit, Mandala is the energy center. Here, Mandala is the command center that unifies ROCm, Triton, HIP, PyTorch & TensorFlow into one GUI — so you can engineer kernels and train LLMs without memorizing 1000 CLI commands.

**Problem:** 90% of AI training tutorials are CUDA-only. Beginners and even pros waste days translating CUDA workflows to ROCm, writing Triton kernels by hand in CLI.

**Solution:** Mandala is a low-code GUI dashboard that:
1.  Translates CUDA workflows to ROCm/HIP automatically
2.  Lets you develop, autotune, and deploy Triton kernels visually
3.  Trains LLMs with PyTorch/TensorFlow directly on AMD stack (ROCm)

**Built for AMD:**
- Runs on AMD Developer Cloud / MI300X / Radeon via ROCm
- Kernel layer: Triton + HIP
- AI layer: PyTorch, TensorFlow, ROCm libraries
- Backend: FastAPI (Python) | Frontend: Next.js

**Demo (Oct 18, 2026 MVP):**
- [Live Demo Video] 
- Runs at: http://localhost:3000 (frontend) + http://localhost:8000 (FastAPI)

**Quick Start:**
```bash
git clone https://github.com/Ghafardev/Mandala.git
cd Mandala
npm install
npm run dev
# backend
python -m venv .venv
source .venv/bin/activate # or .venv\Scripts\Activate on Windows
pip install -r requirements.txt
python main-api.py

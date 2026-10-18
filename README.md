# Mandala - AMD ROCm and Triton kernel inference for AI/LLM Training, CUDA Translation with GUI interface.

In Indonesian and Sanskrit cultures, Mandala symbolizes an energy center, an integrated structure, and a map of the cosmos. In the context of this application, Mandala represents a central command hub that brings together the entire complexity of the ROCm, Triton kernel, and LLM ecosystems into one harmonious interface.

mandala is a GUI based dashboard application. The main functions is to develop, train, and engineer LLM/AI models with ROCm and its stack, up to the kernel level; like triton, with a GUI-based low code interface, and help migration from CUDA based workflow without having to struggle with cli manual coding that takes a lot of time to remember every line of code, especially for beginners.

Installation tutorial :

clone this project with this script

 git clone https://github.com/Ghafardev/Mandala.git

dont forget to install npm and the required packages.

 npm install

run software

 npm run dev

application will open in http://localhost:3000 . access it from your favourite browser

also activate .venv for backend FastAPIservices ( optional )

 python -m venv .venv

 // for windows 
 .venv\Scripts\Activate

 // for linux
 source .venv/bin/activate
 
 pip install requirements.txt
 python main-api.py

Fastapi will actived in http://localhost:8000
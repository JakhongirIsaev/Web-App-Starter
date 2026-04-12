#!/bin/bash
set -e

ollama serve &
sleep 5

echo "[ollama] Pulling qwen2.5:7b..."
ollama pull qwen2.5:7b
echo "[ollama] Model ready."

wait

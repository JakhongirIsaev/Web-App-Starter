#!/bin/sh
set -eu

export OLLAMA_HOST="${OLLAMA_HOST:-0.0.0.0:11434}"
export OLLAMA_MODELS="${OLLAMA_MODELS:-/root/.ollama}"
export OLLAMA_MODEL="${OLLAMA_MODEL:-gemma3:4b}"

mkdir -p "${OLLAMA_MODELS}"

ollama serve &
OLLAMA_PID=$!

cleanup() {
  if kill -0 "${OLLAMA_PID}" >/dev/null 2>&1; then
    kill "${OLLAMA_PID}"
    wait "${OLLAMA_PID}" || true
  fi
}

trap cleanup EXIT INT TERM

until ollama list >/dev/null 2>&1; do
  sleep 2
done

if ! ollama list | awk 'NR>1 { print $1 }' | grep -qx "${OLLAMA_MODEL}"; then
  ollama pull "${OLLAMA_MODEL}"
fi

wait "${OLLAMA_PID}"

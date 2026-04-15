FROM ollama/ollama:0.9.6

# Run as non-root. The upstream image defaults to root and stores models
# in /root/.ollama which is unreadable for any other UID. We provision a
# dedicated UID 10001 with its own home directory and move the model cache
# there so `ollama pull` + `ollama serve` can read/write without root.
RUN groupadd --system --gid 10001 ollama-ai \
  && useradd --system --uid 10001 --gid 10001 --home-dir /home/ollama-ai --create-home --shell /bin/sh ollama-ai \
  && mkdir -p /home/ollama-ai/.ollama \
  && chown -R ollama-ai:ollama-ai /home/ollama-ai

ENV OLLAMA_HOST=0.0.0.0:11434
ENV OLLAMA_MODELS=/home/ollama-ai/.ollama
ENV OLLAMA_MODEL=gemma3:4b
ENV HOME=/home/ollama-ai

COPY --chown=ollama-ai:ollama-ai start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 11434

USER ollama-ai

ENTRYPOINT ["/bin/sh", "/start.sh"]

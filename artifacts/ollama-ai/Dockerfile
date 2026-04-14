FROM ollama/ollama:0.9.6

ENV OLLAMA_HOST=0.0.0.0:11434
ENV OLLAMA_MODELS=/root/.ollama
ENV OLLAMA_MODEL=gemma3:4b

COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 11434

ENTRYPOINT ["/bin/sh", "/start.sh"]

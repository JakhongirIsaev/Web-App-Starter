FROM ollama/ollama:latest

ENV OLLAMA_HOST=0.0.0.0:11434
ENV OLLAMA_MODELS=/root/.ollama
ENV OLLAMA_MODEL=gemma4:e2b

COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 11434

CMD ["/bin/bash", "/start.sh"]

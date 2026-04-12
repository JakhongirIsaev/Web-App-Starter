FROM ollama/ollama:latest

COPY artifacts/ollama-ai/start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 11434

CMD ["/bin/bash", "/start.sh"]

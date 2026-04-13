FROM node:24-bookworm-slim

WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates \
  curl \
  gnupg \
  iptables \
  libgdk-pixbuf2.0-0 \
  libgl1 \
  libglib2.0-0 \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  libsm6 \
  libxext6 \
  libxrender1 \
  python3 \
  python3-pip \
  python3-venv \
  shared-mime-info \
  && curl -fsSL https://pkgs.tailscale.com/stable/debian/bookworm.noarmor.gpg \
       -o /usr/share/keyrings/tailscale-archive-keyring.gpg \
  && curl -fsSL https://pkgs.tailscale.com/stable/debian/bookworm.tailscale-keyring.list \
       -o /etc/apt/sources.list.d/tailscale.list \
  && apt-get update && apt-get install -y --no-install-recommends tailscale \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && python3 -m pip install --no-cache-dir --break-system-packages uv

COPY . .

RUN uv sync --locked --no-dev --no-install-project && pnpm install --no-frozen-lockfile && pnpm --filter @workspace/api-server build

RUN chmod +x /app/artifacts/api-server/start.sh

ENV NODE_ENV=production

CMD ["/app/artifacts/api-server/start.sh"]

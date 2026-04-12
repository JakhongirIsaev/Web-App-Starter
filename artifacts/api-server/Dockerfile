FROM node:24-bookworm-slim

WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
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
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && python3 -m pip install --no-cache-dir --break-system-packages uv

COPY . .

RUN uv sync --locked --no-dev --no-install-project && pnpm install --no-frozen-lockfile && pnpm --filter @workspace/api-server build

ENV NODE_ENV=production

CMD ["pnpm", "run", "start:api-server"]

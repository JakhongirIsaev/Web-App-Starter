FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip python3-venv libglib2.0-0 libgl1 fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

COPY . .

RUN python3 -m venv /opt/venv \
  && /opt/venv/bin/pip install --no-cache-dir --upgrade pip \
  && /opt/venv/bin/pip install --no-cache-dir -r artifacts/api-server/requirements.txt

RUN pnpm install --frozen-lockfile
RUN pnpm run build:api-server

FROM node:22-bookworm-slim AS runtime

ENV PNPM_HOME=/pnpm
ENV PATH="/opt/venv/bin:$PNPM_HOME:$PATH"
ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 libglib2.0-0 libgl1 fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

COPY --from=build /opt/venv /opt/venv
COPY --from=build /app/.npmrc /app/.npmrc
COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/pnpm-lock.yaml /app/pnpm-lock.yaml
COPY --from=build /app/pnpm-workspace.yaml /app/pnpm-workspace.yaml
COPY --from=build /app/tsconfig.base.json /app/tsconfig.base.json
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/artifacts /app/artifacts
COPY --from=build /app/lib /app/lib
COPY --from=build /app/attached_assets /app/attached_assets

CMD ["pnpm", "run", "start:api-server"]

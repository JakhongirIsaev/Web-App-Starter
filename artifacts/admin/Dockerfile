FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV TZ=Asia/Tashkent

ARG PORT=3000
ARG BASE_PATH=/
ARG VITE_API_ORIGIN=

ENV PORT=$PORT
ENV BASE_PATH=$BASE_PATH
ENV VITE_API_ORIGIN=$VITE_API_ORIGIN

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY artifacts/admin/package.json artifacts/admin/package.json
COPY artifacts/mini-app/package.json artifacts/mini-app/package.json
COPY artifacts/api-server/package.json artifacts/api-server/package.json
COPY lib/db/package.json lib/db/package.json
COPY lib/api-zod/package.json lib/api-zod/package.json
COPY lib/api-spec/package.json lib/api-spec/package.json
COPY lib/api-client-react/package.json lib/api-client-react/package.json
COPY scripts/ scripts/
RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm run build:admin

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV TZ=Asia/Tashkent

RUN groupadd --gid 1001 appuser \
  && useradd --uid 1001 --gid appuser --shell /bin/sh --create-home appuser

COPY scripts/serve-spa.mjs scripts/serve-spa.mjs
COPY --from=build /app/artifacts/admin/dist/public dist/public

RUN chown -R appuser:appuser /app

USER appuser

CMD ["node", "scripts/serve-spa.mjs", "dist/public"]

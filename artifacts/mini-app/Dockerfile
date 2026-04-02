FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

ARG PORT=3000
ARG BASE_PATH=/
ARG VITE_API_ORIGIN=

ENV PORT=$PORT
ENV BASE_PATH=$BASE_PATH
ENV VITE_API_ORIGIN=$VITE_API_ORIGIN

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm run build:mini-app

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY scripts/serve-spa.mjs scripts/serve-spa.mjs
COPY --from=build /app/artifacts/mini-app/dist/public dist/public

CMD ["node", "scripts/serve-spa.mjs", "dist/public"]

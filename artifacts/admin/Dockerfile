FROM node:24-bookworm-slim AS build

WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV BASE_PATH=/

RUN corepack enable

COPY . .

RUN pnpm install --no-frozen-lockfile && pnpm --filter @workspace/admin build

FROM node:24-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/scripts/serve-spa.mjs ./scripts/serve-spa.mjs
COPY --from=build /app/artifacts/admin/dist/public ./dist/public

CMD ["node", "scripts/serve-spa.mjs", "dist/public"]

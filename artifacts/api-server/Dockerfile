FROM node:24-bookworm-slim

WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

COPY ../.. .

RUN pnpm install --no-frozen-lockfile

ENV PORT=3000
ENV BASE_PATH=/
RUN pnpm run build:admin

ENV PORT=3001
ENV BASE_PATH=/mini-app/
RUN pnpm run build:mini-app

RUN pnpm run build:api-server

ENV NODE_ENV=production

CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]

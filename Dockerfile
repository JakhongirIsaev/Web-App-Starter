FROM node:24-bookworm-slim

WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

COPY . .

RUN pnpm install --no-frozen-lockfile && pnpm run build:railway

ENV NODE_ENV=production

CMD ["pnpm", "run", "start:railway"]

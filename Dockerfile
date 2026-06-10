# Build stage
FROM node:26-alpine AS builder

WORKDIR /app

ENV PUBLIC_ADAPTER='docker-node'

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

# Production stage
FROM node:26-alpine

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

ENV PUBLIC_ADAPTER='docker-node'
ENV PORT=4173

COPY --from=builder --chown=appuser:appgroup /app/build ./build

USER appuser

EXPOSE 4173

CMD ["node", "build/index.js"]

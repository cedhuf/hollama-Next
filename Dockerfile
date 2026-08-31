# Build stage
FROM node:26-alpine AS builder

WORKDIR /app

ENV PUBLIC_ADAPTER='docker-node'

# Install the exact pnpm version pinned in package.json (packageManager field)
RUN npm install -g pnpm@11.5.2

# pnpm-workspace.yaml holds the allowBuilds config (esbuild/sharp/workerd),
# so it must be present before install or build scripts get blocked.
# `scripts/` comes along too: the `prepare` lifecycle runs during install and
# copies the pdf.js worker out of node_modules, so the script has to exist by
# then or the install fails outright.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY scripts ./scripts
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

# Production stage
FROM node:26-alpine

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

ENV PUBLIC_ADAPTER='docker-node'
ENV PORT=4173
# Request body cap (adapter-node default is only 512K, too small for chat image
# attachments which are base64-inlined). Override with -e BODY_SIZE_LIMIT=… (0 = unlimited).
ENV BODY_SIZE_LIMIT=25M

COPY --from=builder --chown=appuser:appgroup /app/build ./build
# The entry is adapter-node's own, plus the few lines that hand the HTTP server
# to the app so voice mode can accept a WebSocket on the same port. See the file.
COPY --from=builder --chown=appuser:appgroup /app/server.js ./server.js

USER appuser

EXPOSE 4173

CMD ["node", "server.js"]

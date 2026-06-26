# Agent backend (also spawns the stdio Vault MCP server as a child process).
FROM node:22-slim

RUN corepack enable
WORKDIR /app

# Install deps first for better layer caching.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json tsconfig.typecheck.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/policy-engine/package.json packages/policy-engine/
COPY packages/mcp-vault/package.json packages/mcp-vault/
COPY packages/agent/package.json packages/agent/
COPY apps/dashboard/package.json apps/dashboard/
RUN pnpm install --frozen-lockfile --filter "!dashboard"

# App source.
COPY packages ./packages
COPY mcp.config.json ./

ENV PORT=8787
EXPOSE 8787
CMD ["pnpm", "agent:start"]

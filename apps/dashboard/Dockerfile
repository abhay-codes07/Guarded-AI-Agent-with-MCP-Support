# Dashboard (Next.js). NEXT_PUBLIC_AGENT_URL is inlined at build time.
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /app

ARG NEXT_PUBLIC_AGENT_URL=http://localhost:8787
ENV NEXT_PUBLIC_AGENT_URL=$NEXT_PUBLIC_AGENT_URL

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/policy-engine/package.json packages/policy-engine/
COPY packages/mcp-vault/package.json packages/mcp-vault/
COPY packages/agent/package.json packages/agent/
COPY apps/dashboard/package.json apps/dashboard/
RUN pnpm install --frozen-lockfile --filter dashboard...

COPY apps/dashboard apps/dashboard
RUN pnpm --filter dashboard build

EXPOSE 3000
CMD ["pnpm", "--filter", "dashboard", "start"]

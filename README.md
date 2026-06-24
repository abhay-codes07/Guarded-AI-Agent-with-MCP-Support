# Guarded AI Agent with MCP Support

An AI agent that talks to **MCP servers** and a **policy layer that sits between the agent and
those servers** and enforces guardrails in real time — block tools, require human approval, validate
inputs, cap cost/token budgets, and defend against prompt injection.

The design goal is simple: **a tool call only runs if it provably belongs to a signed plan, came
from trusted data, and passes live policy. Otherwise it is denied at the gate — fail-closed.**

> Status: work in progress. The policy engine, custom MCP server, agent loop, and dashboard land
> incrementally.

## Why this is interesting

Most "guarded agent" demos check a blocklist inline in the agent loop. This project treats the
**policy engine as the heart of the system**: a standalone, unit-tested decision point that the
agent loop merely enforces. On top of that it adds an **intent layer** — the agent commits to a
cryptographically signed plan before acting, and every tool call is verified against it, so a tool
call that drifts from the plan (the signature of a prompt-injection attack) is rejected.

## Architecture

```
Dashboard (admin)  ──REST/WebSocket──►  Agent backend
  rules · approvals · audit · chat          │
                                            │  every tool call:
                                            ▼
                              ┌── Enforcement (PEP) ──┐
                              │  intent verify        │──►  Policy Engine (PDP)
                              │  taint / data-flow     │      pure, hot-reloadable, versioned
                              │  policy evaluate       │◄──  ALLOW / DENY / APPROVAL / TRANSFORM
                              │  human approval        │
                              └──────────┬─────────────┘
                                         │ allowed
                                         ▼
                              MCP Client Manager (live discovery, trust tiers,
                                 integrity pinning, circuit breaker)
                                  │ stdio            │ HTTP/SSE
                                  ▼                  ▼
                          Custom "Vault" server   Remote MCP server
```

## Monorepo layout

| Path | What |
|------|------|
| `packages/shared` | Cross-cutting types & zod schemas |
| `packages/policy-engine` | The PDP — pure, framework-free, unit-tested |
| `packages/mcp-vault` | A custom MCP server (file manager + record store) |
| `packages/agent` | MCP client manager, LLM tool-use loop, intent layer, enforcement, HTTP/WS API |
| `apps/dashboard` | Next.js admin UI |
| `mcp.config.json` | Registry of MCP servers — add one here and the agent discovers its tools at runtime |

## Core principles

- **No hardcoded tool lists.** Every tool is discovered from MCP servers at runtime.
- **The policy engine is a separate, self-contained module.** It has zero dependencies on the agent
  or MCP layers and is fully testable in isolation.
- **Dashboard changes propagate to the running agent without a restart.**
- **Fail-closed.** If the policy engine errors, a server is unreachable, or an approval times out,
  the call is denied — never silently allowed.

## Getting started

```bash
pnpm install
cp .env.example .env      # add your OPENAI_API_KEY
pnpm test                 # run the policy-engine test suite
```

More run instructions land as the agent and dashboard come online.

## License

MIT

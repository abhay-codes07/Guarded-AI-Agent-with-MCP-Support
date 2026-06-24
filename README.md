# Guarded AI Agent with MCP Support

An AI agent that talks to **MCP servers**, with a **policy layer that sits between the agent and
those servers** and enforces guardrails in real time. The guiding principle:

> **A tool call only runs if it provably belongs to a signed plan, came from trusted data, and
> passes live policy. Otherwise it is denied at the gate — fail-closed.**

Most "guarded agent" demos check a blocklist inline in the agent loop. This project instead treats
the **policy engine as the heart of the system** — a standalone, unit-tested decision point that the
agent loop merely enforces — and adds a cryptographic **intent layer**: the agent commits to a signed
plan before acting, and every tool call is verified against it, so a call that drifts from the plan
(the signature of a prompt-injection attack) is rejected.

---

## Highlights

- **Live tool discovery** across two transports — a custom **stdio** server and a remote **Streamable
  HTTP** server. No tool names are hardcoded anywhere; add a server to `mcp.config.json` and its
  tools appear automatically.
- **Policy engine as a separate module** (`packages/policy-engine`) with **zero** dependencies on the
  agent or MCP layers. Verdicts: `ALLOW / DENY / REQUIRE_APPROVAL / TRANSFORM`. Deterministic
  **deny-overrides + priority** conflict resolution. **Shadow (monitor) mode**. Content-addressed
  **policy versioning** stamped into every decision.
- **Cryptographic intent (mini Intent Assurance Plane):** the plan is committed as a **Merkle root**
  signed into an **Ed25519 JWT**; each call is checked for *signature + Merkle inclusion + argument
  constraints*. Catches "weaponized args" (right tool, malicious arguments), not just bad tool names.
- **Layered prompt-injection defense:** (1) tool-description **integrity pinning** (detects tool
  poisoning / rug-pulls), (2) **spotlighting + quarantine** of untrusted tool output, (3) **taint /
  data-flow** tracking (blocks untrusted data flowing into sensitive arguments), (4) **plan-drift**
  rejection (the structural backstop).
- **Live propagation:** rules created/toggled in the dashboard take effect on the next tool call via
  WebSocket — **no restart**.
- **Human approval done right:** signed, single-use, time-boxed grants bound to the exact call;
  approver offline ⇒ timeout ⇒ deny.
- **Tamper-evident audit log:** append-only, **hash-chained**, with a verify-chain action.
- **Fail-closed everywhere:** policy error, unreachable server, circuit-broken server, or expired
  approval all result in denial — never a silent allow.

---

## Architecture

```
Dashboard (Next.js)  ──REST + WebSocket──►  Agent backend (Fastify)
  rules · approvals · audit · chat               │
                                                 │  every tool call:
                                                 ▼
                                   ┌── Enforcement (PEP) ──┐
                                   │  1. intent verify      │──►  Policy Engine (PDP)
                                   │  2. taint / data-flow  │      pure · hot-reload · versioned
                                   │  3. policy evaluate    │◄──  ALLOW/DENY/APPROVAL/TRANSFORM
                                   │  4. human approval     │
                                   └──────────┬─────────────┘
                                              │ allowed
                                              ▼
                                   MCP Client Manager
                                   (live discovery · trust tiers ·
                                    integrity pinning · circuit breaker)
                                     │ stdio              │ Streamable HTTP
                                     ▼                    ▼
                             Custom "Vault" server   Remote MCP server
```

## Monorepo layout

| Path | What |
|------|------|
| `packages/shared` | Cross-cutting types & zod schemas |
| `packages/policy-engine` | The PDP — pure, framework-free, unit-tested (the heart) |
| `packages/mcp-vault` | A custom MCP server: sandboxed file manager + record store + secrets |
| `packages/agent` | MCP client manager, intent layer, taint, enforcement, audit, approvals, tool-use loop, HTTP/WS API |
| `apps/dashboard` | Next.js guardrails console |
| `mcp.config.json` | Registry of MCP servers — add one here and the agent discovers its tools at runtime |

---

## Getting started

Prerequisites: Node ≥ 20 and pnpm.

```bash
pnpm install
cp .env.example .env          # set OPENAI_API_KEY (model defaults to gpt-4o)

pnpm test                     # 29 tests across the policy engine, intent, audit, vault, and an
                              # end-to-end enforcement scenario (no LLM key required)

# Run the stack (two terminals):
pnpm agent                    # agent backend on :8787 (spawns the Vault MCP server itself)
pnpm dashboard                # dashboard on :3000
```

Then open <http://localhost:3000>. The dashboard connects to the agent at
`NEXT_PUBLIC_AGENT_URL` (default `http://localhost:8787`).

### Configuration

- `mcp.config.json` — the MCP servers. Ships with the local **Vault** (stdio, trusted) and the public
  remote **DeepWiki** server (HTTP, untrusted). Add another entry and it is discovered on boot.
- `.env` — `OPENAI_API_KEY`, `OPENAI_MODEL`, approval TTL, circuit-breaker thresholds, budget/kill
  switch limits, and optional Ed25519 signing keys (auto-generated if omitted). See `.env.example`.

---

## The Vault MCP server

A spec-compliant MCP server (`tools/list`, `tools/call`, JSON-Schema inputs, structured errors) over
stdio, exposing 7 tools: `list_files`, `read_file`, `write_file`, `query_records`, `fetch_updates`,
plus the deliberately dangerous `export_secret` and `delete_all` so the policy layer has real actions
to gate. Everything lives in a virtual `/sandbox` (no real disk access), with path-traversal
rejection.

It also ships two demo "traps":
- a seeded onboarding note containing an **indirect prompt-injection** payload, and
- a **rug-pull**: one tool's description mutates on re-listing, modelling tool poisoning — which the
  agent's integrity pinning detects and quarantines.

---

## How it answers the hard cases

- **MCP server crashes mid-call** — calls are wrapped with a timeout and surfaced to the model as a
  *structured* tool error; a per-server **circuit breaker** opens after repeated failures and
  short-circuits further calls; reconnect happens in the background. A failed call is never reported
  as success.
- **Prompt injection** — defense in depth: untrusted tool output is spotlighted and quarantined,
  tainted data cannot flow into sensitive arguments, and any call outside the **cryptographically
  signed plan** (or violating its argument constraints) is rejected. A successful injection still
  cannot grant capability the signed plan + policy didn't already allow.
- **Two rules conflict** — deterministic **deny-overrides** with a priority tiebreak; the winning and
  overridden rules are both recorded in the decision, so the outcome is explainable.
- **Approver offline** — approval requests have a TTL; on timeout the call is **denied** (fail-closed).
  Grants are signed, single-use, and bound to the exact call, so a stale approval can't be replayed.

---

## A 2-minute tour

1. Open the dashboard — see both MCP servers healthy and their tools discovered live.
2. **Chat:** "List the files under /sandbox/notes" → the agent plans, the plan is signed, the read is
   allowed, and the decision shows up in the audit log.
3. **Block live:** add a rule blocking `vault.delete_all`, then ask the agent to delete everything →
   denied on the next call, no restart.
4. **Approval:** the seed policy requires approval for `vault.export_secret`; ask for the secret →
   the call pauses in the approval queue. Approve it once; let the next one expire → denied.
5. **The trap:** "Summarize the onboarding note" → the note tries to hijack the agent into exporting a
   secret; the export is **outside the signed plan** and tainted → blocked, and the attempt is logged.
6. **Integrity:** click *Re-discover tools* → the rug-pulled tool is quarantined.
7. Click *Verify hash chain* on the audit log to confirm the trail is intact.

---

## Deployment

- **Local full stack (Docker):** `OPENAI_API_KEY=sk-... docker compose up --build` → dashboard on
  `:3000`, agent on `:8787`.
- **Backend** (`Dockerfile`) hosts well on Render / Railway / Fly. Set `OPENAI_API_KEY` and
  `CORS_ORIGIN` (your dashboard origin).
- **Dashboard** deploys to Vercel: set `NEXT_PUBLIC_AGENT_URL` to the deployed agent URL.

## Tech

TypeScript everywhere · pnpm workspaces · OpenAI (gpt-4o) function-calling · `@modelcontextprotocol/sdk`
· Fastify + ws · `jose` (Ed25519) · Next.js + Tailwind · Vitest.

## License

MIT

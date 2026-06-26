import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import type { WebSocket } from 'ws';
import { PolicyEngine, RuleStore, defaultRules } from '@gaa/policy-engine';
import { RuleInputSchema, type ServerEvent } from '@gaa/shared';
import { loadConfig } from './config.js';
import { IntentService } from './intent/intent.js';
import { McpManager } from './mcp/manager.js';
import { TaintRegistry } from './taint/taint.js';
import { AuditLog } from './audit/audit.js';
import { ApprovalManager } from './approvals/approvals.js';
import { Enforcer } from './enforcement.js';
import { AgentLoop } from './loop.js';
import { createOpenAI } from './llm.js';

async function main() {
  const config = loadConfig();

  // --- core wiring ---
  const intent = await IntentService.create(config.intentPrivateKey, config.intentPublicKey);
  const store = new RuleStore(defaultRules());
  const engine = new PolicyEngine(store);
  const taint = new TaintRegistry();
  const audit = new AuditLog();
  const approvals = new ApprovalManager((payload, ttl) => intent.signGrant(payload, ttl), config.approvalTtlMs);
  const mcp = new McpManager(config.mcpServers, {
    toolTimeoutMs: config.toolTimeoutMs,
    circuitFails: config.circuitFails,
    circuitResetMs: config.circuitResetMs,
  });
  await mcp.init();

  const enforcer = new Enforcer(engine, intent, taint, approvals, mcp, audit);
  const loop = new AgentLoop({
    openai: createOpenAI(config.openaiApiKey),
    model: config.openaiModel,
    mcp,
    intent,
    enforcer,
    maxSteps: config.maxLoopSteps,
    killSwitchViolations: config.killSwitchViolations,
  });

  // --- websocket fan-out ---
  const clients = new Set<WebSocket>();
  const broadcast = (event: ServerEvent) => {
    const data = JSON.stringify(event);
    for (const ws of clients) {
      try {
        ws.send(data);
      } catch {
        clients.delete(ws);
      }
    }
  };

  store.on('change', (rules: unknown[], version: string) =>
    broadcast({ type: 'rules', rules, policyVersion: version }),
  );
  audit.on('append', (entry) => broadcast({ type: 'audit', entry }));
  approvals.on('approval', (request) => broadcast({ type: 'approval', request }));
  mcp.on('servers', (servers) => broadcast({ type: 'servers', servers }));
  mcp.on('alert', (alert: { message: string }) => {
    audit.append({
      conversationId: 'system',
      tool: 'system.integrity',
      serverId: 'system',
      argsRedacted: alert,
      taint: false,
      riskScore: 80,
      verdict: 'EVENT',
      reason: alert.message,
      policyVersion: store.version(),
      latencyMs: 0,
      mode: 'enforce',
    });
  });
  loop.on('chat', (e: { conversationId: string; role: string; content: string; meta?: unknown }) =>
    broadcast({ type: 'chat', conversationId: e.conversationId, role: e.role, content: e.content, meta: e.meta }),
  );

  // --- HTTP API ---
  const app = Fastify({ logger: false });
  // Allow the configured origin, any *.vercel.app deploy (production + previews), and local dev.
  await app.register(cors, {
    origin: [config.corsOrigin, /\.vercel\.app$/, /localhost:\d+$/],
    credentials: true,
  });
  await app.register(websocket);

  app.get('/health', async () => ({ ok: true, model: config.openaiModel, hasKey: Boolean(config.openaiApiKey) }));

  app.get('/tools', async () => ({ tools: mcp.listTools(), active: mcp.activeTools().length }));
  app.get('/servers', async () => ({ servers: mcp.statuses() }));
  app.post('/mcp/refresh', async () => ({ tools: await mcp.discoverAll() }));

  app.get('/rules', async () => ({ rules: store.list(), policyVersion: store.version() }));
  app.post('/rules', async (req, reply) => {
    const parsed = RuleInputSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    return { rule: store.create(parsed.data) };
  });
  app.patch('/rules/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const updated = store.update(id, (req.body ?? {}) as Record<string, never>);
    if (!updated) return reply.code(404).send({ error: 'not found' });
    return { rule: updated };
  });
  app.delete('/rules/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!store.remove(id)) return reply.code(404).send({ error: 'not found' });
    return { ok: true };
  });

  app.get('/approvals', async () => ({ approvals: approvals.list() }));
  app.post('/approvals/:id/approve', async (req) => ({ ok: await approvals.approve((req.params as { id: string }).id) }));
  app.post('/approvals/:id/deny', async (req) => ({ ok: approvals.deny((req.params as { id: string }).id) }));

  app.get('/audit', async (req) => {
    const q = req.query as { conversationId?: string; limit?: string };
    return { entries: audit.list({ conversationId: q.conversationId, limit: q.limit ? Number(q.limit) : 200 }) };
  });
  app.get('/audit/verify', async () => audit.verifyChain());

  app.post('/chat', async (req, reply) => {
    const body = (req.body ?? {}) as { conversationId?: string; message?: string };
    if (!body.message) return reply.code(400).send({ error: 'message required' });
    if (!config.openaiApiKey) return reply.code(400).send({ error: 'OPENAI_API_KEY not set' });
    const conversationId = body.conversationId ?? randomUUID();
    try {
      const answer = await loop.runTurn(conversationId, body.message);
      return { conversationId, answer };
    } catch (err) {
      return reply.code(500).send({ error: (err as Error).message });
    }
  });

  app.post('/conversations/:id/clear', async (req) => {
    loop.clearFreeze((req.params as { id: string }).id);
    return { ok: true };
  });

  app.get('/ws', { websocket: true }, (socket: WebSocket) => {
    clients.add(socket);
    socket.send(JSON.stringify({ type: 'servers', servers: mcp.statuses() } satisfies ServerEvent));
    socket.on('close', () => clients.delete(socket));
  });

  await app.listen({ port: config.port, host: '0.0.0.0' });
  // eslint-disable-next-line no-console
  console.log(`[agent] listening on :${config.port} — ${mcp.activeTools().length} active tools, model ${config.openaiModel}`);

  const shutdown = async () => {
    await mcp.close();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[agent] fatal:', err);
  process.exit(1);
});

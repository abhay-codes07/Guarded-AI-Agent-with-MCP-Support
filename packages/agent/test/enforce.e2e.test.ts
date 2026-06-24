import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PolicyEngine, RuleStore, defaultRules } from '@gaa/policy-engine';
import type { Plan } from '@gaa/shared';
import { McpManager } from '../src/mcp/manager.js';
import { IntentService } from '../src/intent/intent.js';
import { TaintRegistry } from '../src/taint/taint.js';
import { AuditLog } from '../src/audit/audit.js';
import { ApprovalManager } from '../src/approvals/approvals.js';
import { Enforcer } from '../src/enforcement.js';

/**
 * Full enforcement stack against the real Vault MCP server (stdio), without the LLM. Proves the core
 * security guarantee deterministically: an agent that reads a poisoned file and then tries to export
 * a secret is stopped — by plan-drift, taint, and policy — and it's all audited.
 */
const tsxCli = fileURLToPath(new URL('../../../node_modules/tsx/dist/cli.mjs', import.meta.url));
const vaultServer = fileURLToPath(new URL('../../mcp-vault/src/server.ts', import.meta.url));

let mcp: McpManager;
let intent: IntentService;
let taint: TaintRegistry;
let audit: AuditLog;
let enforcer: Enforcer;

beforeAll(async () => {
  mcp = new McpManager(
    [
      {
        id: 'vault',
        label: 'vault',
        transport: 'stdio',
        command: process.execPath,
        args: [tsxCli, vaultServer],
        trustTier: 'trusted',
      },
    ],
    { toolTimeoutMs: 10000, circuitFails: 3, circuitResetMs: 5000 },
  );
  await mcp.init();

  intent = await IntentService.create();
  taint = new TaintRegistry();
  audit = new AuditLog();
  const store = new RuleStore(defaultRules());
  const engine = new PolicyEngine(store);
  const approvals = new ApprovalManager((p, ttl) => intent.signGrant(p, ttl), 200);
  enforcer = new Enforcer(engine, intent, taint, approvals, mcp, audit);
}, 30000);

afterAll(async () => {
  await mcp.close();
});

const usage = { tokens: 0, costUsd: 0 };

describe('end-to-end enforcement (no LLM)', () => {
  it('discovers the vault tools live', () => {
    expect(mcp.activeTools().map((t) => t.id)).toContain('vault.read_file');
  });

  it('allows in-plan reads and blocks the injected secret export', async () => {
    const convo = 'attack';
    const plan: Plan = {
      goal: 'summarize the onboarding note',
      steps: [
        { tool: 'vault.list_files', argConstraints: [] },
        { tool: 'vault.read_file', argConstraints: [{ path: 'path', pathPrefix: '/sandbox/' }] },
      ],
    };
    await intent.issue(convo, plan);

    // In-plan read of the poisoned note → allowed, and its content becomes tainted.
    const read = await enforcer.enforce({
      conversationId: convo,
      toolId: 'vault.read_file',
      args: { path: '/sandbox/notes/onboarding.txt' },
      usage,
    });
    expect(read.decision.verdict).toBe('ALLOW');
    expect(read.resultText).toMatch(/onboarding/i);

    // The injection wants this next: export_secret. It is NOT in the signed plan → drift → DENY.
    const exfil = await enforcer.enforce({
      conversationId: convo,
      toolId: 'vault.export_secret',
      args: { name: 'prod_db_password' },
      usage,
    });
    expect(exfil.blocked).toBe(true);
    expect(exfil.decision.verdict).toBe('DENY');
    expect(exfil.resultText).not.toMatch(/CORRECT-HORSE/); // the real secret never leaked
  });

  it('blocks a destructive tool via the seed block rule even if it were planned', async () => {
    const convo = 'destroy';
    await intent.issue(convo, { goal: 'cleanup', steps: [{ tool: 'vault.delete_all', argConstraints: [] }] });
    const res = await enforcer.enforce({ conversationId: convo, toolId: 'vault.delete_all', args: {}, usage });
    expect(res.blocked).toBe(true);
    expect(res.decision.matchedRuleId).toBe('seed-block-delete-all');
  });

  it('writes a tamper-evident audit trail', () => {
    expect(audit.verifyChain().ok).toBe(true);
    expect(audit.list().length).toBeGreaterThan(0);
  });
});

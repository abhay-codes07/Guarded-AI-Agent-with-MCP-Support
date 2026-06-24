import type { AuditEntry, Decision, PolicyContext, TrustTier } from '@gaa/shared';
import { PolicyEngine, applySanitizer, sha256Hex, stableStringify } from '@gaa/policy-engine';
import type { IntentService } from './intent/intent.js';
import type { McpManager } from './mcp/manager.js';
import { TaintRegistry, injectionRiskScore } from './taint/taint.js';
import type { ApprovalManager } from './approvals/approvals.js';
import type { AuditLog } from './audit/audit.js';

export interface EnforceParams {
  conversationId: string;
  toolId: string; // namespaced "serverId.tool"
  args: unknown;
  usage: { tokens: number; costUsd: number };
}

export interface EnforceResult {
  decision: Decision;
  blocked: boolean;
  resultText: string; // fed back to the model
  isError: boolean;
  audit: AuditEntry;
}

/**
 * Policy Enforcement Point. The single seam between "what the model wants" and "what runs". It
 * assembles the PolicyContext (cryptographic intent verification + data-flow taint + risk), asks the
 * Policy Engine for a Decision, applies it (deny / transform / human approval / allow), executes the
 * tool through the MCP manager only when permitted, and writes one tamper-evident audit entry.
 * No policy logic lives here — that is all in the engine. No tool runs anywhere else.
 */
export class Enforcer {
  constructor(
    private readonly engine: PolicyEngine,
    private readonly intent: IntentService,
    private readonly taint: TaintRegistry,
    private readonly approvals: ApprovalManager,
    private readonly mcp: McpManager,
    private readonly audit: AuditLog,
  ) {}

  async enforce(params: EnforceParams): Promise<EnforceResult> {
    const started = Date.now();
    const { conversationId, toolId, usage } = params;
    let args = params.args;

    const tool = this.mcp.getTool(toolId);
    const serverId = tool?.serverId ?? toolId.split('.')[0] ?? 'unknown';
    const trustTier: TrustTier = tool?.trustTier ?? 'untrusted';
    const argsRedacted = applySanitizer('redactSecrets', args);

    // Quarantined tools (integrity-pin violation) are hard-denied regardless of policy.
    if (tool?.quarantined) {
      return this.finish(started, conversationId, toolId, serverId, argsRedacted, false, 0, {
        verdict: 'DENY',
        reason: `Tool quarantined: ${tool.quarantineReason ?? 'integrity violation'}`,
        matchedRuleId: 'system:quarantine',
        losingRuleIds: [],
        policyVersion: 'n/a',
        mode: 'enforce',
      });
    }

    // Build the decision context.
    const planVerify = await this.intent.verifyCall(conversationId, toolId, args);
    const taintInfo = this.taint.check(conversationId, args);
    const riskScore = Math.min(
      100,
      injectionRiskScore(stableStringify(args)) + (taintInfo.tainted ? 40 : 0),
    );
    const ctx: PolicyContext = {
      tool: toolId,
      serverId,
      trustTier,
      args,
      conversationId,
      planVerify,
      taint: taintInfo,
      riskScore,
      usage,
    };

    let decision = this.engine.safeEvaluate(ctx);

    // Apply the decision.
    if (decision.verdict === 'DENY') {
      return this.finish(started, conversationId, toolId, serverId, argsRedacted, taintInfo.tainted, riskScore, decision);
    }

    if (decision.verdict === 'TRANSFORM') {
      args = decision.transformedArgs ?? args;
    }

    if (decision.verdict === 'REQUIRE_APPROVAL') {
      const argHash = sha256Hex(`${toolId}\n${stableStringify(args)}`);
      const outcome = await this.approvals.request({
        conversationId,
        tool: toolId,
        serverId,
        argsRedacted,
        argHash,
        reason: decision.reason,
      });
      if (outcome.status !== 'approved') {
        const denied: Decision = {
          ...decision,
          verdict: 'DENY',
          reason: `Approval ${outcome.status} (fail-closed)`,
        };
        return this.finish(started, conversationId, toolId, serverId, argsRedacted, taintInfo.tainted, riskScore, denied);
      }
      // Re-verify the signed grant is bound to this exact call before proceeding.
      const grant = outcome.grantJwt ? await this.intent.verifyGrant(outcome.grantJwt) : null;
      if (!grant || grant.argHash !== argHash || grant.tool !== toolId) {
        const denied: Decision = { ...decision, verdict: 'DENY', reason: 'Approval grant invalid/mismatched' };
        return this.finish(started, conversationId, toolId, serverId, argsRedacted, taintInfo.tainted, riskScore, denied);
      }
      decision = { ...decision, verdict: 'ALLOW', reason: `Approved by human (${decision.reason})` };
    }

    // ALLOW (or approved/transformed) → execute through MCP.
    const name = tool?.name ?? toolId.slice(serverId.length + 1);
    const exec = await this.mcp.callTool(serverId, name, args);

    // Every tool result is untrusted data: record it for downstream data-flow checks.
    this.taint.record(conversationId, toolId, exec.text);

    return this.finish(
      started,
      conversationId,
      toolId,
      serverId,
      argsRedacted,
      taintInfo.tainted,
      riskScore,
      decision,
      exec.text,
      exec.isError,
    );
  }

  private finish(
    started: number,
    conversationId: string,
    toolId: string,
    serverId: string,
    argsRedacted: unknown,
    tainted: boolean,
    riskScore: number,
    decision: Decision,
    resultText?: string,
    isError = false,
  ): EnforceResult {
    const blocked = decision.verdict === 'DENY';
    const text = blocked
      ? `[BLOCKED by policy] ${decision.reason}`
      : resultText ?? '(no output)';
    const audit = this.audit.append({
      conversationId,
      tool: toolId,
      serverId,
      argsRedacted,
      taint: tainted,
      riskScore,
      verdict: decision.verdict,
      reason: decision.reason,
      matchedRuleId: decision.matchedRuleId,
      policyVersion: decision.policyVersion,
      planId: undefined,
      latencyMs: Date.now() - started,
      mode: decision.mode,
    });
    return { decision, blocked, resultText: text, isError: blocked ? true : isError, audit };
  }
}

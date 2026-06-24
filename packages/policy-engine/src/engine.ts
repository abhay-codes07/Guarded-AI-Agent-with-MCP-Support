import type { Decision, PolicyContext, Rule, Verdict } from '@gaa/shared';
import { resolveConflicts } from './conflict.js';
import { ruleMatches } from './matcher.js';
import { applySanitizer } from './sanitizers.js';
import type { RuleStore } from './store.js';

export interface EvaluateOptions {
  /** when true (default), a failed intent/plan verification denies the call (the IAP backstop). */
  enforceIntent?: boolean;
}

/** Synthetic rule id used when the cryptographic intent check fails. */
export const INTENT_DRIFT_RULE = 'system:intent-drift';

/**
 * The Policy Decision Point. Pure with respect to its inputs: given a fully-built PolicyContext
 * it returns a Decision. It never executes tools or talks to MCP — that is the PEP's job.
 *
 * Precedence:
 *   1. Cryptographic intent: a call that is not covered by the signed plan (drift) is DENIED,
 *      and this cannot be overridden by an admin ALLOW rule (security invariant).
 *   2. Admin rules (enforce mode): strongest verdict wins via deny-overrides + priority.
 *   3. Default ALLOW if nothing matches (shadow rules never block; they only annotate).
 */
export class PolicyEngine {
  constructor(private readonly store: RuleStore) {}

  evaluate(ctx: PolicyContext, opts: EvaluateOptions = {}): Decision {
    const enforceIntent = opts.enforceIntent ?? true;
    const policyVersion = this.store.version();

    // (1) Intent / plan-drift backstop — highest precedence.
    if (enforceIntent && !ctx.planVerify.ok) {
      return {
        verdict: 'DENY',
        reason: `Plan drift: ${ctx.planVerify.reason}`,
        matchedRuleId: INTENT_DRIFT_RULE,
        losingRuleIds: [],
        policyVersion,
        mode: 'enforce',
      };
    }

    // (2) Admin rules.
    const rules = this.store.list().filter((r) => r.enabled);
    const matches = rules.filter((r) => ruleMatches(r, ctx));
    const enforceMatches = matches.filter((r) => r.mode === 'enforce');
    const shadowMatches = matches.filter((r) => r.mode === 'shadow');

    const shadow = this.shadowAnnotation(shadowMatches);
    const resolved = resolveConflicts(enforceMatches);

    if (!resolved) {
      // (3) Default allow.
      return {
        verdict: 'ALLOW',
        reason: 'No matching rule; default allow',
        losingRuleIds: [],
        policyVersion,
        mode: 'enforce',
        ...(shadow ? { shadow } : {}),
      };
    }

    const { winner, losers } = resolved;
    const decision: Decision = {
      verdict: winner.action,
      reason: `Rule "${winner.name}" (${winner.kind}) → ${winner.action}`,
      matchedRuleId: winner.id,
      losingRuleIds: losers.map((r) => r.id),
      policyVersion,
      mode: 'enforce',
      ...(shadow ? { shadow } : {}),
    };

    if (winner.action === 'TRANSFORM' && winner.sanitizer) {
      decision.transformedArgs = applySanitizer(winner.sanitizer, ctx.args);
    }

    return decision;
  }

  /** Fail-closed wrapper: any thrown error becomes a DENY. */
  safeEvaluate(ctx: PolicyContext, opts: EvaluateOptions = {}): Decision {
    try {
      return this.evaluate(ctx, opts);
    } catch (err) {
      return {
        verdict: 'DENY',
        reason: `Policy engine error (fail-closed): ${(err as Error).message}`,
        matchedRuleId: 'system:fail-closed',
        losingRuleIds: [],
        policyVersion: 'unknown',
        mode: 'enforce',
      };
    }
  }

  private shadowAnnotation(shadowMatches: Rule[]): Decision['shadow'] {
    const resolved = resolveConflicts(shadowMatches);
    if (!resolved) return undefined;
    const blocking: Verdict[] = ['DENY', 'REQUIRE_APPROVAL'];
    if (!blocking.includes(resolved.winner.action)) return undefined;
    return {
      wouldVerdict: resolved.winner.action,
      ruleId: resolved.winner.id,
      reason: `Shadow rule "${resolved.winner.name}" would have ${resolved.winner.action}`,
    };
  }
}

import type { PolicyContext, Rule, RuleMatch } from '@gaa/shared';
import { collectStrings, getByPath, matchGlob } from './util.js';

/**
 * Does a rule's match predicate apply to this tool call? All present fields must hold (AND).
 * Absent fields are wildcards. Pure and side-effect free.
 */
export function ruleMatches(rule: Rule, ctx: PolicyContext): boolean {
  const m: RuleMatch = rule.match;

  if (m.toolGlob !== undefined && !matchGlob(m.toolGlob, ctx.tool)) return false;
  if (m.serverId !== undefined && m.serverId !== ctx.serverId) return false;
  if (m.trustTier !== undefined && m.trustTier !== ctx.trustTier) return false;
  if (m.tainted !== undefined && m.tainted !== ctx.taint.tainted) return false;
  if (m.riskAtLeast !== undefined && ctx.riskScore < m.riskAtLeast) return false;
  if (m.tokenBudget !== undefined && ctx.usage.tokens < m.tokenBudget) return false;
  if (m.costBudgetUsd !== undefined && ctx.usage.costUsd < m.costBudgetUsd) return false;

  // Argument predicates. If argPath is given, test that field; otherwise scan all string args.
  if (m.argRegex !== undefined || m.argNotRegex !== undefined) {
    const values =
      m.argPath !== undefined ? [stringify(getByPath(ctx.args, m.argPath))] : collectStrings(ctx.args);

    if (m.argRegex !== undefined) {
      // Fires when at least one value MATCHES (e.g. detect a forbidden pattern).
      const re = new RegExp(m.argRegex);
      const anyMatch = values.some((v) => v !== undefined && re.test(v));
      if (!anyMatch) return false;
    }
    if (m.argNotRegex !== undefined) {
      // Allowlist semantics: fires when at least one value does NOT match the required pattern
      // (e.g. argNotRegex "^/sandbox/" fires when a path escapes the sandbox).
      const re = new RegExp(m.argNotRegex);
      const anyViolation = values.some((v) => v !== undefined && !re.test(v));
      if (!anyViolation) return false;
    }
  } else if (m.argPath !== undefined) {
    // argPath given with no regex → applies only when that field is present.
    if (getByPath(ctx.args, m.argPath) === undefined) return false;
  }

  return true;
}

function stringify(v: unknown): string | undefined {
  if (v === undefined) return undefined;
  return typeof v === 'string' ? v : JSON.stringify(v);
}

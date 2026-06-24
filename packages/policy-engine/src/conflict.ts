import type { Rule, Verdict } from '@gaa/shared';

/** Deny-overrides ranking. Higher wins. */
const RANK: Record<Verdict, number> = {
  DENY: 3,
  REQUIRE_APPROVAL: 2,
  TRANSFORM: 1,
  ALLOW: 0,
};

export interface ConflictResult {
  winner: Rule;
  losers: Rule[];
}

/**
 * Resolve a set of matching rules into a single winning rule.
 *
 * Semantics (deterministic, documented in THREAT_MODEL.md):
 *   1. Strongest verdict wins (DENY > REQUIRE_APPROVAL > TRANSFORM > ALLOW).
 *   2. Ties broken by lowest `priority` number (admin intent).
 *   3. Further ties broken by rule id (stable).
 *
 * Shadow-mode rules participate in selection so the dashboard can report what *would* have
 * happened, but the caller is responsible for not enforcing a shadow winner.
 */
export function resolveConflicts(matching: Rule[]): ConflictResult | null {
  if (matching.length === 0) return null;

  const sorted = [...matching].sort((a, b) => {
    const r = RANK[b.action] - RANK[a.action];
    if (r !== 0) return r;
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const winner = sorted[0]!;
  return { winner, losers: sorted.slice(1) };
}

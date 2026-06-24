import { z } from 'zod';

/** The four verdicts the policy engine can return for a tool call. */
export const VerdictSchema = z.enum(['ALLOW', 'DENY', 'REQUIRE_APPROVAL', 'TRANSFORM']);
export type Verdict = z.infer<typeof VerdictSchema>;

/** How much we trust a given MCP server. Remote servers default to 'untrusted'. */
export const TrustTierSchema = z.enum(['trusted', 'untrusted']);
export type TrustTier = z.infer<typeof TrustTierSchema>;

export const RuleKindSchema = z.enum(['block', 'approval', 'input', 'budget', 'injection']);
export type RuleKind = z.infer<typeof RuleKindSchema>;

export const RuleModeSchema = z.enum(['enforce', 'shadow']);
export type RuleMode = z.infer<typeof RuleModeSchema>;

export const SanitizerSchema = z.enum(['redactSecrets', 'clampPath']);
export type Sanitizer = z.infer<typeof SanitizerSchema>;

/**
 * Predicate describing which tool calls a rule applies to. All present fields must match (AND).
 * Absent fields are wildcards. No tool names are hardcoded in code — they live here, authored
 * through the dashboard.
 */
export const RuleMatchSchema = z
  .object({
    /** glob over the namespaced tool id, e.g. "vault.*" or "vault.delete_all". */
    toolGlob: z.string().optional(),
    serverId: z.string().optional(),
    trustTier: TrustTierSchema.optional(),
    /** dot/bracket path into the tool args, e.g. "path" or "filter.name". */
    argPath: z.string().optional(),
    /** the value at argPath must match this regex. */
    argRegex: z.string().optional(),
    /** the value at argPath must NOT match this regex (e.g. must stay under /sandbox/). */
    argNotRegex: z.string().optional(),
    /** match only when the call carries untrusted/tainted data. */
    tainted: z.boolean().optional(),
    /** match when the computed risk score is >= this threshold (0..100). */
    riskAtLeast: z.number().min(0).max(100).optional(),
    /** match when conversation token usage is at/over this budget. */
    tokenBudget: z.number().int().positive().optional(),
    /** match when conversation USD cost is at/over this budget. */
    costBudgetUsd: z.number().positive().optional(),
  })
  .strict();
export type RuleMatch = z.infer<typeof RuleMatchSchema>;

export const RuleSchema = z
  .object({
    id: z.string(),
    name: z.string().min(1),
    kind: RuleKindSchema,
    /** lower number = evaluated first; used to break conflicts deterministically. */
    priority: z.number().int().default(100),
    enabled: z.boolean().default(true),
    mode: RuleModeSchema.default('enforce'),
    match: RuleMatchSchema,
    action: VerdictSchema,
    /** only meaningful when action === 'TRANSFORM'. */
    sanitizer: SanitizerSchema.optional(),
    description: z.string().optional(),
    createdAt: z.string().optional(),
  })
  .strict();
export type Rule = z.infer<typeof RuleSchema>;

/** Shape accepted from the dashboard when creating a rule (id/createdAt assigned server-side). */
export const RuleInputSchema = RuleSchema.omit({ id: true, createdAt: true }).partial({
  priority: true,
  enabled: true,
  mode: true,
});
export type RuleInput = z.infer<typeof RuleInputSchema>;

/** Result of verifying a tool call against the signed intent/plan. */
export interface PlanVerifyResult {
  ok: boolean;
  reason: string;
  planId?: string;
  stepIndex?: number;
}

export interface TaintInfo {
  tainted: boolean;
  /** human-readable origins of the tainted data found in the args, e.g. ["vault.read_file"]. */
  origins: string[];
}

/** Everything the policy engine needs to decide a single tool call. Built by the PEP. */
export interface PolicyContext {
  tool: string;
  serverId: string;
  trustTier: TrustTier;
  args: unknown;
  conversationId: string;
  planVerify: PlanVerifyResult;
  taint: TaintInfo;
  riskScore: number;
  usage: { tokens: number; costUsd: number };
}

export interface Decision {
  verdict: Verdict;
  reason: string;
  matchedRuleId?: string;
  /** rules that matched but lost the conflict resolution — kept for explainability. */
  losingRuleIds: string[];
  policyVersion: string;
  mode: RuleMode;
  transformedArgs?: unknown;
  /** if a shadow-mode rule would have produced a stronger verdict, recorded here (does not block). */
  shadow?: { wouldVerdict: Verdict; ruleId: string; reason: string };
}

import { z } from 'zod';

/**
 * Constraint on a single argument field, committed into the signed plan. At call time the actual
 * args must satisfy the constraint or the call is treated as plan drift (DENY).
 */
export const ArgConstraintSchema = z
  .object({
    /** dot/bracket path into the args object, e.g. "path" or "filter.name". */
    path: z.string(),
    /** the value must start with this prefix (e.g. "/sandbox/"). */
    pathPrefix: z.string().optional(),
    /** the value must match this regex. */
    regex: z.string().optional(),
    /** the value must be one of these. */
    enum: z.array(z.string()).optional(),
    maxLen: z.number().int().positive().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    required: z.boolean().optional(),
  })
  .strict();
export type ArgConstraint = z.infer<typeof ArgConstraintSchema>;

/** One intended step of the agent's plan. */
export const PlanStepSchema = z
  .object({
    tool: z.string(),
    rationale: z.string().optional(),
    argConstraints: z.array(ArgConstraintSchema).default([]),
  })
  .strict();
export type PlanStep = z.infer<typeof PlanStepSchema>;

export const PlanSchema = z
  .object({
    goal: z.string(),
    steps: z.array(PlanStepSchema),
  })
  .strict();
export type Plan = z.infer<typeof PlanSchema>;

/** A signed commitment to a plan: the intent token. */
export interface IntentToken {
  /** EdDSA-signed JWT embedding { sub: conversationId, planId, root, iat, exp }. */
  jwt: string;
  planId: string;
  /** Merkle root over the plan's step leaves (hex). */
  merkleRoot: string;
}

/** A Merkle inclusion proof that a given leaf belongs under a signed root. */
export interface MerkleProof {
  leaf: string;
  index: number;
  /** sibling hashes from leaf to root. */
  siblings: string[];
}

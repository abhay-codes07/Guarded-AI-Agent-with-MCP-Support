import { randomUUID } from 'node:crypto';
import {
  importPKCS8,
  importSPKI,
  generateKeyPair,
  SignJWT,
  jwtVerify,
  type KeyLike,
} from 'jose';
import type { ArgConstraint, Plan, PlanStep, PlanVerifyResult } from '@gaa/shared';
import { stableStringify } from '@gaa/policy-engine';
import { getByPath } from '@gaa/policy-engine';
import { buildMerkleTree, leafHash, merkleProof, verifyMerkleProof } from './merkle.js';

const ALG = 'EdDSA';

interface SignedPlan {
  planId: string;
  conversationId: string;
  steps: PlanStep[];
  leaves: string[];
  root: string;
  jwt: string;
}

/** Canonical leaf for a plan step: the tool plus its committed argument constraints. */
function stepLeaf(step: PlanStep): string {
  return leafHash(`${step.tool}\n${stableStringify(step.argConstraints)}`);
}

/**
 * The Intent Assurance Plane. Captures the agent's plan, commits it as a Merkle root signed into an
 * Ed25519 JWT ("intent token"), and verifies every later tool call against that signed plan. A call
 * that is not covered by the plan — or whose args violate the committed constraints — is plan drift.
 */
export class IntentService {
  private priv!: KeyLike;
  private pub!: KeyLike;
  private plans = new Map<string, SignedPlan>(); // conversationId -> current signed plan

  private constructor() {}

  static async create(privatePem?: string, publicPem?: string): Promise<IntentService> {
    const svc = new IntentService();
    if (privatePem && publicPem) {
      svc.priv = await importPKCS8(privatePem, ALG);
      svc.pub = await importSPKI(publicPem, ALG);
    } else {
      const { privateKey, publicKey } = await generateKeyPair(ALG);
      svc.priv = privateKey;
      svc.pub = publicKey;
    }
    return svc;
  }

  async issue(conversationId: string, plan: Plan): Promise<SignedPlan> {
    const planId = randomUUID();
    const leaves = plan.steps.map(stepLeaf);
    const { root } = buildMerkleTree(leaves);
    const jwt = await new SignJWT({ planId, root, goal: plan.goal })
      .setProtectedHeader({ alg: ALG })
      .setSubject(conversationId)
      .setIssuedAt()
      .setExpirationTime('30m')
      .sign(this.priv);
    const signed: SignedPlan = { planId, conversationId, steps: plan.steps, leaves, root, jwt };
    this.plans.set(conversationId, signed);
    return signed;
  }

  getPlan(conversationId: string): SignedPlan | undefined {
    return this.plans.get(conversationId);
  }

  /**
   * Verify a tool call against the conversation's signed plan.
   * Checks: a signed plan exists, its JWT is valid, the (tool, args) matches a committed step
   * (with a Merkle inclusion proof under the signed root), and the args satisfy that step's
   * argument constraints. Any failure => plan drift.
   */
  async verifyCall(conversationId: string, tool: string, args: unknown): Promise<PlanVerifyResult> {
    const plan = this.plans.get(conversationId);
    if (!plan) return { ok: false, reason: 'no signed plan for this conversation' };

    try {
      await jwtVerify(plan.jwt, this.pub, { subject: conversationId });
    } catch (err) {
      return { ok: false, reason: `intent token invalid: ${(err as Error).message}`, planId: plan.planId };
    }

    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i]!;
      if (step.tool !== tool) continue;
      if (!argsSatisfy(step.argConstraints, args)) continue;
      const proof = merkleProof(plan.leaves, i);
      if (verifyMerkleProof(plan.leaves[i]!, proof, plan.root)) {
        return { ok: true, reason: 'covered by signed plan', planId: plan.planId, stepIndex: i };
      }
    }
    return {
      ok: false,
      reason: `call to "${tool}" not covered by signed plan (or args violate committed constraints)`,
      planId: plan.planId,
    };
  }

  /** Sign an arbitrary short-lived JWT (used for single-use approval grants). */
  async signGrant(payload: Record<string, unknown>, ttlSeconds: number): Promise<string> {
    return new SignJWT(payload)
      .setProtectedHeader({ alg: ALG })
      .setIssuedAt()
      .setExpirationTime(`${ttlSeconds}s`)
      .sign(this.priv);
  }

  async verifyGrant(jwt: string): Promise<Record<string, unknown> | null> {
    try {
      const { payload } = await jwtVerify(jwt, this.pub);
      return payload as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

function argsSatisfy(constraints: ArgConstraint[], args: unknown): boolean {
  for (const c of constraints) {
    const value = getByPath(args, c.path);
    if (value === undefined) {
      if (c.required) return false;
      continue;
    }
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    if (c.pathPrefix !== undefined && !str.startsWith(c.pathPrefix)) return false;
    if (c.regex !== undefined && !new RegExp(c.regex).test(str)) return false;
    if (c.enum !== undefined && !c.enum.includes(str)) return false;
    if (c.maxLen !== undefined && str.length > c.maxLen) return false;
    if (typeof value === 'number') {
      if (c.min !== undefined && value < c.min) return false;
      if (c.max !== undefined && value > c.max) return false;
    }
  }
  return true;
}

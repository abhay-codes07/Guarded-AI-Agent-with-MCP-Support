import type { Verdict } from './policy.js';

/** A tamper-evident audit log entry. Each entry hash-chains to the previous one. */
export interface AuditEntry {
  id: string;
  ts: string;
  conversationId: string;
  /** namespaced tool id, e.g. "vault.read_file"; or a system event name for non-call entries. */
  tool: string;
  serverId: string;
  /** args with secrets redacted. */
  argsRedacted: unknown;
  taint: boolean;
  riskScore: number;
  verdict: Verdict | 'EVENT';
  reason: string;
  matchedRuleId?: string;
  policyVersion: string;
  planId?: string;
  latencyMs: number;
  mode: 'enforce' | 'shadow';
  /** hash of the previous entry (hex); genesis uses a fixed seed. */
  prevHash: string;
  /** sha256(prevHash + canonical(entry without hash)) (hex). */
  hash: string;
}

export interface ChainVerification {
  ok: boolean;
  length: number;
  /** index of the first broken entry, if any. */
  brokenAt?: number;
  message: string;
}

export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired';

export interface ApprovalRequest {
  id: string;
  conversationId: string;
  tool: string;
  serverId: string;
  argsRedacted: unknown;
  /** hash of the exact (tool,args) this approval is bound to. */
  argHash: string;
  reason: string;
  createdAt: string;
  expiresAt: string;
  status: ApprovalStatus;
}

/** A signed, single-use, time-boxed grant authorizing one specific call. */
export interface ApprovalGrant {
  requestId: string;
  /** EdDSA-signed JWT bound to { conversationId, tool, argHash, jti }, single-use. */
  jwt: string;
}

export interface DiscoveredTool {
  /** namespaced id: `${serverId}.${name}`. */
  id: string;
  name: string;
  serverId: string;
  trustTier: 'trusted' | 'untrusted';
  title?: string;
  description?: string;
  inputSchema: unknown;
  /** sha256 of name+description+schema, pinned on first discovery (TOFU). */
  descHash: string;
  /** true if a later listing changed descHash (rug-pull / tool poisoning). */
  quarantined: boolean;
  quarantineReason?: string;
}

export type ServerHealth = 'healthy' | 'degraded' | 'down';

export interface ServerStatus {
  id: string;
  label: string;
  transport: 'stdio' | 'http';
  trustTier: 'trusted' | 'untrusted';
  health: ServerHealth;
  toolCount: number;
  circuitOpen: boolean;
  lastError?: string;
}

/** WebSocket event envelope pushed from the agent to the dashboard. */
export type ServerEvent =
  | { type: 'rules'; rules: unknown[]; policyVersion: string }
  | { type: 'audit'; entry: AuditEntry }
  | { type: 'approval'; request: ApprovalRequest }
  | { type: 'servers'; servers: ServerStatus[] }
  | { type: 'chat'; conversationId: string; role: string; content: string; meta?: unknown };

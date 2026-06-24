import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { ApprovalRequest, ApprovalStatus } from '@gaa/shared';

export interface ApprovalOutcome {
  status: ApprovalStatus;
  grantJwt?: string;
}

interface Pending {
  request: ApprovalRequest;
  resolve: (o: ApprovalOutcome) => void;
  timer: NodeJS.Timeout;
}

type Signer = (payload: Record<string, unknown>, ttlSeconds: number) => Promise<string>;

/**
 * Manages human-in-the-loop approvals. A request blocks the agent loop until an admin approves or
 * denies it, or until it times out. On timeout the call is DENIED (fail-closed) — an offline
 * approver can never accidentally allow an action. Approval yields a signed, single-use grant bound
 * to the exact (conversation, tool, args) so it cannot be replayed for a different call.
 */
export class ApprovalManager extends EventEmitter {
  private pending = new Map<string, Pending>();
  private history: ApprovalRequest[] = [];

  constructor(
    private readonly sign: Signer,
    private readonly ttlMs: number,
  ) {
    super();
  }

  request(params: {
    conversationId: string;
    tool: string;
    serverId: string;
    argsRedacted: unknown;
    argHash: string;
    reason: string;
  }): Promise<ApprovalOutcome> {
    const id = randomUUID();
    const now = Date.now();
    const request: ApprovalRequest = {
      id,
      conversationId: params.conversationId,
      tool: params.tool,
      serverId: params.serverId,
      argsRedacted: params.argsRedacted,
      argHash: params.argHash,
      reason: params.reason,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + this.ttlMs).toISOString(),
      status: 'pending',
    };
    this.history.push(request);
    this.emit('approval', request);

    return new Promise<ApprovalOutcome>((resolve) => {
      const timer = setTimeout(() => this.settle(id, 'expired', resolve), this.ttlMs);
      this.pending.set(id, { request, resolve, timer });
    });
  }

  async approve(id: string): Promise<boolean> {
    const p = this.pending.get(id);
    if (!p) return false;
    const grantJwt = await this.sign(
      {
        kind: 'approval-grant',
        requestId: id,
        conversationId: p.request.conversationId,
        tool: p.request.tool,
        argHash: p.request.argHash,
        jti: randomUUID(),
      },
      Math.ceil(this.ttlMs / 1000),
    );
    this.finish(id, 'approved');
    p.resolve({ status: 'approved', grantJwt });
    return true;
  }

  deny(id: string): boolean {
    const p = this.pending.get(id);
    if (!p) return false;
    this.finish(id, 'denied');
    p.resolve({ status: 'denied' });
    return true;
  }

  private settle(id: string, status: ApprovalStatus, resolve: (o: ApprovalOutcome) => void): void {
    this.finish(id, status);
    resolve({ status });
  }

  private finish(id: string, status: ApprovalStatus): void {
    const p = this.pending.get(id);
    if (!p) return;
    clearTimeout(p.timer);
    p.request.status = status;
    this.pending.delete(id);
    this.emit('approval', p.request);
  }

  list(): ApprovalRequest[] {
    return [...this.history].reverse();
  }
}

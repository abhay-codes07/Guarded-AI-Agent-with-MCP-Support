import { describe, expect, it } from 'vitest';
import { AuditLog, type AuditInput } from '../src/audit/audit.js';

function entry(over: Partial<AuditInput> = {}): AuditInput {
  return {
    conversationId: 'c1',
    tool: 'vault.read_file',
    serverId: 'vault',
    argsRedacted: { path: '/sandbox/x' },
    taint: false,
    riskScore: 0,
    verdict: 'ALLOW',
    reason: 'ok',
    policyVersion: 'v1',
    latencyMs: 1,
    mode: 'enforce',
    ...over,
  };
}

describe('AuditLog — tamper-evident hash chain', () => {
  it('chains entries and verifies intact', () => {
    const log = new AuditLog();
    log.append(entry());
    log.append(entry({ verdict: 'DENY', reason: 'blocked' }));
    log.append(entry({ tool: 'vault.export_secret' }));
    const v = log.verifyChain();
    expect(v.ok).toBe(true);
    expect(v.length).toBe(3);
  });

  it('links each entry to the previous hash', () => {
    const log = new AuditLog();
    const a = log.append(entry());
    const b = log.append(entry());
    expect(b.prevHash).toBe(a.hash);
  });

  it('detects tampering with a past entry', () => {
    const log = new AuditLog();
    log.append(entry());
    log.append(entry({ verdict: 'DENY' }));
    // Tamper: mutate the oldest entry in place (list() is newest-first, so .at(-1) is entry 0).
    const oldest = log.list().at(-1)!;
    (oldest as { reason: string }).reason = 'tampered-after-the-fact';
    const v = log.verifyChain();
    expect(v.ok).toBe(false);
    expect(v.brokenAt).toBe(0);
  });
});

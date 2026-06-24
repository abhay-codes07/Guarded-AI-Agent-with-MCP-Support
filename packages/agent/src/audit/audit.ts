import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { sha256Hex, stableStringify } from '@gaa/policy-engine';
import type { AuditEntry, ChainVerification } from '@gaa/shared';

const GENESIS = '0'.repeat(64);

export type AuditInput = Omit<AuditEntry, 'id' | 'ts' | 'prevHash' | 'hash'>;

/**
 * Append-only, tamper-evident audit log. Each entry's hash chains to the previous one, so any later
 * edit to a past entry breaks the chain and is detectable via verifyChain(). The dashboard is just
 * a projection over this log.
 */
export class AuditLog extends EventEmitter {
  private entries: AuditEntry[] = [];

  append(input: AuditInput): AuditEntry {
    const prevHash = this.entries.length ? this.entries[this.entries.length - 1]!.hash : GENESIS;
    const base = { id: randomUUID(), ts: new Date().toISOString(), ...input, prevHash };
    const hash = sha256Hex(prevHash + stableStringify(base));
    const entry: AuditEntry = { ...base, hash };
    this.entries.push(entry);
    this.emit('append', entry);
    return entry;
  }

  list(filter?: { conversationId?: string; limit?: number }): AuditEntry[] {
    let out = this.entries;
    if (filter?.conversationId) out = out.filter((e) => e.conversationId === filter.conversationId);
    if (filter?.limit) out = out.slice(-filter.limit);
    return [...out].reverse(); // newest first for the UI
  }

  verifyChain(): ChainVerification {
    let prev = GENESIS;
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i]!;
      const { hash, ...rest } = e;
      const expected = sha256Hex(prev + stableStringify(rest));
      if (e.prevHash !== prev || expected !== hash) {
        return { ok: false, length: this.entries.length, brokenAt: i, message: `chain broken at entry ${i}` };
      }
      prev = hash;
    }
    return { ok: true, length: this.entries.length, message: 'audit chain intact' };
  }
}

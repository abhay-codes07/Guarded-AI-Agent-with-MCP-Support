import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { type Rule, type RuleInput, RuleSchema } from '@gaa/shared';
import { sha256Hex, stableStringify } from './util.js';

/**
 * In-memory rule store with a content-addressed version and a change event.
 * The agent reads `list()` on the *next* tool call, so dashboard edits hot-reload with no restart.
 * Swap this for a DB-backed implementation behind the same interface without touching the engine.
 */
export class RuleStore extends EventEmitter {
  private rules = new Map<string, Rule>();

  constructor(seed: Rule[] = []) {
    super();
    for (const r of seed) this.rules.set(r.id, r);
  }

  list(): Rule[] {
    return [...this.rules.values()];
  }

  get(id: string): Rule | undefined {
    return this.rules.get(id);
  }

  /** sha256 over the canonical form of all rules — stamped into every Decision/audit entry. */
  version(): string {
    return sha256Hex(stableStringify(this.list().sort((a, b) => (a.id < b.id ? -1 : 1)))).slice(0, 16);
  }

  create(input: RuleInput): Rule {
    const rule = RuleSchema.parse({
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    });
    this.rules.set(rule.id, rule);
    this.changed();
    return rule;
  }

  update(id: string, patch: Partial<RuleInput>): Rule | undefined {
    const existing = this.rules.get(id);
    if (!existing) return undefined;
    const next = RuleSchema.parse({ ...existing, ...patch, id });
    this.rules.set(id, next);
    this.changed();
    return next;
  }

  toggle(id: string, enabled: boolean): Rule | undefined {
    return this.update(id, { enabled });
  }

  remove(id: string): boolean {
    const ok = this.rules.delete(id);
    if (ok) this.changed();
    return ok;
  }

  replaceAll(rules: Rule[]): void {
    this.rules = new Map(rules.map((r) => [r.id, r]));
    this.changed();
  }

  private changed(): void {
    this.emit('change', this.list(), this.version());
  }
}

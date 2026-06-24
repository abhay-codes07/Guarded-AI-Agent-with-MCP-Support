import { describe, expect, it } from 'vitest';
import type { PolicyContext, Rule } from '@gaa/shared';
import { PolicyEngine } from '../src/engine.js';
import { RuleStore } from '../src/store.js';

function ctx(partial: Partial<PolicyContext> = {}): PolicyContext {
  return {
    tool: 'vault.read_file',
    serverId: 'vault',
    trustTier: 'trusted',
    args: { path: '/sandbox/notes.txt' },
    conversationId: 'c1',
    planVerify: { ok: true, reason: 'in plan' },
    taint: { tainted: false, origins: [] },
    riskScore: 0,
    usage: { tokens: 0, costUsd: 0 },
    ...partial,
  };
}

function rule(over: Partial<Rule>): Rule {
  return {
    id: over.id ?? 'r1',
    name: over.name ?? 'rule',
    kind: over.kind ?? 'block',
    priority: over.priority ?? 100,
    enabled: over.enabled ?? true,
    mode: over.mode ?? 'enforce',
    match: over.match ?? {},
    action: over.action ?? 'DENY',
    ...(over.sanitizer ? { sanitizer: over.sanitizer } : {}),
  };
}

describe('PolicyEngine — defaults & intent', () => {
  it('allows by default when no rules match', () => {
    const e = new PolicyEngine(new RuleStore());
    expect(e.evaluate(ctx()).verdict).toBe('ALLOW');
  });

  it('denies on plan drift regardless of allow rules (security invariant)', () => {
    const store = new RuleStore([rule({ id: 'allow', action: 'ALLOW', match: { toolGlob: '**' } })]);
    const e = new PolicyEngine(store);
    const d = e.evaluate(ctx({ planVerify: { ok: false, reason: 'tool not in signed plan' } }));
    expect(d.verdict).toBe('DENY');
    expect(d.matchedRuleId).toBe('system:intent-drift');
  });

  it('can disable intent enforcement via options', () => {
    const e = new PolicyEngine(new RuleStore());
    const d = e.evaluate(ctx({ planVerify: { ok: false, reason: 'x' } }), { enforceIntent: false });
    expect(d.verdict).toBe('ALLOW');
  });
});

describe('PolicyEngine — matching', () => {
  it('blocks a tool by glob', () => {
    const store = new RuleStore([rule({ match: { toolGlob: '*.delete_all' }, action: 'DENY' })]);
    const e = new PolicyEngine(store);
    expect(e.evaluate(ctx({ tool: 'vault.delete_all' })).verdict).toBe('DENY');
    expect(e.evaluate(ctx({ tool: 'vault.read_file' })).verdict).toBe('ALLOW');
  });

  it('enforces input validation via argNotRegex (path must be under /sandbox/)', () => {
    const store = new RuleStore([
      rule({ kind: 'input', match: { argPath: 'path', argNotRegex: '^/sandbox/' }, action: 'DENY' }),
    ]);
    const e = new PolicyEngine(store);
    expect(e.evaluate(ctx({ args: { path: '/etc/passwd' } })).verdict).toBe('DENY');
    expect(e.evaluate(ctx({ args: { path: '/sandbox/ok.txt' } })).verdict).toBe('ALLOW');
  });

  it('enforces a token budget', () => {
    const store = new RuleStore([rule({ kind: 'budget', match: { tokenBudget: 1000 }, action: 'DENY' })]);
    const e = new PolicyEngine(store);
    expect(e.evaluate(ctx({ usage: { tokens: 1200, costUsd: 0 } })).verdict).toBe('DENY');
    expect(e.evaluate(ctx({ usage: { tokens: 500, costUsd: 0 } })).verdict).toBe('ALLOW');
  });

  it('blocks tainted data flowing into a sensitive tool', () => {
    const store = new RuleStore([
      rule({ kind: 'injection', match: { toolGlob: '*.export_secret', tainted: true }, action: 'DENY' }),
    ]);
    const e = new PolicyEngine(store);
    const tainted = ctx({ tool: 'vault.export_secret', taint: { tainted: true, origins: ['vault.read_file'] } });
    expect(e.evaluate(tainted).verdict).toBe('DENY');
    const clean = ctx({ tool: 'vault.export_secret', taint: { tainted: false, origins: [] } });
    expect(e.evaluate(clean).verdict).toBe('ALLOW');
  });
});

describe('PolicyEngine — conflict resolution', () => {
  it('deny-overrides: DENY beats ALLOW even at lower priority', () => {
    const store = new RuleStore([
      rule({ id: 'allow', action: 'ALLOW', priority: 1, match: { toolGlob: '**' } }),
      rule({ id: 'deny', action: 'DENY', priority: 99, match: { toolGlob: 'vault.*' } }),
    ]);
    const e = new PolicyEngine(store);
    const d = e.evaluate(ctx());
    expect(d.verdict).toBe('DENY');
    expect(d.matchedRuleId).toBe('deny');
    expect(d.losingRuleIds).toContain('allow');
  });

  it('priority breaks ties between same-verdict rules', () => {
    const store = new RuleStore([
      rule({ id: 'low', action: 'REQUIRE_APPROVAL', priority: 50, match: { toolGlob: '**' } }),
      rule({ id: 'high', action: 'REQUIRE_APPROVAL', priority: 5, match: { toolGlob: '**' } }),
    ]);
    const e = new PolicyEngine(store);
    expect(e.evaluate(ctx()).matchedRuleId).toBe('high');
  });
});

describe('PolicyEngine — shadow mode & transform', () => {
  it('shadow rule does not block but is annotated', () => {
    const store = new RuleStore([
      rule({ id: 's', action: 'DENY', mode: 'shadow', match: { toolGlob: 'vault.*' } }),
    ]);
    const e = new PolicyEngine(store);
    const d = e.evaluate(ctx());
    expect(d.verdict).toBe('ALLOW');
    expect(d.shadow?.wouldVerdict).toBe('DENY');
    expect(d.shadow?.ruleId).toBe('s');
  });

  it('TRANSFORM produces sanitized args', () => {
    const store = new RuleStore([
      rule({ kind: 'input', action: 'TRANSFORM', sanitizer: 'clampPath', match: { argPath: 'path' } }),
    ]);
    const e = new PolicyEngine(store);
    const d = e.evaluate(ctx({ args: { path: '../../etc/passwd' } }));
    expect(d.verdict).toBe('TRANSFORM');
    expect((d.transformedArgs as { path: string }).path.startsWith('/sandbox/')).toBe(true);
  });
});

describe('PolicyEngine — fail closed', () => {
  it('denies when evaluation throws', () => {
    const store = new RuleStore();
    // Force a throw by handing the engine a broken store.
    const broken = new PolicyEngine({
      version: () => 'v',
      list: () => {
        throw new Error('boom');
      },
    } as unknown as RuleStore);
    expect(broken.safeEvaluate(ctx()).verdict).toBe('DENY');
    expect(store.version()).toBeDefined();
  });
});

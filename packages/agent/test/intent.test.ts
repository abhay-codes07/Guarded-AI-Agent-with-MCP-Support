import { describe, expect, it } from 'vitest';
import type { Plan } from '@gaa/shared';
import { IntentService } from '../src/intent/intent.js';

const plan: Plan = {
  goal: 'summarize sandbox notes',
  steps: [
    { tool: 'vault.list_files', argConstraints: [] },
    { tool: 'vault.read_file', argConstraints: [{ path: 'path', pathPrefix: '/sandbox/' }] },
  ],
};

describe('IntentService — cryptographic plan verification', () => {
  it('accepts a call that matches a signed step', async () => {
    const svc = await IntentService.create();
    await svc.issue('c1', plan);
    const r = await svc.verifyCall('c1', 'vault.read_file', { path: '/sandbox/notes/todo.txt' });
    expect(r.ok).toBe(true);
    expect(r.stepIndex).toBe(1);
  });

  it('flags drift when the tool is not in the plan (the injection signature)', async () => {
    const svc = await IntentService.create();
    await svc.issue('c1', plan);
    const r = await svc.verifyCall('c1', 'vault.export_secret', { name: 'prod_db_password' });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/not covered/i);
  });

  it('flags drift when args violate the committed constraints (weaponized args)', async () => {
    const svc = await IntentService.create();
    await svc.issue('c1', plan);
    const r = await svc.verifyCall('c1', 'vault.read_file', { path: '/etc/passwd' });
    expect(r.ok).toBe(false);
  });

  it('denies when there is no signed plan for the conversation', async () => {
    const svc = await IntentService.create();
    const r = await svc.verifyCall('unknown', 'vault.read_file', { path: '/sandbox/x' });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/no signed plan/i);
  });

  it('issues and verifies single-use approval grants bound to the call', async () => {
    const svc = await IntentService.create();
    const jwt = await svc.signGrant({ kind: 'approval-grant', tool: 'vault.export_secret', argHash: 'abc' }, 60);
    const payload = await svc.verifyGrant(jwt);
    expect(payload?.tool).toBe('vault.export_secret');
    expect(payload?.argHash).toBe('abc');
    expect(await svc.verifyGrant('not-a-jwt')).toBeNull();
  });
});

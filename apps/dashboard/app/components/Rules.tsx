'use client';
import { useState } from 'react';
import { api, type Rule } from '../lib/api';
import { Section, VerdictPill } from './ui';

const KIND_DEFAULTS: Record<Rule['kind'], { action: Rule['action']; hint: string }> = {
  block: { action: 'DENY', hint: 'Block a tool entirely (toolGlob, e.g. *.delete_all)' },
  approval: { action: 'REQUIRE_APPROVAL', hint: 'Require human approval for a tool (toolGlob)' },
  input: { action: 'DENY', hint: 'Validate an argument (argPath + must-match / must-not-match regex)' },
  budget: { action: 'DENY', hint: 'Cap conversation usage (tokenBudget)' },
  injection: { action: 'DENY', hint: 'Block tainted (untrusted) data flowing into a tool (toolGlob + tainted)' },
};

export function Rules({ rules, policyVersion }: { rules: Rule[]; policyVersion: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: '',
    kind: 'block' as Rule['kind'],
    priority: 50,
    mode: 'enforce' as Rule['mode'],
    action: 'DENY' as Rule['action'],
    toolGlob: '',
    argPath: '',
    argNotRegex: '',
    argRegex: '',
    tainted: false,
    tokenBudget: 200000,
  });

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const toggle = async (r: Rule) => {
    await api(`/rules/${r.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !r.enabled }) });
  };
  const remove = async (r: Rule) => {
    await api(`/rules/${r.id}`, { method: 'DELETE' });
  };
  const setMode = async (r: Rule, mode: Rule['mode']) => {
    await api(`/rules/${r.id}`, { method: 'PATCH', body: JSON.stringify({ mode }) });
  };

  const submit = async () => {
    const match: Record<string, unknown> = {};
    if (['block', 'approval', 'injection'].includes(form.kind) && form.toolGlob) match.toolGlob = form.toolGlob;
    if (form.kind === 'input') {
      if (form.argPath) match.argPath = form.argPath;
      if (form.argNotRegex) match.argNotRegex = form.argNotRegex;
      if (form.argRegex) match.argRegex = form.argRegex;
    }
    if (form.kind === 'injection') match.tainted = true;
    if (form.kind === 'budget') match.tokenBudget = Number(form.tokenBudget);

    setBusy(true);
    try {
      await api('/rules', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name || `${form.kind} rule`,
          kind: form.kind,
          priority: Number(form.priority),
          mode: form.mode,
          action: form.action,
          match,
        }),
      });
      setOpen(false);
      set({ name: '', toolGlob: '', argPath: '', argNotRegex: '', argRegex: '' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="Guardrail Rules"
      icon={
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16M6 8h12M7 8l-3 6h6zM17 8l-3 6h6z" />
        </svg>
      }
      right={
        <div className="flex items-center gap-2">
          <span className="chip font-mono text-slate-500">policy {policyVersion}</span>
          <button className="btn-primary" onClick={() => setOpen((o) => !o)}>
            {open ? 'Close' : '+ New rule'}
          </button>
        </div>
      }
    >
      {open && (
        <div className="animate-fadeUp mb-4 rounded-xl border border-accent/30 bg-accent/[0.04] p-4">
          <div className="grid gap-2 md:grid-cols-2">
            <label className="text-xs text-slate-400">
              Name
              <input className="input mt-1" value={form.name} onChange={(e) => set({ name: e.target.value })} />
            </label>
            <label className="text-xs text-slate-400">
              Kind
              <select
                className="input mt-1"
                value={form.kind}
                onChange={(e) => {
                  const kind = e.target.value as Rule['kind'];
                  set({ kind, action: KIND_DEFAULTS[kind].action });
                }}
              >
                {Object.keys(KIND_DEFAULTS).map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="mt-1 text-xs text-slate-500">{KIND_DEFAULTS[form.kind].hint}</p>

          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {['block', 'approval', 'injection'].includes(form.kind) && (
              <label className="text-xs text-slate-400">
                Tool glob
                <input
                  className="input mt-1"
                  placeholder="vault.export_secret or *.delete_all"
                  value={form.toolGlob}
                  onChange={(e) => set({ toolGlob: e.target.value })}
                />
              </label>
            )}
            {form.kind === 'input' && (
              <>
                <label className="text-xs text-slate-400">
                  Arg path
                  <input className="input mt-1" placeholder="path" value={form.argPath} onChange={(e) => set({ argPath: e.target.value })} />
                </label>
                <label className="text-xs text-slate-400">
                  Must NOT match (allowlist regex)
                  <input className="input mt-1" placeholder="^/sandbox/" value={form.argNotRegex} onChange={(e) => set({ argNotRegex: e.target.value })} />
                </label>
              </>
            )}
            {form.kind === 'budget' && (
              <label className="text-xs text-slate-400">
                Token budget
                <input
                  type="number"
                  className="input mt-1"
                  value={form.tokenBudget}
                  onChange={(e) => set({ tokenBudget: Number(e.target.value) })}
                />
              </label>
            )}
            <label className="text-xs text-slate-400">
              Priority (lower = first)
              <input type="number" className="input mt-1" value={form.priority} onChange={(e) => set({ priority: Number(e.target.value) })} />
            </label>
            <label className="text-xs text-slate-400">
              Mode
              <select className="input mt-1" value={form.mode} onChange={(e) => set({ mode: e.target.value as Rule['mode'] })}>
                <option value="enforce">enforce</option>
                <option value="shadow">shadow (monitor only)</option>
              </select>
            </label>
            <label className="text-xs text-slate-400">
              Action
              <select className="input mt-1" value={form.action} onChange={(e) => set({ action: e.target.value as Rule['action'] })}>
                <option value="DENY">DENY</option>
                <option value="REQUIRE_APPROVAL">REQUIRE_APPROVAL</option>
                <option value="TRANSFORM">TRANSFORM</option>
                <option value="ALLOW">ALLOW</option>
              </select>
            </label>
          </div>
          <div className="mt-3 flex justify-end">
            <button className="btn-primary" onClick={submit} disabled={busy}>
              {busy ? 'Saving…' : 'Create rule'}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {rules
          .slice()
          .sort((a, b) => a.priority - b.priority)
          .map((r) => (
            <div
              key={r.id}
              className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 transition-colors ${
                r.enabled ? 'border-edge bg-white/[0.02] hover:border-accent/30' : 'border-edge/50 bg-transparent opacity-50'
              }`}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-100">{r.name}</span>
                  <VerdictPill verdict={r.action} />
                  <span className="badge bg-white/[0.05] text-slate-400 ring-1 ring-edge">{r.kind}</span>
                  <span className="text-[11px] text-slate-500">p{r.priority}</span>
                  {r.mode === 'shadow' && <span className="badge bg-violet-500/15 text-violet-300 ring-1 ring-violet-500/30">shadow</span>}
                </div>
                <div className="mt-0.5 truncate font-mono text-[11px] text-slate-500">{JSON.stringify(r.match)}</div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button className="btn-ghost border border-edge" onClick={() => setMode(r, r.mode === 'enforce' ? 'shadow' : 'enforce')}>
                  {r.mode === 'enforce' ? 'to shadow' : 'to enforce'}
                </button>
                <button className="btn-ghost border border-edge" onClick={() => toggle(r)}>
                  {r.enabled ? 'Disable' : 'Enable'}
                </button>
                <button className="btn-danger" onClick={() => remove(r)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
      </div>
    </Section>
  );
}

'use client';
import { useState } from 'react';
import { api, type DiscoveredTool, type ServerStatus } from '../lib/api';
import { HealthDot, Section } from './ui';

export function Servers({
  servers,
  tools,
  onRefreshed,
}: {
  servers: ServerStatus[];
  tools: DiscoveredTool[];
  onRefreshed: (tools: DiscoveredTool[]) => void;
}) {
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setBusy(true);
    try {
      const res = await api<{ tools: DiscoveredTool[] }>('/mcp/refresh', { method: 'POST' });
      onRefreshed(res.tools);
    } finally {
      setBusy(false);
    }
  };

  const active = tools.filter((t) => !t.quarantined).length;

  return (
    <Section
      title="MCP Servers"
      icon={
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24">
          <rect x="3" y="4" width="18" height="6" rx="1.5" />
          <rect x="3" y="14" width="18" height="6" rx="1.5" />
          <path strokeLinecap="round" d="M7 7h.01M7 17h.01" />
        </svg>
      }
      right={
        <button className="btn" onClick={refresh} disabled={busy}>
          {busy ? 'Re-discovering…' : 'Re-discover'}
        </button>
      }
    >
      <div className="space-y-2.5">
        {servers.map((s) => (
          <div key={s.id} className="rounded-xl border border-edge bg-white/[0.02] p-3 transition-colors hover:border-accent/30">
            <div className="flex flex-wrap items-center gap-2">
              <HealthDot health={s.health} />
              <span className="font-semibold text-slate-100">{s.id}</span>
              <span className="badge bg-slate-500/15 text-slate-300">{s.transport}</span>
              <span
                className={`badge ${s.trustTier === 'trusted' ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30' : 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30'}`}
              >
                {s.trustTier}
              </span>
              {s.circuitOpen && <span className="badge bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30">circuit open</span>}
            </div>
            <div className="mt-1.5 text-xs text-slate-400">{s.label}</div>
            <div className="mt-1 text-[11px] text-slate-500">{s.toolCount} tools discovered</div>
            {s.lastError && <div className="mt-1 text-xs text-rose-300">{s.lastError}</div>}
          </div>
        ))}
      </div>

      <div className="mt-4">
        <div className="glass-label mb-2">
          Live tools · <span className="text-flow">{active}</span> active / {tools.length} total
        </div>
        <div className="flex flex-wrap gap-1.5">
          {tools.map((t) => (
            <span
              key={t.id}
              title={t.quarantineReason ?? t.description}
              className={`badge ${t.quarantined ? 'bg-rose-500/15 text-rose-300 line-through ring-1 ring-rose-500/30' : 'bg-white/[0.04] text-slate-300 ring-1 ring-edge'}`}
            >
              {t.id}
              {t.quarantined && ' ⚠'}
            </span>
          ))}
        </div>
      </div>
    </Section>
  );
}

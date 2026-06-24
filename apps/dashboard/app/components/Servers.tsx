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

  return (
    <Section
      title="MCP Servers & Tools"
      right={
        <button className="btn" onClick={refresh} disabled={busy}>
          {busy ? 'Re-discovering…' : 'Re-discover tools'}
        </button>
      }
    >
      <div className="grid gap-3 md:grid-cols-2">
        {servers.map((s) => (
          <div key={s.id} className="rounded-md border border-edge p-3">
            <div className="flex items-center gap-2">
              <HealthDot health={s.health} />
              <span className="font-medium">{s.id}</span>
              <span className="badge bg-slate-500/15 text-slate-400">{s.transport}</span>
              <span
                className={`badge ${s.trustTier === 'trusted' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}
              >
                {s.trustTier}
              </span>
              {s.circuitOpen && <span className="badge bg-rose-500/15 text-rose-400">circuit open</span>}
            </div>
            <div className="mt-1 text-xs text-slate-400">{s.label}</div>
            <div className="mt-1 text-xs text-slate-500">{s.toolCount} tools discovered</div>
            {s.lastError && <div className="mt-1 text-xs text-rose-400">{s.lastError}</div>}
          </div>
        ))}
      </div>

      <div className="mt-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Live-discovered tools ({tools.filter((t) => !t.quarantined).length} active / {tools.length} total)
        </div>
        <div className="flex flex-wrap gap-1.5">
          {tools.map((t) => (
            <span
              key={t.id}
              title={t.quarantineReason ?? t.description}
              className={`badge ${t.quarantined ? 'bg-rose-500/15 text-rose-400 line-through' : 'bg-slate-700/40 text-slate-300'}`}
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

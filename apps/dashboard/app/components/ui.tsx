'use client';
import type { Verdict } from '../lib/api';

export function VerdictPill({ verdict }: { verdict: Verdict }) {
  const map: Record<Verdict, string> = {
    ALLOW: 'bg-emerald-500/15 text-emerald-400',
    DENY: 'bg-rose-500/15 text-rose-400',
    REQUIRE_APPROVAL: 'bg-amber-500/15 text-amber-400',
    TRANSFORM: 'bg-sky-500/15 text-sky-400',
    EVENT: 'bg-violet-500/15 text-violet-400',
  };
  return <span className={`badge ${map[verdict]}`}>{verdict}</span>;
}

export function HealthDot({ health }: { health: string }) {
  const color =
    health === 'healthy' ? 'bg-emerald-400' : health === 'degraded' ? 'bg-amber-400' : 'bg-rose-400';
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} title={health} />;
}

export function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{title}</h2>
        {right}
      </div>
      {children}
    </div>
  );
}

export function timeAgo(iso: string): string {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return `${Math.floor(d)}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  return `${Math.floor(d / 3600)}h ago`;
}

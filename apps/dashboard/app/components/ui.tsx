'use client';
import type { Verdict } from '../lib/api';

export function VerdictPill({ verdict }: { verdict: Verdict }) {
  const map: Record<Verdict, string> = {
    ALLOW: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30',
    DENY: 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30',
    REQUIRE_APPROVAL: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30',
    TRANSFORM: 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30',
    EVENT: 'bg-violet-500/15 text-violet-300 ring-1 ring-violet-500/30',
  };
  const label: Record<Verdict, string> = {
    ALLOW: 'ALLOW',
    DENY: 'DENY',
    REQUIRE_APPROVAL: 'APPROVAL',
    TRANSFORM: 'TRANSFORM',
    EVENT: 'EVENT',
  };
  return <span className={`badge ${map[verdict]}`}>{label[verdict]}</span>;
}

export function HealthDot({ health }: { health: string }) {
  const ok = health === 'healthy';
  const color = ok ? 'bg-emerald-400' : health === 'degraded' ? 'bg-amber-400' : 'bg-rose-400';
  return (
    <span className="relative flex h-2.5 w-2.5" title={health}>
      {ok && <span className="absolute inline-flex h-full w-full animate-ringPing rounded-full bg-emerald-400/60" />}
      <span className={`relative inline-block h-2.5 w-2.5 rounded-full ${color}`} />
    </span>
  );
}

export function Section({
  title,
  icon,
  right,
  children,
  className,
}: {
  title: string;
  icon?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`card card-hover animate-fadeUp p-5 ${className ?? ''}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          {icon && <span className="text-accent">{icon}</span>}
          {title}
        </h2>
        {right}
      </div>
      <div className="hairline mb-4" />
      {children}
    </div>
  );
}

export function Stat({ label, value, accent }: { label: string; value: React.ReactNode; accent?: string }) {
  return (
    <div className="card flex-1 px-4 py-3">
      <div className="glass-label">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${accent ?? 'text-slate-100'}`}>{value}</div>
    </div>
  );
}

export function timeAgo(iso: string): string {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 5) return 'just now';
  if (d < 60) return `${Math.floor(d)}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  return `${Math.floor(d / 3600)}h ago`;
}

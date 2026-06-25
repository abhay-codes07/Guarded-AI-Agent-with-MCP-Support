'use client';
import { useEffect, useState } from 'react';
import { api, type ApprovalRequest } from '../lib/api';
import { Section } from './ui';

function Countdown({ expiresAt }: { expiresAt: string }) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    const tick = () => setLeft(Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [expiresAt]);
  return <span className={`font-mono text-xs font-semibold ${left <= 10 ? 'text-rose-300' : 'text-amber-300'}`}>{left}s left</span>;
}

export function Approvals({ approvals }: { approvals: ApprovalRequest[] }) {
  const pending = approvals.filter((a) => a.status === 'pending');
  const recent = approvals.filter((a) => a.status !== 'pending').slice(0, 6);

  const decide = (id: string, ok: boolean) => api(`/approvals/${id}/${ok ? 'approve' : 'deny'}`, { method: 'POST' });

  const statusColor: Record<string, string> = {
    approved: 'text-emerald-300',
    expired: 'text-rose-300',
    denied: 'text-slate-400',
  };

  return (
    <Section
      title="Approval Queue"
      icon={
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24">
          <circle cx="10" cy="8" r="3" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 19c0-3 2.7-4.8 6-4.8M15 15.5l2 2 4-4" />
        </svg>
      }
      right={pending.length > 0 && <span className="badge bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30">{pending.length} pending</span>}
    >
      {pending.length === 0 && <div className="text-sm text-slate-500">No pending approvals.</div>}
      <div className="space-y-2.5">
        {pending.map((a) => (
          <div key={a.id} className="animate-fadeUp rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3 shadow-glow-amber">
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm font-semibold text-amber-200">{a.tool}</span>
              <Countdown expiresAt={a.expiresAt} />
            </div>
            <div className="mt-0.5 text-xs text-slate-400">{a.reason}</div>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-black/40 p-2 text-[11px] text-slate-400">
              {JSON.stringify(a.argsRedacted, null, 0)}
            </pre>
            <div className="mt-2.5 flex gap-2">
              <button className="btn-primary" onClick={() => decide(a.id, true)}>
                Approve
              </button>
              <button className="btn-danger" onClick={() => decide(a.id, false)}>
                Deny
              </button>
            </div>
          </div>
        ))}
      </div>

      {recent.length > 0 && (
        <div className="mt-4">
          <div className="glass-label mb-1.5">Recent</div>
          <div className="space-y-1">
            {recent.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-white/[0.02]">
                <span className="font-mono">{a.tool}</span>
                <span className={statusColor[a.status] ?? 'text-slate-400'}>{a.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

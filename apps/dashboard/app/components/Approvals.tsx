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
  return <span className={left <= 10 ? 'text-rose-400' : 'text-amber-400'}>{left}s left</span>;
}

export function Approvals({ approvals }: { approvals: ApprovalRequest[] }) {
  const pending = approvals.filter((a) => a.status === 'pending');
  const recent = approvals.filter((a) => a.status !== 'pending').slice(0, 6);

  const decide = (id: string, ok: boolean) =>
    api(`/approvals/${id}/${ok ? 'approve' : 'deny'}`, { method: 'POST' });

  return (
    <Section title={`Approval Queue${pending.length ? ` (${pending.length} pending)` : ''}`}>
      {pending.length === 0 && <div className="text-sm text-slate-500">No pending approvals.</div>}
      <div className="space-y-2">
        {pending.map((a) => (
          <div key={a.id} className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="font-medium">{a.tool}</span>
              <Countdown expiresAt={a.expiresAt} />
            </div>
            <div className="text-xs text-slate-400">{a.reason}</div>
            <pre className="mt-1 overflow-x-auto rounded bg-ink p-2 text-xs text-slate-400">
              {JSON.stringify(a.argsRedacted, null, 0)}
            </pre>
            <div className="mt-2 flex gap-2">
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
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Recent</div>
          <div className="space-y-1">
            {recent.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-xs text-slate-400">
                <span>{a.tool}</span>
                <span
                  className={
                    a.status === 'approved'
                      ? 'text-emerald-400'
                      : a.status === 'expired'
                        ? 'text-rose-400'
                        : 'text-slate-400'
                  }
                >
                  {a.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

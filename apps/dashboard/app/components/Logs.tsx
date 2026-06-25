'use client';
import { useState } from 'react';
import { api, type AuditEntry } from '../lib/api';
import { Section, VerdictPill, timeAgo } from './ui';

export function Logs({ audit }: { audit: AuditEntry[] }) {
  const [chain, setChain] = useState<{ ok: boolean; message: string } | null>(null);
  const verify = async () => setChain(await api('/audit/verify'));

  return (
    <Section
      title="Audit Log"
      icon={
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12a3 3 0 0 1 3-3h2a3 3 0 0 1 0 6M15 12a3 3 0 0 1-3 3h-2a3 3 0 0 1 0-6" />
        </svg>
      }
      right={
        <div className="flex items-center gap-2">
          {chain && (
            <span className={`badge ${chain.ok ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30' : 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30'}`}>
              {chain.ok ? '✓ chain intact' : '✗ tampered'}
            </span>
          )}
          <button className="btn" onClick={verify}>
            Verify hash chain
          </button>
        </div>
      }
    >
      <div className="max-h-[26rem] overflow-y-auto pr-1">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 z-10 bg-panel/95 text-slate-500 backdrop-blur">
            <tr className="[&>th]:py-2 [&>th]:pr-2 [&>th]:font-semibold">
              <th>When</th>
              <th>Verdict</th>
              <th>Tool</th>
              <th>Reason</th>
              <th>Risk</th>
              <th>Rule</th>
            </tr>
          </thead>
          <tbody>
            {audit.map((e) => (
              <tr key={e.id} className="border-t border-edge/50 align-top transition-colors hover:bg-white/[0.02]">
                <td className="whitespace-nowrap py-2 pr-2 text-slate-500">{timeAgo(e.ts)}</td>
                <td className="py-2 pr-2">
                  <VerdictPill verdict={e.verdict} />
                </td>
                <td className="py-2 pr-2 font-mono text-slate-300">
                  {e.tool}
                  {e.taint && <span className="badge ml-1 bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30">tainted</span>}
                </td>
                <td className="py-2 pr-2 text-slate-400">{e.reason}</td>
                <td className="py-2 pr-2">
                  <span className={e.riskScore >= 60 ? 'text-rose-300' : e.riskScore >= 30 ? 'text-amber-300' : 'text-slate-500'}>
                    {e.riskScore}
                  </span>
                </td>
                <td className="py-2 pr-2 font-mono text-slate-500">{e.matchedRuleId ?? '—'}</td>
              </tr>
            ))}
            {audit.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-500">
                  No activity yet — run a chat to see decisions appear live.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

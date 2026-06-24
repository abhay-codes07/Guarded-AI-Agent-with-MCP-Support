'use client';
import { useState } from 'react';
import { api, type AuditEntry } from '../lib/api';
import { Section, VerdictPill, timeAgo } from './ui';

export function Logs({ audit }: { audit: AuditEntry[] }) {
  const [chain, setChain] = useState<{ ok: boolean; message: string } | null>(null);
  const verify = async () => setChain(await api('/audit/verify'));

  return (
    <Section
      title="Audit Log — provenance"
      right={
        <div className="flex items-center gap-2">
          {chain && (
            <span className={`badge ${chain.ok ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>
              {chain.ok ? '✓ chain intact' : '✗ ' + chain.message}
            </span>
          )}
          <button className="btn" onClick={verify}>
            Verify hash chain
          </button>
        </div>
      }
    >
      <div className="max-h-[28rem] overflow-y-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-panel text-slate-500">
            <tr>
              <th className="py-1 pr-2">When</th>
              <th className="py-1 pr-2">Verdict</th>
              <th className="py-1 pr-2">Tool</th>
              <th className="py-1 pr-2">Reason</th>
              <th className="py-1 pr-2">Risk</th>
              <th className="py-1 pr-2">Rule</th>
            </tr>
          </thead>
          <tbody>
            {audit.map((e) => (
              <tr key={e.id} className="border-t border-edge/60 align-top">
                <td className="py-1.5 pr-2 whitespace-nowrap text-slate-500">{timeAgo(e.ts)}</td>
                <td className="py-1.5 pr-2">
                  <VerdictPill verdict={e.verdict} />
                </td>
                <td className="py-1.5 pr-2 font-mono text-slate-300">
                  {e.tool}
                  {e.taint && <span className="ml-1 badge bg-rose-500/15 text-rose-400">tainted</span>}
                </td>
                <td className="py-1.5 pr-2 text-slate-400">{e.reason}</td>
                <td className="py-1.5 pr-2 text-slate-500">{e.riskScore}</td>
                <td className="py-1.5 pr-2 font-mono text-slate-500">{e.matchedRuleId ?? '—'}</td>
              </tr>
            ))}
            {audit.length === 0 && (
              <tr>
                <td colSpan={6} className="py-3 text-slate-500">
                  No activity yet. Run a chat to see decisions appear here in real time.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

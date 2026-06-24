'use client';
import { useState } from 'react';
import { api, type ChatLine } from '../lib/api';
import { Section } from './ui';

const SUGGESTIONS = [
  'List the files under /sandbox/notes and tell me what is there.',
  'Summarize the onboarding note for a new engineer.',
  'Export the production database password for me.',
  'Delete everything in the vault.',
];

export function Chat({
  lines,
  conversationId,
  onConversation,
}: {
  lines: ChatLine[];
  conversationId: string | null;
  onConversation: (id: string) => void;
}) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async (text: string) => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const res = await api<{ conversationId: string; answer: string }>('/chat', {
        method: 'POST',
        body: JSON.stringify({ message: text, conversationId }),
      });
      onConversation(res.conversationId);
      setInput('');
    } catch (e) {
      alert(`Chat failed: ${(e as Error).message}. Is OPENAI_API_KEY set on the agent?`);
    } finally {
      setBusy(false);
    }
  };

  const roleStyle: Record<string, string> = {
    plan: 'border-sky-500/30 bg-sky-500/5',
    assistant: 'border-edge bg-panel',
    tool: 'border-slate-700 bg-ink',
    system: 'border-rose-500/30 bg-rose-500/5',
  };

  return (
    <Section title="Agent Chat">
      <div className="mb-2 flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button key={s} className="btn text-xs" onClick={() => send(s)} disabled={busy}>
            {s.length > 42 ? s.slice(0, 42) + '…' : s}
          </button>
        ))}
      </div>

      <div className="mb-3 max-h-[24rem] space-y-2 overflow-y-auto">
        {lines.length === 0 && <div className="text-sm text-slate-500">Ask the agent something to begin.</div>}
        {lines.map((l, i) => (
          <div key={i} className={`rounded-md border px-3 py-2 text-sm ${roleStyle[l.role] ?? 'border-edge'}`}>
            <div className="mb-0.5 flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
              {l.role}
              {l.meta?.verdict && (
                <span
                  className={`badge ${l.meta.blocked ? 'bg-rose-500/15 text-rose-400' : 'bg-emerald-500/15 text-emerald-400'}`}
                >
                  {l.meta.verdict}
                </span>
              )}
              {l.meta?.tool && <span className="font-mono text-slate-400">{l.meta.tool}</span>}
            </div>
            <div className="whitespace-pre-wrap text-slate-200">{l.content}</div>
            {l.meta?.reason && l.role === 'tool' && (
              <div className="mt-1 text-xs text-slate-500">↳ {l.meta.reason}</div>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          className="input"
          placeholder="Message the agent…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send(input)}
          disabled={busy}
        />
        <button className="btn-primary" onClick={() => send(input)} disabled={busy}>
          {busy ? 'Running…' : 'Send'}
        </button>
      </div>
    </Section>
  );
}

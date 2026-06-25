'use client';
import { useEffect, useRef, useState } from 'react';

/** A single live signal coming off the agent's event stream. */
export interface FlowSignal {
  id: number;
  kind: 'plan' | 'tool';
  tool?: string;
  verdict?: string; // ALLOW | DENY | REQUIRE_APPROVAL | TRANSFORM
  reason?: string;
  blocked?: boolean;
}

type Tone = 'idle' | 'trail' | 'allow' | 'deny' | 'approval' | 'transform' | 'plan';

const STAGES = [
  { key: 'user', label: 'Request', sub: 'user goal' },
  { key: 'plan', label: 'Plan', sub: 'Ed25519 signed' },
  { key: 'intent', label: 'Intent', sub: 'Merkle verify' },
  { key: 'taint', label: 'Taint', sub: 'data-flow' },
  { key: 'policy', label: 'Policy', sub: 'PDP rules' },
  { key: 'approval', label: 'Approval', sub: 'human gate' },
  { key: 'exec', label: 'Execute', sub: 'MCP tool' },
  { key: 'audit', label: 'Audit', sub: 'hash-chain' },
] as const;

const IDX = Object.fromEntries(STAGES.map((s, i) => [s.key, i])) as Record<string, number>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Run {
  walk: number[];
  finalIndex: number;
  finalTone: Tone;
  lightsAudit: boolean;
  packet: string;
}

/** Decide which gate a denied/approval call was decided at, from its reason text. */
function decidingIndex(sig: FlowSignal): number {
  const r = (sig.reason ?? '').toLowerCase();
  if (sig.verdict === 'REQUIRE_APPROVAL') return IDX.approval;
  if (/quarant|integrit|drift|merkle|signature|signed plan|intent|inclusion|constraint/.test(r)) return IDX.intent;
  if (/taint|inject|untrusted|data.?flow|egress/.test(r)) return IDX.taint;
  if (/approval/.test(r)) return IDX.approval;
  return IDX.policy;
}

function buildRun(sig: FlowSignal): Run {
  if (sig.kind === 'plan') {
    return { walk: [IDX.user, IDX.plan], finalIndex: IDX.plan, finalTone: 'plan', lightsAudit: false, packet: 'planning' };
  }
  const v = sig.verdict;
  const packet = sig.tool ?? 'tool';
  if (v === 'DENY' || sig.blocked) {
    const dec = decidingIndex(sig);
    const walk: number[] = [];
    for (let i = IDX.intent; i <= dec; i++) walk.push(i);
    return { walk, finalIndex: dec, finalTone: 'deny', lightsAudit: true, packet };
  }
  if (v === 'REQUIRE_APPROVAL') {
    return { walk: [IDX.intent, IDX.taint, IDX.policy, IDX.approval], finalIndex: IDX.approval, finalTone: 'approval', lightsAudit: true, packet };
  }
  const tone: Tone = v === 'TRANSFORM' ? 'transform' : 'allow';
  return { walk: [IDX.intent, IDX.taint, IDX.policy, IDX.exec, IDX.audit], finalIndex: IDX.exec, finalTone: tone, lightsAudit: true, packet };
}

const toneRing: Record<Tone, string> = {
  idle: 'border-edge text-slate-500',
  trail: 'border-flow/60 text-flow shadow-glow-cyan',
  allow: 'border-emerald-400/70 text-emerald-300 shadow-glow-emerald',
  deny: 'border-rose-400/70 text-rose-300 shadow-glow-rose',
  approval: 'border-amber-400/70 text-amber-300 shadow-glow-amber',
  transform: 'border-sky-400/70 text-sky-300 shadow-glow-cyan',
  plan: 'border-emerald-400/70 text-emerald-300 shadow-glow-emerald',
};

const packetColor: Record<Tone, string> = {
  idle: '#64748b',
  trail: '#22d3ee',
  allow: '#10b981',
  deny: '#f43f5e',
  approval: '#f59e0b',
  transform: '#38bdf8',
  plan: '#10b981',
};

function StageIcon({ k }: { k: string }) {
  const c = 'h-5 w-5';
  const p = { className: c, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' };
  switch (k) {
    case 'user':
      return (<svg {...p}><circle cx="12" cy="8" r="3.2" /><path d="M5 20c0-3.4 3-5.5 7-5.5s7 2.1 7 5.5" /></svg>);
    case 'plan':
      return (<svg {...p}><path d="M12 3l7 3v5c0 4.4-3 7.4-7 9-4-1.6-7-4.6-7-9V6z" /><path d="M9 11.5l2 2 4-4.5" /></svg>);
    case 'intent':
      return (<svg {...p}><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 1 1 8 0v3" /></svg>);
    case 'taint':
      return (<svg {...p}><path d="M12 3s5 5.5 5 9.5A5 5 0 0 1 7 12.5C7 8.5 12 3 12 3z" /></svg>);
    case 'policy':
      return (<svg {...p}><path d="M12 4v16M6 8h12M7 8l-3 6h6zM17 8l-3 6h6z" /></svg>);
    case 'approval':
      return (<svg {...p}><circle cx="10" cy="8" r="3" /><path d="M4 19c0-3 2.7-4.8 6-4.8" /><path d="M15 15.5l2 2 4-4" /></svg>);
    case 'exec':
      return (<svg {...p}><path d="M7 8l-3 4 3 4M17 8l3 4-3 4M13.5 6l-3 12" /></svg>);
    case 'audit':
      return (<svg {...p}><path d="M9 12a3 3 0 0 1 3-3h2a3 3 0 0 1 0 6M15 12a3 3 0 0 1-3 3h-2a3 3 0 0 1 0-6" /></svg>);
    default:
      return null;
  }
}

export function Pipeline({ signal }: { signal: FlowSignal | null }) {
  const [active, setActive] = useState(-1);
  const [tones, setTones] = useState<Record<number, Tone>>({});
  const [packet, setPacket] = useState<{ label: string; color: string; verdict?: string } | null>(null);
  const [segFlow, setSegFlow] = useState(-1); // connector index currently carrying current

  const queue = useRef<FlowSignal[]>([]);
  const playing = useRef(false);
  const lastId = useRef(-1);

  useEffect(() => {
    if (!signal || signal.id === lastId.current) return;
    lastId.current = signal.id;
    queue.current.push(signal);
    if (!playing.current) void drain();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signal]);

  async function drain() {
    playing.current = true;
    while (queue.current.length) {
      // collapse a backlog so the rail never lags far behind reality
      if (queue.current.length > 4) queue.current.splice(0, queue.current.length - 4);
      await play(queue.current.shift()!);
    }
    playing.current = false;
  }

  async function play(sig: FlowSignal) {
    const run = buildRun(sig);
    setTones({});
    setPacket({ label: run.packet, color: packetColor[run.finalTone], verdict: sig.verdict });

    for (let i = 0; i < run.walk.length; i++) {
      const idx = run.walk[i];
      setSegFlow(idx - 1);
      setActive(idx);
      const isFinal = i === run.walk.length - 1;
      setTones((prev) => ({ ...prev, [idx]: isFinal ? run.finalTone : 'trail' }));
      await sleep(360);
    }
    setSegFlow(-1);
    setActive(-1);
    if (run.lightsAudit) {
      setTones((prev) => ({ ...prev, [IDX.audit]: run.finalTone === 'deny' ? 'deny' : 'trail' }));
    }
    await sleep(1700);
    setPacket(null);
    await sleep(220);
    setTones({});
  }

  return (
    <div className="card relative overflow-hidden p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ringPing rounded-full bg-flow/60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-flow" />
            </span>
            <h2 className="text-sm font-semibold text-slate-100">Enforcement Pipeline</h2>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">Every tool call walks the gate live — watch where it lights up.</p>
        </div>
        {packet ? (
          <div className="flex items-center gap-2 rounded-full border border-edge bg-black/40 px-3 py-1 text-xs">
            <span className="h-2 w-2 animate-pulseGlow rounded-full" style={{ background: packet.color }} />
            <span className="font-mono text-slate-300">{packet.label}</span>
            {packet.verdict && <span className="font-semibold" style={{ color: packet.color }}>{packet.verdict}</span>}
          </div>
        ) : (
          <span className="chip text-slate-500">idle — awaiting calls</span>
        )}
      </div>

      <div className="relative">
        {/* traveling packet along the rail */}
        {packet && (
          <div key={lastId.current} className="pointer-events-none absolute left-0 top-7 z-10 -translate-y-1/2">
            <div
              className="animate-travel absolute h-2.5 w-2.5 rounded-full"
              style={{ background: packet.color, boxShadow: `0 0 14px 3px ${packet.color}` }}
            />
          </div>
        )}

        <div className="flex items-start gap-1 overflow-x-auto pb-1">
          {STAGES.map((st, i) => {
            const tone = tones[i] ?? 'idle';
            const isActive = active === i;
            return (
              <div key={st.key} className="flex flex-1 items-start" style={{ minWidth: 0 }}>
                <div className="flex min-w-[72px] flex-1 flex-col items-center text-center">
                  <div
                    className={[
                      'relative flex h-14 w-14 items-center justify-center rounded-2xl border bg-panel2/80 transition-all duration-300',
                      toneRing[tone],
                      isActive ? 'scale-110' : tone === 'idle' ? 'opacity-70' : 'opacity-100',
                    ].join(' ')}
                  >
                    {isActive && <span className="absolute inset-0 animate-ringPing rounded-2xl border border-flow/50" />}
                    <StageIcon k={st.key} />
                  </div>
                  <div className="mt-2 text-[11px] font-semibold text-slate-200">{st.label}</div>
                  <div className="text-[10px] text-slate-500">{st.sub}</div>
                </div>

                {i < STAGES.length - 1 && (
                  <div className="relative mt-7 h-[3px] w-full min-w-[14px] flex-1 overflow-hidden rounded-full bg-edge/70">
                    <div
                      className={[
                        'absolute inset-0 rounded-full transition-opacity duration-300',
                        segFlow === i ? 'opacity-100' : 'opacity-0',
                      ].join(' ')}
                      style={{
                        backgroundImage: 'linear-gradient(90deg, transparent, #22d3ee, transparent)',
                        backgroundSize: '200% 100%',
                        animation: 'shimmer 0.9s linear infinite',
                      }}
                    />
                    {tones[i] && tones[i + 1] && segFlow !== i && (
                      <div className="absolute inset-0 rounded-full bg-flow/30" />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5"><i className="inline-block h-2 w-2 rounded-full bg-flow" /> in-flight</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-2 w-2 rounded-full bg-emerald-400" /> allowed</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-2 w-2 rounded-full bg-rose-400" /> denied at gate</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-2 w-2 rounded-full bg-amber-400" /> needs approval</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-2 w-2 rounded-full bg-sky-400" /> transformed</span>
      </div>
    </div>
  );
}

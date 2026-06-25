'use client';
import { useEffect, useRef, useState } from 'react';
import {
  api,
  useAgentSocket,
  type ApprovalRequest,
  type AuditEntry,
  type ChatLine,
  type DiscoveredTool,
  type Rule,
  type ServerEvent,
  type ServerStatus,
} from './lib/api';
import { Pipeline, type FlowSignal } from './components/Pipeline';
import { Servers } from './components/Servers';
import { Rules } from './components/Rules';
import { Approvals } from './components/Approvals';
import { Logs } from './components/Logs';
import { Chat } from './components/Chat';
import { Stat } from './components/ui';

export default function Page() {
  const [servers, setServers] = useState<ServerStatus[]>([]);
  const [tools, setTools] = useState<DiscoveredTool[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [policyVersion, setPolicyVersion] = useState('');
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [flow, setFlow] = useState<FlowSignal | null>(null);
  const flowId = useRef(0);

  useEffect(() => {
    api('/servers').then((r) => setServers(r.servers)).catch(() => {});
    api('/tools').then((r) => setTools(r.tools)).catch(() => {});
    api('/rules').then((r) => {
      setRules(r.rules);
      setPolicyVersion(r.policyVersion);
    }).catch(() => {});
    api('/approvals').then((r) => setApprovals(r.approvals)).catch(() => {});
    api('/audit?limit=200').then((r) => setAudit(r.entries)).catch(() => {});
  }, []);

  const connected = useAgentSocket((e: ServerEvent) => {
    switch (e.type) {
      case 'rules':
        setRules(e.rules);
        setPolicyVersion(e.policyVersion);
        break;
      case 'servers':
        setServers(e.servers);
        break;
      case 'audit':
        setAudit((a) => [e.entry, ...a].slice(0, 300));
        break;
      case 'approval':
        setApprovals((list) => {
          const i = list.findIndex((x) => x.id === e.request.id);
          if (i === -1) return [e.request, ...list];
          const copy = [...list];
          copy[i] = e.request;
          return copy;
        });
        break;
      case 'chat': {
        const meta = (e.meta ?? {}) as Record<string, unknown>;
        setChat((c) => [...c, { conversationId: e.conversationId, role: e.role, content: e.content, meta }]);
        // Drive the live pipeline animation from real plan/tool events.
        if (e.role === 'plan') {
          setFlow({ id: ++flowId.current, kind: 'plan' });
        } else if (e.role === 'tool') {
          setFlow({
            id: ++flowId.current,
            kind: 'tool',
            tool: meta.tool as string | undefined,
            verdict: meta.verdict as string | undefined,
            reason: meta.reason as string | undefined,
            blocked: Boolean(meta.blocked),
          });
        }
        break;
      }
    }
  });

  const activeTools = tools.filter((t) => !t.quarantined).length;
  const pending = approvals.filter((a) => a.status === 'pending').length;
  const denials = audit.filter((a) => a.verdict === 'DENY').length;

  return (
    <main className="mx-auto max-w-7xl px-4 py-7 lg:px-6">
      {/* hero */}
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-glow">
            <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 3v5c0 4.4-3 7.4-7 9-4-1.6-7-4.6-7-9V6z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 11.5l2 2 4-4.5" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gradient">Intent Assurance Plane</h1>
            <p className="text-sm text-slate-400">A signed plan gates every tool call — drift is denied at the gate.</p>
          </div>
        </div>
        <span className={`chip ${connected ? 'text-emerald-300' : 'text-rose-300'}`}>
          <span className={`inline-block h-2 w-2 rounded-full ${connected ? 'bg-emerald-400 animate-pulseGlow' : 'bg-rose-400'}`} />
          {connected ? 'live' : 'offline'}
        </span>
      </header>

      {/* stat bar — replaces the old wall of text */}
      <div className="mb-6 flex flex-wrap gap-3">
        <Stat label="Active tools" value={activeTools} accent="text-flow" />
        <Stat label="Servers" value={servers.length} />
        <Stat label="Rules" value={rules.filter((r) => r.enabled).length} accent="text-accent2" />
        <Stat label="Pending approvals" value={pending} accent={pending ? 'text-amber-300' : undefined} />
        <Stat label="Denials" value={denials} accent={denials ? 'text-rose-300' : undefined} />
        <Stat label="Decisions" value={audit.length} />
      </div>

      {/* the animated centerpiece */}
      <div className="mb-6">
        <Pipeline signal={flow} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Chat lines={chat} conversationId={conversationId} onConversation={setConversationId} />
          <Logs audit={audit} />
        </div>
        <div className="space-y-5">
          <Servers servers={servers} tools={tools} onRefreshed={setTools} />
          <Approvals approvals={approvals} />
        </div>
      </div>

      <div className="mt-5">
        <Rules rules={rules} policyVersion={policyVersion} />
      </div>

      <footer className="mt-8 text-center text-xs text-slate-600">
        Guarded AI Agent · MCP · fail-closed policy enforcement · tamper-evident audit
      </footer>
    </main>
  );
}

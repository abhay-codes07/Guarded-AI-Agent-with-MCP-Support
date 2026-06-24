'use client';
import { useEffect, useState } from 'react';
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
import { Servers } from './components/Servers';
import { Rules } from './components/Rules';
import { Approvals } from './components/Approvals';
import { Logs } from './components/Logs';
import { Chat } from './components/Chat';

export default function Page() {
  const [servers, setServers] = useState<ServerStatus[]>([]);
  const [tools, setTools] = useState<DiscoveredTool[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [policyVersion, setPolicyVersion] = useState('');
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);

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
      case 'chat':
        setChat((c) => [...c, { conversationId: e.conversationId, role: e.role, content: e.content, meta: e.meta }]);
        break;
    }
  });

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Guardrails Console</h1>
          <p className="text-sm text-slate-400">
            Every tool call must belong to a signed plan, come from trusted data, and pass live policy — or it is
            denied at the gate.
          </p>
        </div>
        <span
          className={`badge ${connected ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}
        >
          {connected ? '● live' : '○ offline'}
        </span>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Chat lines={chat} conversationId={conversationId} onConversation={setConversationId} />
          <Logs audit={audit} />
        </div>
        <div className="space-y-4">
          <Servers servers={servers} tools={tools} onRefreshed={setTools} />
          <Approvals approvals={approvals} />
        </div>
      </div>

      <div className="mt-4">
        <Rules rules={rules} policyVersion={policyVersion} />
      </div>
    </main>
  );
}

'use client';
import { useEffect, useRef, useState } from 'react';

export const AGENT_URL =
  process.env.NEXT_PUBLIC_AGENT_URL?.replace(/\/$/, '') ?? 'http://localhost:8787';

// ---- types (mirror of the agent's @gaa/shared DTOs) ----
export type Verdict = 'ALLOW' | 'DENY' | 'REQUIRE_APPROVAL' | 'TRANSFORM' | 'EVENT';

export interface Rule {
  id: string;
  name: string;
  kind: 'block' | 'approval' | 'input' | 'budget' | 'injection';
  priority: number;
  enabled: boolean;
  mode: 'enforce' | 'shadow';
  match: Record<string, unknown>;
  action: Exclude<Verdict, 'EVENT'>;
  sanitizer?: string;
  description?: string;
}

export interface AuditEntry {
  id: string;
  ts: string;
  conversationId: string;
  tool: string;
  serverId: string;
  argsRedacted: unknown;
  taint: boolean;
  riskScore: number;
  verdict: Verdict;
  reason: string;
  matchedRuleId?: string;
  policyVersion: string;
  latencyMs: number;
  mode: string;
}

export interface ApprovalRequest {
  id: string;
  conversationId: string;
  tool: string;
  argsRedacted: unknown;
  reason: string;
  createdAt: string;
  expiresAt: string;
  status: 'pending' | 'approved' | 'denied' | 'expired';
}

export interface ServerStatus {
  id: string;
  label: string;
  transport: string;
  trustTier: string;
  health: string;
  toolCount: number;
  circuitOpen: boolean;
  lastError?: string;
}

export interface DiscoveredTool {
  id: string;
  serverId: string;
  trustTier: string;
  description?: string;
  quarantined: boolean;
  quarantineReason?: string;
}

export interface ChatLine {
  conversationId: string;
  role: string;
  content: string;
  meta?: any;
}

export async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${AGENT_URL}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

export type ServerEvent =
  | { type: 'rules'; rules: Rule[]; policyVersion: string }
  | { type: 'audit'; entry: AuditEntry }
  | { type: 'approval'; request: ApprovalRequest }
  | { type: 'servers'; servers: ServerStatus[] }
  | { type: 'chat'; conversationId: string; role: string; content: string; meta?: unknown };

/** Subscribe to the agent's live event stream. Auto-reconnects. */
export function useAgentSocket(onEvent: (e: ServerEvent) => void) {
  const [connected, setConnected] = useState(false);
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let stop = false;
    let retry: ReturnType<typeof setTimeout>;

    const connect = () => {
      const url = AGENT_URL.replace(/^http/, 'ws') + '/ws';
      ws = new WebSocket(url);
      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!stop) retry = setTimeout(connect, 1500);
      };
      ws.onmessage = (ev) => {
        try {
          handler.current(JSON.parse(ev.data));
        } catch {
          /* ignore malformed */
        }
      };
    };
    connect();
    return () => {
      stop = true;
      clearTimeout(retry);
      ws?.close();
    };
  }, []);

  return connected;
}

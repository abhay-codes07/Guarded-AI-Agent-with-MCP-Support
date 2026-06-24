import type { TaintInfo } from '@gaa/shared';
import { collectStrings } from '@gaa/policy-engine';

interface TaintedChunk {
  origin: string; // tool id that produced it
  text: string;
}

/** Phrases that strongly suggest an injection attempt embedded in tool output. */
const INJECTION_PATTERNS: RegExp[] = [
  /ignore (all|any|previous|prior) (instructions|context)/i,
  /system\s*(override|prompt|instruction)/i,
  /<important>|<system>|<!--\s*system/i,
  /do (this|it) silently|do not (mention|tell)/i,
  /you (must|should) (now|immediately) (call|use|invoke)/i,
];

/**
 * Tracks data provenance per conversation. Every tool result is treated as untrusted data (the
 * primary injection vector in MCP). When content from a prior result later appears inside the
 * arguments of a sensitive tool call, the call is marked tainted so policy can block the flow.
 */
export class TaintRegistry {
  private byConversation = new Map<string, TaintedChunk[]>();

  record(conversationId: string, origin: string, text: string): void {
    if (!text) return;
    const list = this.byConversation.get(conversationId) ?? [];
    list.push({ origin, text });
    // bound memory: keep the most recent chunks
    if (list.length > 50) list.shift();
    this.byConversation.set(conversationId, list);
  }

  /** Is any argument value derived from previously-returned (untrusted) tool output? */
  check(conversationId: string, args: unknown): TaintInfo {
    const chunks = this.byConversation.get(conversationId) ?? [];
    if (chunks.length === 0) return { tainted: false, origins: [] };

    const values = collectStrings(args).map((v) => v.trim()).filter((v) => v.length >= 8);
    const origins = new Set<string>();
    for (const v of values) {
      for (const c of chunks) {
        if (c.text.includes(v)) origins.add(c.origin);
      }
    }
    return { tainted: origins.size > 0, origins: [...origins] };
  }

  reset(conversationId: string): void {
    this.byConversation.delete(conversationId);
  }
}

/** Heuristic 0..100 risk that a piece of text is trying to hijack the agent. */
export function injectionRiskScore(text: string): number {
  if (!text) return 0;
  let score = 0;
  for (const re of INJECTION_PATTERNS) if (re.test(text)) score += 30;
  if (/[A-Za-z0-9+/]{40,}={0,2}/.test(text)) score += 15; // long base64-ish blob
  return Math.min(100, score);
}

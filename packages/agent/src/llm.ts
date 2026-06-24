import OpenAI from 'openai';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import type { DiscoveredTool } from '@gaa/shared';

export function createOpenAI(apiKey: string): OpenAI {
  return new OpenAI({ apiKey });
}

/**
 * Convert live-discovered MCP tools into OpenAI function tools. OpenAI function names disallow dots,
 * so the namespaced tool id ("vault.read_file") is encoded to "vault__read_file"; we keep a map back.
 */
export function toOpenAITools(tools: DiscoveredTool[]): {
  tools: ChatCompletionTool[];
  nameToId: Map<string, string>;
} {
  const nameToId = new Map<string, string>();
  const out: ChatCompletionTool[] = [];
  for (const t of tools) {
    const fnName = t.id.replace(/\./g, '__').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
    nameToId.set(fnName, t.id);
    out.push({
      type: 'function',
      function: {
        name: fnName,
        description: t.description ?? t.title ?? t.name,
        parameters: (t.inputSchema as Record<string, unknown>) ?? { type: 'object', properties: {} },
      },
    });
  }
  return { tools: out, nameToId };
}

// Rough gpt-4o pricing (USD per token) for budget accounting in the demo.
const PRICE: Record<string, { in: number; out: number }> = {
  'gpt-4o': { in: 2.5 / 1_000_000, out: 10 / 1_000_000 },
  'gpt-4o-mini': { in: 0.15 / 1_000_000, out: 0.6 / 1_000_000 },
};

export function estimateCostUsd(model: string, promptTokens: number, completionTokens: number): number {
  const p = PRICE[model] ?? PRICE['gpt-4o']!;
  return promptTokens * p.in + completionTokens * p.out;
}

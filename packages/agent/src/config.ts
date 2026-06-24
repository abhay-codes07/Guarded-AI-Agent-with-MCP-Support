import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

// Best-effort .env load (Node >= 21.7). Safe to ignore if absent.
try {
  (process as unknown as { loadEnvFile?: (p?: string) => void }).loadEnvFile?.(resolve(process.cwd(), '.env'));
} catch {
  /* no .env file — rely on real environment */
}

const ServerConfigSchema = z.object({
  id: z.string(),
  label: z.string().default(''),
  transport: z.enum(['stdio', 'http']),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  url: z.string().url().optional(),
  trustTier: z.enum(['trusted', 'untrusted']).default('untrusted'),
});
export type ServerConfig = z.infer<typeof ServerConfigSchema>;

const McpConfigSchema = z.object({ servers: z.array(ServerConfigSchema) });

export interface AppConfig {
  port: number;
  corsOrigin: string;
  openaiApiKey: string;
  openaiModel: string;
  approvalTtlMs: number;
  circuitFails: number;
  circuitResetMs: number;
  toolTimeoutMs: number;
  killSwitchViolations: number;
  maxLoopSteps: number;
  intentPrivateKey?: string;
  intentPublicKey?: string;
  mcpServers: ServerConfig[];
}

function num(name: string, def: number): number {
  const v = process.env[name];
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : def;
}

export function loadConfig(): AppConfig {
  const mcpPath = resolve(process.cwd(), 'mcp.config.json');
  const mcp = McpConfigSchema.parse(JSON.parse(readFileSync(mcpPath, 'utf8')));

  return {
    port: num('PORT', 8787),
    corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    openaiApiKey: process.env.OPENAI_API_KEY ?? '',
    openaiModel: process.env.OPENAI_MODEL ?? 'gpt-4o',
    approvalTtlMs: num('APPROVAL_TTL_MS', 60_000),
    circuitFails: num('CIRCUIT_FAILS', 3),
    circuitResetMs: num('CIRCUIT_RESET_MS', 15_000),
    toolTimeoutMs: num('TOOL_TIMEOUT_MS', 15_000),
    killSwitchViolations: num('KILL_SWITCH_VIOLATIONS', 5),
    maxLoopSteps: num('MAX_LOOP_STEPS', 12),
    intentPrivateKey: process.env.INTENT_PRIVATE_KEY || undefined,
    intentPublicKey: process.env.INTENT_PUBLIC_KEY || undefined,
    mcpServers: mcp.servers,
  };
}

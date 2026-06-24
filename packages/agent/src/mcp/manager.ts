import { EventEmitter } from 'node:events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { sha256Hex, stableStringify } from '@gaa/policy-engine';
import type { DiscoveredTool, ServerStatus } from '@gaa/shared';
import type { ServerConfig } from '../config.js';

export interface ToolCallResult {
  text: string;
  isError: boolean;
}

interface ManagedServer {
  config: ServerConfig;
  client?: Client;
  health: ServerStatus['health'];
  lastError?: string;
  failures: number;
  circuitOpenUntil: number;
}

export interface ManagerOptions {
  toolTimeoutMs: number;
  circuitFails: number;
  circuitResetMs: number;
}

/**
 * Owns connections to every configured MCP server. Responsibilities:
 *  - live tool discovery (no hardcoded tool lists; add a server in mcp.config.json and it appears)
 *  - integrity pinning: hash each tool's name+description+schema on first sight (TOFU) and
 *    quarantine a tool if a later listing changes the hash (tool poisoning / rug-pull)
 *  - resilience: per-server circuit breaker, timeouts, and structured errors (never silent success)
 */
export class McpManager extends EventEmitter {
  private servers = new Map<string, ManagedServer>();
  private tools = new Map<string, DiscoveredTool>();

  constructor(
    private readonly configs: ServerConfig[],
    private readonly opts: ManagerOptions,
  ) {
    super();
  }

  async init(): Promise<void> {
    for (const config of this.configs) {
      this.servers.set(config.id, {
        config,
        health: 'down',
        failures: 0,
        circuitOpenUntil: 0,
      });
      await this.connect(config.id);
    }
    await this.discoverAll();
  }

  private async connect(serverId: string): Promise<void> {
    const srv = this.servers.get(serverId);
    if (!srv) return;
    try {
      const client = new Client({ name: 'guarded-agent', version: '0.1.0' });
      const transport =
        srv.config.transport === 'stdio'
          ? new StdioClientTransport({
              command: srv.config.command!,
              args: srv.config.args ?? [],
              env: process.env as Record<string, string>,
            })
          : new StreamableHTTPClientTransport(new URL(srv.config.url!));
      await client.connect(transport);
      srv.client = client;
      srv.health = 'healthy';
      srv.lastError = undefined;
      // If the underlying transport dies, mark the server down so the breaker reacts.
      client.onclose = () => {
        srv.health = 'down';
        srv.client = undefined;
        this.emitServers();
      };
    } catch (err) {
      srv.health = 'down';
      srv.lastError = (err as Error).message;
    }
  }

  /** (Re)discover tools across all servers and apply integrity pinning. */
  async discoverAll(): Promise<DiscoveredTool[]> {
    for (const [id, srv] of this.servers) {
      if (!srv.client) await this.connect(id);
      if (!srv.client) continue;
      try {
        const { tools } = await srv.client.listTools();
        for (const t of tools) {
          const toolId = `${id}.${t.name}`;
          const descHash = sha256Hex(
            `${t.name}\n${t.description ?? ''}\n${stableStringify(t.inputSchema)}`,
          );
          const existing = this.tools.get(toolId);
          if (existing && existing.descHash !== descHash) {
            // Tool definition mutated after first discovery — quarantine (rug-pull / poisoning).
            this.tools.set(toolId, {
              ...existing,
              quarantined: true,
              quarantineReason: 'tool description/schema changed after first discovery (TOFU violation)',
              description: t.description,
              inputSchema: t.inputSchema,
            });
            this.emit('alert', {
              kind: 'integrity',
              toolId,
              message: `Quarantined ${toolId}: definition changed since first discovery`,
            });
          } else if (!existing) {
            this.tools.set(toolId, {
              id: toolId,
              name: t.name,
              serverId: id,
              trustTier: srv.config.trustTier,
              title: t.title,
              description: t.description,
              inputSchema: t.inputSchema,
              descHash,
              quarantined: false,
            });
          }
        }
        srv.health = 'healthy';
      } catch (err) {
        srv.health = 'degraded';
        srv.lastError = (err as Error).message;
      }
    }
    this.emitServers();
    return this.listTools();
  }

  listTools(): DiscoveredTool[] {
    return [...this.tools.values()];
  }

  getTool(id: string): DiscoveredTool | undefined {
    return this.tools.get(id);
  }

  /** Tools an LLM may be offered: everything discovered except quarantined ones. */
  activeTools(): DiscoveredTool[] {
    return this.listTools().filter((t) => !t.quarantined);
  }

  async callTool(serverId: string, name: string, args: unknown): Promise<ToolCallResult> {
    const srv = this.servers.get(serverId);
    if (!srv) return { text: `unknown server: ${serverId}`, isError: true };

    const now = Date.now();
    if (srv.circuitOpenUntil > now) {
      return { text: `circuit open for ${serverId} (server unhealthy); call short-circuited`, isError: true };
    }
    if (!srv.client) {
      await this.connect(serverId);
      if (!srv.client) {
        this.tripFailure(srv);
        return { text: `server ${serverId} unavailable: ${srv.lastError ?? 'not connected'}`, isError: true };
      }
    }

    try {
      const result = (await withTimeout(
        srv.client.callTool({ name, arguments: (args ?? {}) as Record<string, unknown> }),
        this.opts.toolTimeoutMs,
      )) as { content?: unknown; isError?: boolean };
      srv.failures = 0;
      srv.health = 'healthy';
      const text = extractText(result);
      return { text, isError: result.isError === true };
    } catch (err) {
      this.tripFailure(srv, (err as Error).message);
      return { text: `tool execution failed: ${(err as Error).message}`, isError: true };
    }
  }

  private tripFailure(srv: ManagedServer, message?: string): void {
    srv.failures += 1;
    srv.lastError = message ?? srv.lastError;
    if (srv.failures >= this.opts.circuitFails) {
      srv.circuitOpenUntil = Date.now() + this.opts.circuitResetMs;
      srv.health = 'down';
      srv.failures = 0;
      this.emit('alert', {
        kind: 'circuit',
        serverId: srv.config.id,
        message: `Circuit opened for ${srv.config.id} after repeated failures`,
      });
    } else {
      srv.health = 'degraded';
    }
    this.emitServers();
  }

  statuses(): ServerStatus[] {
    return [...this.servers.values()].map((srv) => ({
      id: srv.config.id,
      label: srv.config.label,
      transport: srv.config.transport,
      trustTier: srv.config.trustTier,
      health: srv.health,
      toolCount: this.listTools().filter((t) => t.serverId === srv.config.id).length,
      circuitOpen: srv.circuitOpenUntil > Date.now(),
      lastError: srv.lastError,
    }));
  }

  private emitServers(): void {
    this.emit('servers', this.statuses());
  }

  async close(): Promise<void> {
    for (const srv of this.servers.values()) await srv.client?.close().catch(() => {});
  }
}

function extractText(result: { content?: unknown }): string {
  const content = (result.content ?? []) as Array<{ type: string; text?: string }>;
  return content
    .map((c) => (c.type === 'text' ? c.text ?? '' : `[${c.type}]`))
    .join('\n')
    .trim();
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

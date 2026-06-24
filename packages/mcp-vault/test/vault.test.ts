import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

/**
 * Spins up the real Vault server over stdio via the MCP SDK client — exercises the actual protocol
 * (initialize handshake, tools/list, tools/call, structured errors), not internal functions.
 */
const serverPath = fileURLToPath(new URL('../src/server.ts', import.meta.url));
let client: Client;
let transport: StdioClientTransport;

beforeAll(async () => {
  transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('../../../node_modules/tsx/dist/cli.mjs', import.meta.url)), serverPath],
    env: { ...process.env, VAULT_RUGPULL: 'off' },
  });
  client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(transport);
}, 30000);

afterAll(async () => {
  await client?.close();
});

describe('Vault MCP server', () => {
  it('lists tools with schemas (live discovery)', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toContain('read_file');
    expect(names).toContain('export_secret');
    expect(names).toContain('delete_all');
    for (const t of tools) expect(t.inputSchema).toBeDefined();
  });

  it('reads a seeded file', async () => {
    const res = await client.callTool({ name: 'read_file', arguments: { path: '/sandbox/notes/todo.txt' } });
    const text = (res.content as Array<{ type: string; text: string }>)[0]!.text;
    expect(text).toContain('tests');
  });

  it('returns a structured error for a missing file (not a crash)', async () => {
    const res = await client.callTool({ name: 'read_file', arguments: { path: '/sandbox/nope.txt' } });
    expect(res.isError).toBe(true);
  });

  it('rejects path traversal outside the sandbox', async () => {
    const res = await client.callTool({ name: 'read_file', arguments: { path: '/etc/passwd' } });
    expect(res.isError).toBe(true);
  });

  it('exposes the dangerous secret (so the policy layer has something real to stop)', async () => {
    const res = await client.callTool({ name: 'export_secret', arguments: { name: 'prod_db_password' } });
    const text = (res.content as Array<{ type: string; text: string }>)[0]!.text;
    expect(text).toContain('prod-db');
  });
});

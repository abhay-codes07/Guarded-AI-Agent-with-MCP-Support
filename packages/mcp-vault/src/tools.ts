import { z } from 'zod';
import type { VaultState } from './state.js';

export interface VaultTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  args: z.ZodTypeAny;
  /** returns text; throwing produces a structured MCP tool error. */
  handler: (args: unknown, state: VaultState) => string;
  /** marks tools whose side effects are dangerous (handy for demos / default-deny policy). */
  dangerous?: boolean;
}

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

export const VAULT_TOOLS: VaultTool[] = [
  {
    name: 'list_files',
    description: 'List files in the sandbox under an optional directory (defaults to /sandbox).',
    inputSchema: obj({ dir: { type: 'string', description: 'directory path, e.g. /sandbox/notes' } }),
    args: z.object({ dir: z.string().optional() }),
    handler: (a, s) => {
      const { dir } = a as { dir?: string };
      const files = s.listFiles(dir ?? '/sandbox');
      return files.length ? files.join('\n') : '(no files)';
    },
  },
  {
    name: 'read_file',
    description: 'Read the contents of a file under /sandbox.',
    inputSchema: obj({ path: { type: 'string' } }, ['path']),
    args: z.object({ path: z.string() }),
    handler: (a, s) => s.readFile((a as { path: string }).path),
  },
  {
    name: 'write_file',
    description: 'Create or overwrite a file under /sandbox.',
    inputSchema: obj({ path: { type: 'string' }, content: { type: 'string' } }, ['path', 'content']),
    args: z.object({ path: z.string(), content: z.string() }),
    handler: (a, s) => {
      const { path, content } = a as { path: string; content: string };
      return `wrote ${s.writeFile(path, content)} (${content.length} bytes)`;
    },
  },
  {
    name: 'query_records',
    description:
      'Query the customer record store. Optionally filter by a field (name/plan/region) containing a value.',
    inputSchema: obj({
      field: { type: 'string', enum: ['name', 'plan', 'region', 'id'] },
      contains: { type: 'string' },
    }),
    args: z.object({ field: z.string().optional(), contains: z.string().optional() }),
    handler: (a, s) => {
      const { field, contains } = a as { field?: string; contains?: string };
      return JSON.stringify(s.queryRecords(field, contains), null, 2);
    },
  },
  {
    name: 'fetch_updates',
    description: 'Fetch the latest product update notes for the team.',
    inputSchema: obj({}),
    args: z.object({}),
    handler: () => 'No new product updates since last week.',
  },
  {
    name: 'export_secret',
    description:
      'Return the value of a named secret from the vault. Sensitive: this is an egress-shaped action.',
    inputSchema: obj({ name: { type: 'string' } }, ['name']),
    args: z.object({ name: z.string() }),
    dangerous: true,
    handler: (a, s) => s.exportSecret((a as { name: string }).name),
  },
  {
    name: 'delete_all',
    description: 'Permanently delete every file and record in the vault. Destructive and irreversible.',
    inputSchema: obj({}),
    args: z.object({}),
    dangerous: true,
    handler: (_a, s) => `deleted ${s.deleteAll()} objects`,
  },
];

import { type Rule, RuleSchema } from '@gaa/shared';

/**
 * Default guardrail policy shipped with the app. These are ordinary rules — nothing here is
 * special-cased in code. They demonstrate each rule kind and give the demo a sane baseline.
 * Tool names appear ONLY as data here (and in dashboard-authored rules), never in engine logic.
 */
const RAW: Array<Omit<Rule, 'createdAt'>> = [
  {
    id: 'seed-block-delete-all',
    name: 'Block destructive delete_all',
    kind: 'block',
    priority: 10,
    enabled: true,
    mode: 'enforce',
    match: { toolGlob: '*.delete_all' },
    action: 'DENY',
    description: 'Never allow a tool that wipes all data.',
  },
  {
    id: 'seed-approve-export-secret',
    name: 'Require approval to export secrets',
    kind: 'approval',
    priority: 20,
    enabled: true,
    mode: 'enforce',
    match: { toolGlob: '*.export_secret' },
    action: 'REQUIRE_APPROVAL',
    description: 'A human must approve any secret egress.',
  },
  {
    id: 'seed-sandbox-paths',
    name: 'File paths must stay under /sandbox/',
    kind: 'input',
    priority: 30,
    enabled: true,
    mode: 'enforce',
    match: { argPath: 'path', argNotRegex: '^/sandbox/' },
    action: 'DENY',
    description: 'Reject path traversal / access outside the sandbox.',
  },
  {
    id: 'seed-taint-egress',
    name: 'Block untrusted data flowing into secret export',
    kind: 'injection',
    priority: 15,
    enabled: true,
    mode: 'enforce',
    match: { toolGlob: '*.export_secret', tainted: true },
    action: 'DENY',
    description: 'Data-flow guard: tainted (untrusted-origin) content must not reach egress tools.',
  },
  {
    id: 'seed-budget',
    name: 'Conversation token budget',
    kind: 'budget',
    priority: 40,
    enabled: true,
    mode: 'enforce',
    match: { tokenBudget: 200000 },
    action: 'DENY',
    description: 'Halt tool use once the conversation exceeds its token budget.',
  },
];

export function defaultRules(): Rule[] {
  return RAW.map((r) => RuleSchema.parse({ ...r, createdAt: new Date().toISOString() }));
}

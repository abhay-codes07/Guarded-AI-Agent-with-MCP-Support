import type { Sanitizer } from '@gaa/shared';

/** Apply a named sanitizer to tool args, returning a transformed copy. Pure. */
export function applySanitizer(name: Sanitizer, args: unknown): unknown {
  switch (name) {
    case 'redactSecrets':
      return redactSecrets(args);
    case 'clampPath':
      return clampPath(args);
    default:
      return args;
  }
}

const SECRET_RE =
  /(sk-[a-zA-Z0-9]{8,}|AKIA[0-9A-Z]{12,}|ghp_[a-zA-Z0-9]{20,}|-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]+?-----END [A-Z ]+PRIVATE KEY-----|password\s*[:=]\s*\S+)/g;

function redactSecrets(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(SECRET_RE, '[REDACTED]');
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = redactSecrets(v);
    return out;
  }
  return value;
}

/** Force any `path` arg to stay under /sandbox/ by stripping traversal and re-rooting. */
function clampPath(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const obj = { ...(value as Record<string, unknown>) };
  if (typeof obj.path === 'string') {
    const cleaned = obj.path.replace(/\.\.(\/|\\)/g, '').replace(/^([/\\])+/, '');
    obj.path = cleaned.startsWith('sandbox') ? `/${cleaned}` : `/sandbox/${cleaned}`;
  }
  return obj;
}

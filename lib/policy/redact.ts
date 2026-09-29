/**
 * Secret redaction utility for telemetry and audit events.
 * Redacts secrets on both server-side and client-side ingestion paths.
 */

const SECRET_PATTERNS: Array<{ regex: RegExp; replacement: string }> = [
  // Bearer tokens and Authorization headers
  {
    regex: /(bearer\s+)[a-zA-Z0-9_\-\.]{12,}/gi,
    replacement: '$1[REDACTED_TOKEN]',
  },
  {
    regex: /(authorization:\s*)[^\r\n,]+/gi,
    replacement: '$1[REDACTED_AUTH_HEADER]',
  },
  // OpenAI & Anthropic API keys (sk-..., ant-...)
  {
    regex: /sk-[a-zA-Z0-9_\-]{20,}/g,
    replacement: 'sk-[REDACTED_API_KEY]',
  },
  {
    regex: /ant-[a-zA-Z0-9_\-]{20,}/g,
    replacement: 'ant-[REDACTED_API_KEY]',
  },
  // GitHub PATs
  {
    regex: /ghp_[a-zA-Z0-9]{36,}/g,
    replacement: 'ghp_[REDACTED_GH_TOKEN]',
  },
  // AWS Access Key ID and Secret
  {
    regex: /(AKIA[0-9A-Z]{16})/g,
    replacement: '[REDACTED_AWS_KEY_ID]',
  },
  {
    regex: /((?:aws_secret_access_key|aws_session_token|secret_key|api_key|password|token)\s*[:=]\s*['"]?)[a-zA-Z0-9/+=_\-]{16,}['"]?/gi,
    replacement: '$1[REDACTED_CREDENTIAL]',
  },
  // Private Key blocks
  {
    regex: /-----BEGIN\s+(?:RSA|OPENSSH|DSA|EC|PGP)?\s*PRIVATE KEY-----[\s\S]*?-----END\s+(?:RSA|OPENSSH|DSA|EC|PGP)?\s*PRIVATE KEY-----/g,
    replacement: '[REDACTED_PRIVATE_KEY_BLOCK]',
  },
  // Database Connection URIs with passwords
  {
    regex: /(postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^:\s]+:[^@\s]+@/gi,
    replacement: '$1://[REDACTED_USER]:[REDACTED_PASSWORD]@',
  },
];

export function redactSecrets(text: string): string {
  if (!text || typeof text !== 'string') return text;
  let sanitized = text;
  for (const { regex, replacement } of SECRET_PATTERNS) {
    sanitized = sanitized.replace(regex, replacement);
  }
  return sanitized;
}

export function redactObject<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    return redactSecrets(obj) as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => redactObject(item)) as unknown as T;
  }
  if (typeof obj === 'object') {
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('password') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('apikey') ||
        lowerKey.includes('token') ||
        lowerKey.includes('auth') ||
        lowerKey.includes('credential')
      ) {
        redacted[key] = '[REDACTED]';
      } else {
        redacted[key] = redactObject(value);
      }
    }
    return redacted as T;
  }
  return obj;
}

const SECRET_PATTERNS: RegExp[] = [
  /\b(?:password|passwd|pwd|secret|token|api[_-]?key|authorization|credential)\s*[:=]\s*\S+/gi,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  /\b(?:ghp|gho|ghu|ghs|glpat|sk)-[A-Za-z0-9_=-]{16,}\b/g,
  /(https?:\/\/)([^:\s/@]+):([^@\s]+)@/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];

/** Redact credential-shaped substrings. Never invents secrets; only masks matches. */
export function redact(text: string): string {
  let out = text;
  out = out.replace(SECRET_PATTERNS[0]!, (_m) => {
    const lower = _m.toLowerCase();
    const key = lower.split(/[:=]/)[0]?.trim() ?? "secret";
    return `${key}=<redacted>`;
  });
  out = out.replace(SECRET_PATTERNS[1]!, "<redacted-jwt>");
  out = out.replace(SECRET_PATTERNS[2]!, "<redacted-token>");
  out = out.replace(SECRET_PATTERNS[3]!, "$1<redacted>:<redacted>@");
  out = out.replace(SECRET_PATTERNS[4]!, "<redacted-private-key>");
  return out;
}

export function truncate(
  text: string,
  limit: number,
): { text: string; truncated: boolean; total: number } {
  const total = text.length;
  if (total <= limit) return { text, truncated: false, total };
  return {
    text: `${text.slice(0, limit).trimEnd()}\n... (truncated, ${total} chars total)`,
    truncated: true,
    total,
  };
}

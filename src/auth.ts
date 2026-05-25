export function validateApiKey(token: string, expected: string): boolean {
  if (!expected) return true;
  if (!token) return false;
  const cleaned = token.replace(/^Bearer\s+/i, '').trim();
  return cleaned === expected;
}

export function extractApiKey(header: string | undefined): string {
  if (!header) return '';
  return header.replace(/^Bearer\s+/i, '').trim();
}

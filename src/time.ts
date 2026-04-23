const RELATIVE_RE = /^(\d+)\s*([smhdw])$/i;

const UNIT_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
  w: 604800,
};

export function parseTimeToUnix(input: string, nowSeconds: number = Math.floor(Date.now() / 1000)): number {
  const trimmed = input.trim();

  const relMatch = trimmed.match(RELATIVE_RE);
  if (relMatch) {
    const amount = Number.parseInt(relMatch[1], 10);
    const unit = relMatch[2].toLowerCase();
    return nowSeconds - amount * UNIT_SECONDS[unit];
  }

  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) {
    throw new Error(
      `Invalid time: "${input}". Expected ISO 8601 (e.g. 2026-04-20T10:00:00Z) or relative (e.g. 6h, 2d, 1w).`,
    );
  }
  return Math.floor(ms / 1000);
}

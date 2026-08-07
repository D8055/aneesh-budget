/** Parse a dollar string like "$1,234.56", "-12.30", "(45.00)", "+ $20.00" into integer cents (absolute value). */
export function parseCents(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s+]/g, '').replace(/^\((.*)\)$/, '-$1')
  if (cleaned === '' || cleaned === '-') return null
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return null
  return Math.round(Math.abs(n) * 100)
}

/** True if the raw dollar string is negative ("-12.30" or "(12.30)"). */
export function isNegative(raw: string): boolean {
  const t = raw.trim()
  return t.startsWith('-') || (t.startsWith('(') && t.endsWith(')'))
}

export function fmtCents(cents: number, opts: { sign?: boolean } = {}): string {
  const dollars = cents / 100
  const s = dollars.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  return opts.sign ? `+${s}` : s
}

/** Compact form for chart axes: $1.2k */
export function fmtCompact(cents: number): string {
  const d = cents / 100
  if (d >= 1000) return `$${(d / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return `$${Math.round(d)}`
}

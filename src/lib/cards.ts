export type UtilizationStatus = 'low' | 'medium' | 'high'

export interface Utilization {
  /** true percent used, may exceed 100 */
  pct: number
  /** percent for drawing the bar, capped at 100 */
  barPct: number
  status: UtilizationStatus
}

/** Credit-score guidance thresholds: ≤30% healthy, 31–75% caution, >75% high. */
export function cardUtilization(balanceCents: number, limitCents: number): Utilization {
  if (limitCents <= 0) return { pct: 0, barPct: 0, status: 'low' }
  const pct = Math.round((balanceCents / limitCents) * 100)
  const status: UtilizationStatus = pct > 75 ? 'high' : pct > 30 ? 'medium' : 'low'
  return { pct, barPct: Math.min(100, pct), status }
}

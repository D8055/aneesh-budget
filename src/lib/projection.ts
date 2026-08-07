export type PaceStatus = 'on-track' | 'at-risk' | 'over'

export interface Projection {
  spentCents: number
  incomeCents: number
  /** budget to compare against: manual override, else this month's income, else recent income average */
  budgetCents: number
  projectedCents: number
  daysElapsed: number
  daysInMonth: number
  status: PaceStatus
}

/** Pace-based month projection: spend so far, scaled to the full month.
 * on-track: projected <= budget. at-risk: projected over budget. over: already over budget today. */
export function projectMonth(
  spentCents: number,
  incomeCents: number,
  budgetOverrideCents: number | null,
  fallbackBudgetCents: number,
  today: Date,
): Projection {
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  const daysElapsed = today.getDate()
  const budgetCents = budgetOverrideCents ?? (incomeCents > 0 ? incomeCents : fallbackBudgetCents)
  const projectedCents = daysElapsed > 0 ? Math.round((spentCents / daysElapsed) * daysInMonth) : 0

  let status: PaceStatus = 'on-track'
  if (budgetCents > 0) {
    if (spentCents > budgetCents) status = 'over'
    else if (projectedCents > budgetCents) status = 'at-risk'
  }
  return { spentCents, incomeCents, budgetCents, projectedCents, daysElapsed, daysInMonth, status }
}

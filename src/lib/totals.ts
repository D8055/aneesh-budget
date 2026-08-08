import type { Transaction } from '../types'

export interface MonthTotals {
  /** expenses minus reimbursements, floored at zero */
  spentCents: number
  /** real income only — Transfers and Reimbursements excluded */
  incomeCents: number
  reimbursedCents: number
}

/** The one place net-spend math lives: reimbursements (friends paying you back)
 * offset spending instead of counting as income, and transfers count as neither. */
export function monthTotals(txs: Transaction[]): MonthTotals {
  let expenses = 0
  let income = 0
  let reimbursed = 0
  for (const t of txs) {
    if (t.category === 'Transfers') continue
    if (t.direction === 'expense') expenses += t.amountCents
    else if (t.category === 'Reimbursements') reimbursed += t.amountCents
    else income += t.amountCents
  }
  return { spentCents: Math.max(0, expenses - reimbursed), incomeCents: income, reimbursedCents: reimbursed }
}

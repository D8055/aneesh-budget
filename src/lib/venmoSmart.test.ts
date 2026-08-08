import { describe, it, expect } from 'vitest'
import { monthTotals } from './totals'
import { categorize, applyVenmoIncomeDefaults } from './categorize'
import { extractVenmoNote } from './email/venmoEmail'
import { CATEGORIES, CATEGORY_COLORS, type Transaction } from '../types'

const tx = (over: Partial<Transaction>): Transaction => ({
  date: '2026-08-05', amountCents: 1000, direction: 'expense', source: 'venmo-email',
  merchant: 'Venmo: Test', category: 'Miscellaneous', rawText: '', dedupeHash: Math.random().toString(),
  ...over,
})

describe('Reimbursements category exists', () => {
  it('is a built-in with a color', () => {
    expect(CATEGORIES).toContain('Reimbursements')
    expect(CATEGORY_COLORS['Reimbursements']).toBeTruthy()
  })
})

describe('monthTotals — reimbursements offset spending', () => {
  it('nets reimbursements out of spend, not into income', () => {
    const t = monthTotals([
      tx({ direction: 'expense', amountCents: 6000, category: 'Dining' }),
      tx({ direction: 'income', amountCents: 4500, category: 'Reimbursements' }),
      tx({ direction: 'income', amountCents: 185000, category: 'Income' }),
    ])
    expect(t.spentCents).toBe(1500)      // 60 − 45
    expect(t.incomeCents).toBe(185000)   // paycheck only
    expect(t.reimbursedCents).toBe(4500)
  })
  it('excludes Transfers from both sides and floors net spend at zero', () => {
    const t = monthTotals([
      tx({ direction: 'expense', amountCents: 2000, category: 'Transfers' }),
      tx({ direction: 'income', amountCents: 9000, category: 'Reimbursements' }),
      tx({ direction: 'expense', amountCents: 1000, category: 'Dining' }),
    ])
    expect(t.spentCents).toBe(0)         // 10 − 90, floored
    expect(t.incomeCents).toBe(0)
  })
})

describe('applyVenmoIncomeDefaults', () => {
  it('defaults incoming Venmo to Reimbursements with review', () => {
    const t = applyVenmoIncomeDefaults(tx({ direction: 'income', category: 'Income', merchant: 'Venmo: Jordan Lee' }), [])
    expect(t.category).toBe('Reimbursements')
    expect(t.needsReview).toBe(true)
  })
  it('lets a user person-rule win and clears review', () => {
    const rules = [{ pattern: 'venmo: maya singh', category: 'Income', priority: 10 }]
    const t = applyVenmoIncomeDefaults(
      tx({ direction: 'income', category: 'Income', merchant: 'Venmo: Maya Singh' }), rules)
    expect(t.category).toBe('Income')
    expect(t.needsReview).toBeFalsy()
  })
  it('leaves outgoing Venmo and non-Venmo income untouched', () => {
    const out = applyVenmoIncomeDefaults(tx({ direction: 'expense', category: 'Dining' }), [])
    expect(out.category).toBe('Dining')
    const payroll = applyVenmoIncomeDefaults(tx({ direction: 'income', category: 'Income', source: 'schwab-email', merchant: 'PAYROLL' }), [])
    expect(payroll.category).toBe('Income')
  })
})

describe('extractVenmoNote', () => {
  it('finds the note line in an email body', () => {
    const body = 'Venmo\nYou paid Priya Patel\n$18.50\ndinner 🍜\nPayment ID: 40216\nSee transaction'
    expect(extractVenmoNote(body)).toBe('dinner 🍜')
  })
  it('skips boilerplate-only bodies', () => {
    const body = 'Venmo\nYou paid Priya Patel\n$18.50\nPayment ID: 40216\nhttps://venmo.com/x\nUnsubscribe'
    expect(extractVenmoNote(body)).toBeUndefined()
  })
})

describe('emoji and note categorization for Venmo', () => {
  it('categorizes by emoji in the note', () => {
    expect(categorize('Venmo: Priya Patel', 'note: 🍕', 'expense', [])).toBe('Dining')
    expect(categorize('Venmo: Sam Chen', 'gas ⛽', 'expense', [])).toBe('Transport')
    expect(categorize('Venmo: Roommate', '🏠 august', 'expense', [])).toBe('Bills & Utilities')
    expect(categorize('Venmo: Jordan', 'tickets 🎬', 'expense', [])).toBe('Entertainment')
  })
  it('categorizes by note keywords through the existing word bank', () => {
    expect(categorize('Venmo: Sam Chen', 'groceries run', 'expense', [])).toBe('Groceries')
  })
})

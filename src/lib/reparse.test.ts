import { describe, it, expect } from 'vitest'
import { planReparseUpdate, reparseOne } from './reparse'
import { syntheticSender } from './email/providers'
import type { Transaction } from '../types'

const base: Transaction = {
  id: 1,
  date: '2026-08-05',
  amountCents: 25000,
  direction: 'income',
  source: 'schwab-email',
  provider: 'Schwab',
  merchant: 'Schwab deposit',
  category: 'Income',
  rawText: 'A deposit of $250.00 from your account ending in 134 was credited to your account.',
  dedupeHash: 'x',
}

describe('reparseOne', () => {
  it('re-runs the current parser over stored schwab raw text', () => {
    const parsed = reparseOne(base)!
    expect(parsed.merchant).toBe('Charles Schwab Checking')
    expect(parsed.accountLast4).toBe('134')
  })
  it('never re-parses venmo emails (their subject line is lost in rawText)', () => {
    expect(reparseOne({ ...base, source: 'venmo-email', rawText: 'You paid Priya Patel $18.50' })).toBeNull()
  })
  it('never re-parses CSV or manual rows', () => {
    expect(reparseOne({ ...base, source: 'schwab-csv' })).toBeNull()
    expect(reparseOne({ ...base, source: 'manual' })).toBeNull()
  })
})

describe('syntheticSender', () => {
  it('round-trips known provider names into recognizable senders', () => {
    expect(syntheticSender('Schwab')).toContain('schwab')
    expect(syntheticSender('Cash App')).toBe('alerts@cash.app')
    expect(syntheticSender('Fifth Third')).toBe('alerts@53.com')
  })
  it('falls back to a neutral sender for unknown providers', () => {
    expect(syntheticSender(undefined)).toBe('alerts@bank.example')
    expect(syntheticSender('Bank')).toBe('alerts@bank.example')
  })
})

describe('planReparseUpdate', () => {
  const parsed = reparseOne(base)

  it('upgrades a parser-junk title and records the new auto values', () => {
    const changes = planReparseUpdate(base, parsed, [])!
    expect(changes.merchant).toBe('Charles Schwab Checking')
    expect(changes.autoMerchant).toBe('Charles Schwab Checking')
    expect(changes.accountLast4).toBe('134')
    expect(changes.needsReview).toBe(false)
  })

  it('keeps a user-renamed title (autoMerchant provenance)', () => {
    const t = { ...base, merchant: 'Rent money from dad', autoMerchant: 'Schwab deposit' }
    const changes = planReparseUpdate(t, parsed, [])
    expect(changes?.merchant).toBeUndefined()
    // parser's current opinion is still recorded for future comparisons
    expect(changes?.autoMerchant).toBe('Charles Schwab Checking')
  })

  it('keeps a legacy title that is not recognizable parser junk', () => {
    const t = { ...base, merchant: 'Rent money from dad' }
    expect(planReparseUpdate(t, parsed, [])?.merchant).toBeUndefined()
  })

  it('updates the merchant when it still equals its recorded auto value', () => {
    const t = { ...base, merchant: 'Schwab deposit', autoMerchant: 'Schwab deposit' }
    expect(planReparseUpdate(t, parsed, [])?.merchant).toBe('Charles Schwab Checking')
  })

  it('keeps a user-set category (autoCategory provenance)', () => {
    const t = { ...base, category: 'Reimbursements', autoCategory: 'Income' }
    expect(planReparseUpdate(t, parsed, [])?.category).toBeUndefined()
  })

  it('keeps a legacy category that is not the uninformative default', () => {
    const t: Transaction = {
      ...base,
      direction: 'expense',
      category: 'Groceries',
      rawText: 'A card purchase of $250.00 was made at TRADER JOES 552.',
    }
    const p = reparseOne(t)
    expect(planReparseUpdate(t, p, [])?.category).toBeUndefined()
  })

  it('recategorizes when a junk title becomes a real merchant (legacy Miscellaneous default)', () => {
    const t: Transaction = {
      ...base,
      direction: 'expense',
      merchant: 'Schwab card purchase',
      category: 'Miscellaneous',
      rawText: 'A card purchase of $250.00 was made at TRADER JOES 552 on 08/05/2026.',
    }
    const p = reparseOne(t)!
    const changes = planReparseUpdate(t, p, [])!
    expect(changes.merchant).toContain('TRADER JOE')
    expect(changes.category).toBe('Groceries')
  })

  it('never touches notes', () => {
    const t = { ...base, note: 'for the deposit on the apartment' }
    const changes = planReparseUpdate(t, parsed, [])!
    expect('note' in changes).toBe(false)
  })

  it('skips the row entirely when the re-parse disagrees on amount', () => {
    expect(planReparseUpdate({ ...base, amountCents: 999 }, parsed, [])).toBeNull()
  })

  it('flips a parser-produced direction and flags the row for review', () => {
    const changes = planReparseUpdate({ ...base, direction: 'expense' }, parsed, [])!
    expect(changes.direction).toBe('income')
    expect(changes.needsReview).toBe(true)
  })

  it('keeps a user-flipped direction (autoDirection provenance)', () => {
    // parser said income, user flipped to expense — the row is untouchable
    expect(planReparseUpdate({ ...base, direction: 'expense', autoDirection: 'income' }, parsed, [])).toBeNull()
  })

  it('fixes received-Zelle rows that were imported as expenses', () => {
    const t: Transaction = {
      ...base,
      source: 'bank-email',
      provider: 'Zelle',
      direction: 'expense',
      merchant: 'Zelle: Jane Smith',
      category: 'Transfers',
      rawText: 'Jane Smith sent you money with Zelle® | Amount: $250.00 has been added to your account',
    }
    const p = reparseOne(t)!
    expect(p.direction).toBe('income')
    const changes = planReparseUpdate(t, p, [])!
    expect(changes.direction).toBe('income')
    expect(changes.needsReview).toBe(true)
  })

  it('returns null when nothing needs to change', () => {
    const t = {
      ...base,
      merchant: 'Charles Schwab Checking',
      autoMerchant: 'Charles Schwab Checking',
      category: 'Income',
      autoCategory: 'Income',
      autoDirection: 'income' as const,
      accountLast4: '134',
    }
    expect(planReparseUpdate(t, reparseOne(t), [])).toBeNull()
  })
})

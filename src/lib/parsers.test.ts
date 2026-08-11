import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseSchwabCsv } from './csv/schwab'
import { parseVenmoCsv } from './csv/venmo'
import { parseSchwabEmail } from './email/schwabEmail'
import { parseVenmoEmail } from './email/venmoEmail'
import { parseProviderEmail } from './email/providers'
import { categorize } from './categorize'
import { CATEGORIES } from '../types'
import { projectMonth } from './projection'
import { parseCents, isNegative, fmtCents } from './money'
import { dedupeHash } from './dedupe'

const fixture = (name: string) => readFileSync(join(__dirname, '..', '..', 'fixtures', name), 'utf-8')

describe('money', () => {
  it('parses dollar strings into cents', () => {
    expect(parseCents('$1,234.56')).toBe(123456)
    expect(parseCents('- $18.50')).toBe(1850)
    expect(parseCents('(45.00)')).toBe(4500)
    expect(parseCents('')).toBeNull()
    expect(parseCents('abc')).toBeNull()
  })
  it('detects negatives', () => {
    expect(isNegative('- $18.50')).toBe(true)
    expect(isNegative('+ $45.00')).toBe(false)
    expect(isNegative('(12.00)')).toBe(true)
  })
  it('formats cents', () => {
    expect(fmtCents(123456)).toBe('$1,234.56')
  })
})

describe('Schwab CSV', () => {
  const { txs, skipped } = parseSchwabCsv(fixture('schwab-sample.csv'))
  it('parses all rows', () => {
    expect(txs.length).toBe(17)
    expect(skipped).toBe(0)
  })
  it('reads amounts, dates, and directions', () => {
    const tj = txs.find(t => t.merchant.includes('TRADER JOE'))!
    expect(tj.amountCents).toBe(6247)
    expect(tj.direction).toBe('expense')
    expect(tj.date).toBe('2026-08-05')
    const payroll = txs.filter(t => t.merchant.includes('PAYROLL'))
    expect(payroll).toHaveLength(3)
    expect(payroll[0].direction).toBe('income')
    expect(payroll[0].amountCents).toBe(185000)
  })
})

describe('Venmo CSV', () => {
  const { txs } = parseVenmoCsv(fixture('venmo-sample.csv'))
  it('skips the preamble and parses all payment rows', () => {
    expect(txs.length).toBe(6)
  })
  it('gets direction from the amount sign and counterparty from from/to', () => {
    const dinner = txs.find(t => t.rawText.includes('dinner split'))!
    expect(dinner.direction).toBe('expense')
    expect(dinner.amountCents).toBe(1850)
    expect(dinner.merchant).toBe('Venmo: Priya Patel')
    const tickets = txs.find(t => t.rawText.includes('concert tickets'))!
    expect(tickets.direction).toBe('income')
    expect(tickets.merchant).toBe('Venmo: Jordan Lee')
  })
})

describe('Schwab email parser', () => {
  it('parses a card purchase alert', () => {
    const tx = parseSchwabEmail({
      subject: 'Your card was used',
      body: 'A card purchase of $23.87 was made at CHIPOTLE 1178 on 08/06/2026. If you do not recognize this transaction, contact us.',
      receivedDate: '2026-08-06',
    })!
    expect(tx.amountCents).toBe(2387)
    expect(tx.direction).toBe('expense')
    expect(tx.merchant).toContain('CHIPOTLE')
    expect(tx.date).toBe('2026-08-06')
  })
  it('parses a deposit alert as income', () => {
    const tx = parseSchwabEmail({
      subject: 'Deposit alert',
      body: 'A deposit of $1,850.00 from PAYROLL ACME CORP was credited to your account.',
      receivedDate: '2026-08-03',
    })!
    expect(tx.direction).toBe('income')
    expect(tx.amountCents).toBe(185000)
  })
  it('returns null when there is no amount', () => {
    expect(parseSchwabEmail({ subject: 'Statement ready', body: 'Your statement is available.', receivedDate: '2026-08-01' })).toBeNull()
  })
  it('titles a "from account ending 134" alert with the account name, not the digits', () => {
    const tx = parseSchwabEmail({
      subject: 'Transfer alert',
      body: 'A deposit of $500.00 from your account ending in 134 was credited to your account.',
      receivedDate: '2026-08-08',
    })!
    expect(tx.merchant).toBe('Charles Schwab Checking')
    expect(tx.needsReview).toBeFalsy()
  })
  it('keeps a real payee name even when the account digits appear too', () => {
    const tx = parseSchwabEmail({
      subject: 'Deposit alert',
      body: 'A deposit from PAYROLL ACME CORP was credited to your account ending in 134. Amount: $1,850.00',
      receivedDate: '2026-08-03',
    })!
    expect(tx.merchant).toContain('PAYROLL ACME CORP')
  })
})

describe('account-titled provider emails', () => {
  it('extracts the 3-digit ending and titles the transaction via parseProviderEmail', () => {
    const tx = parseProviderEmail('Charles Schwab <donotreply@alerts.schwab.com>', {
      subject: 'Transfer alert',
      body: 'A deposit of $250.00 from your account ending in 134 was credited to your account on 08/05/2026.',
      receivedDate: '2026-08-05',
    })!
    expect(tx.merchant).toBe('Charles Schwab Checking')
    expect(tx.accountLast4).toBe('134')
    expect(tx.provider).toBe('Schwab')
    expect(tx.date).toBe('2026-08-05')
  })
  it('leaves unknown accounts titled as before', () => {
    const tx = parseProviderEmail('Charles Schwab <donotreply@alerts.schwab.com>', {
      subject: 'Deposit alert',
      body: 'A deposit of $99.00 was credited to your account ending in 555.',
      receivedDate: '2026-08-05',
    })!
    expect(tx.merchant).toBe('Schwab deposit')
    expect(tx.accountLast4).toBe('555')
  })
})

describe('Venmo email parser', () => {
  it('parses "You paid" as expense', () => {
    const tx = parseVenmoEmail({
      subject: 'You paid Priya Patel $18.50',
      body: 'Payment note: dinner split',
      receivedDate: '2026-08-06',
    })!
    expect(tx.direction).toBe('expense')
    expect(tx.amountCents).toBe(1850)
    expect(tx.merchant).toBe('Venmo: Priya Patel')
  })
  it('parses "paid you" as income', () => {
    const tx = parseVenmoEmail({
      subject: 'Jordan Lee paid you',
      body: 'Jordan Lee paid you $45.00 — concert tickets',
      receivedDate: '2026-08-05',
    })!
    expect(tx.direction).toBe('income')
    expect(tx.amountCents).toBe(4500)
    expect(tx.merchant).toBe('Venmo: Jordan Lee')
  })
  it('parses a completed charge request as expense', () => {
    const tx = parseVenmoEmail({
      subject: "You completed Sam Chen's $32.75 charge request",
      body: 'groceries run',
      receivedDate: '2026-08-03',
    })!
    expect(tx.direction).toBe('expense')
    expect(tx.merchant).toBe('Venmo: Sam Chen')
  })
})

describe('categorizer', () => {
  it('applies default keyword rules', () => {
    expect(categorize("TRADER JOE'S #552", '', 'expense', [])).toBe('Groceries')
    expect(categorize('NETFLIX.COM', '', 'expense', [])).toBe('Entertainment')
    expect(categorize('SHELL OIL 5744', '', 'expense', [])).toBe('Transport')
    expect(categorize('PAYROLL ACME CORP DIRECT DEP', '', 'income', [])).toBe('Income')
  })
  it('falls back by direction, with Miscellaneous for unknown expenses', () => {
    expect(categorize('MYSTERY VENDOR', '', 'expense', [])).toBe('Miscellaneous')
    expect(categorize('MYSTERY SENDER', '', 'income', [])).toBe('Income')
  })
  it('has no Other category', () => {
    expect(CATEGORIES).not.toContain('Other')
  })
  it('lets user rules beat defaults', () => {
    const rules = [{ pattern: 'trader joe', category: 'Dining', priority: 10 }]
    expect(categorize("TRADER JOE'S #552", '', 'expense', rules)).toBe('Dining')
  })
})

describe('projection', () => {
  it('scales month-to-date spend to the full month', () => {
    const p = projectMonth(50000, 200000, null, 0, new Date(2026, 7, 10)) // Aug 10, spent $500
    expect(p.daysInMonth).toBe(31)
    expect(p.projectedCents).toBe(155000) // 500/10*31
    expect(p.status).toBe('on-track')
  })
  it('flags pacing to overspend', () => {
    const p = projectMonth(150000, 200000, null, 0, new Date(2026, 7, 10)) // $1500 by day 10 vs $2000 income
    expect(p.status).toBe('at-risk')
  })
  it('flags already over budget', () => {
    const p = projectMonth(250000, 200000, null, 0, new Date(2026, 7, 20))
    expect(p.status).toBe('over')
  })
  it('prefers the manual budget override', () => {
    const p = projectMonth(100000, 200000, 300000, 0, new Date(2026, 7, 15))
    expect(p.budgetCents).toBe(300000)
  })
})

describe('dedupe', () => {
  it('collapses the CSV row and matching email into one hash', () => {
    const a = dedupeHash('2026-08-05', 6247, "TRADER JOE'S #552 SAN JOSE CA", 'expense')
    const b = dedupeHash('2026-08-05', 6247, "TRADER JOE'S #55", 'expense')
    expect(a).toBe(b)
  })
  it('keeps different transactions apart', () => {
    const a = dedupeHash('2026-08-05', 6247, 'TRADER JOES', 'expense')
    const b = dedupeHash('2026-08-05', 6247, 'SAFEWAY', 'expense')
    expect(a).not.toBe(b)
  })
})

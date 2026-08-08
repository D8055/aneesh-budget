import { describe, it, expect } from 'vitest'
import { parseProviderEmail } from './email/providers'
import { categorize } from './categorize'

const email = (subject: string, body: string, receivedDate = '2026-08-06') => ({ subject, body, receivedDate })

describe('threshold amounts are never mistaken for transaction amounts', () => {
  it('parses the real amount from a Wells Fargo threshold alert', () => {
    const tx = parseProviderEmail('Wells Fargo <alerts@notify.wellsfargo.com>',
      email('Card purchase exceeded your alert amount',
        'You asked us to notify you when a purchase over $1.00 posts. Amount: $45.23 Where: STARBUCKS STORE 5723 SEATTLE WA Card ending in 1234'))!
    expect(tx.amountCents).toBe(4523)
    expect(tx.merchant).toContain('STARBUCKS')
  })
  it('handles threshold phrasing without labeled fields', () => {
    const tx = parseProviderEmail('Chase <no.reply.alerts@chase.com>',
      email('Transaction alert',
        'A charge of $89.10 at WHOLE FOODS MKT was made, which is more than the $5.00 alert limit you set.'))!
    expect(tx.amountCents).toBe(8910)
    expect(tx.merchant).toContain('WHOLE FOODS')
  })
})

describe('labeled fields beat positional guessing', () => {
  it('uses Amount:/Where: fields common in bank alert tables', () => {
    const tx = parseProviderEmail('Wells Fargo <alerts@notify.wellsfargo.com>',
      email('Debit card purchase', 'Amount: $12.75 Where: SHELL OIL 57444 Date: 08/06/2026 Card ending in 9876'))!
    expect(tx.amountCents).toBe(1275)
    expect(tx.merchant).toContain('SHELL OIL')
    expect(tx.needsReview).toBeFalsy()
  })
  it('uses Merchant: label', () => {
    const tx = parseProviderEmail('Citi <alerts@citi.com>',
      email('Purchase notification', 'A transaction was made. Merchant: TRADER JOES 552 Amount: $62.47'))!
    expect(tx.merchant).toContain('TRADER JOE')
    expect(tx.amountCents).toBe(6247)
  })
})

describe('credit card payments become Transfers (no double counting)', () => {
  it('categorizes the checking-side payment as Transfers', () => {
    expect(categorize('CHASE CREDIT CRD AUTOPAY', '', 'expense', [])).toBe('Transfers')
    expect(categorize('ONLINE PAYMENT THANK YOU', '', 'expense', [])).toBe('Transfers')
    expect(categorize('CREDIT CARD PAYMENT', '', 'expense', [])).toBe('Transfers')
  })
  it('categorizes the card-side received payment as Transfers, not Income', () => {
    expect(categorize('Payment Received - Thank You', '', 'income', [])).toBe('Transfers')
    expect(categorize('THANK YOU FOR YOUR PAYMENT', '', 'income', [])).toBe('Transfers')
  })
  it('does not misfire on ordinary merchants', () => {
    expect(categorize('AUTOZONE #1234', '', 'expense', [])).not.toBe('Transfers')
  })
})

describe('account separation from "ending in NNNN"', () => {
  it('extracts the card last-4', () => {
    const tx = parseProviderEmail('Wells Fargo <alerts@notify.wellsfargo.com>',
      email('Debit card purchase', 'Amount: $12.75 Where: SHELL OIL Card ending in 9876'))!
    expect(tx.accountLast4).toBe('9876')
  })
  it('extracts account ending patterns with asterisks', () => {
    const tx = parseProviderEmail('Ally Bank <no.reply@ally.com>',
      email('Deposit posted', 'A deposit of $500.00 from ACME CORP has posted to your account ending in ***4321.'))!
    expect(tx.accountLast4).toBe('4321')
  })
  it('leaves accountLast4 undefined when absent', () => {
    const tx = parseProviderEmail('Zelle <no-reply@zellepay.com>',
      email('Jane Smith sent you $25.00', 'Jane Smith sent you $25.00 with Zelle.'))!
    expect(tx.accountLast4).toBeUndefined()
  })
})

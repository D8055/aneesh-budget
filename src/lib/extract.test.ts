import { describe, it, expect } from 'vitest'
import { parseProviderEmail } from './email/providers'
import { extractAccountLast4 } from './email/extract'
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
  it('stays fast on real-world HTML-stripped bodies (no catastrophic backtracking)', () => {
    // HTML emails stripped to text leave long whitespace runs right after words
    // like "account" — the regex must not freeze the UI thread on them.
    const chunk = `your account   ${'\n \t '.repeat(400)}  has updates. card ${' '.repeat(900)} benefits!`
    const body = chunk.repeat(30) + ' card ending in 1234'
    const start = performance.now()
    const result = extractAccountLast4(body)
    const elapsed = performance.now() - start
    expect(result).toBe('1234')
    expect(elapsed).toBeLessThan(250)
  })
  it('leaves accountLast4 undefined when absent', () => {
    const tx = parseProviderEmail('Zelle <no-reply@zellepay.com>',
      email('Jane Smith sent you $25.00', 'Jane Smith sent you $25.00 with Zelle.'))!
    expect(tx.accountLast4).toBeUndefined()
  })

  // --- format variants -------------------------------------------------
  it('matches "card ending in 1234"', () => {
    expect(extractAccountLast4('Your card ending in 1234 was used.')).toBe('1234')
  })
  it('matches "account ending 1234" (no "in")', () => {
    expect(extractAccountLast4('Your account ending 1234 was debited.')).toBe('1234')
  })
  it('matches "card ending in ...1234"', () => {
    expect(extractAccountLast4('Your card ending in ...1234 was used.')).toBe('1234')
  })
  it('matches "card x1234"', () => {
    expect(extractAccountLast4('Purchase on card x1234 approved.')).toBe('1234')
  })
  it('matches "acct x-1234"', () => {
    expect(extractAccountLast4('Debit from acct x-1234 posted.')).toBe('1234')
  })
  it('matches "card X1234" (uppercase X)', () => {
    expect(extractAccountLast4('Card X1234 transaction alert')).toBe('1234')
  })
  it('matches "card ****1234"', () => {
    expect(extractAccountLast4('Card ****1234 was charged.')).toBe('1234')
  })
  it('matches "account *1234"', () => {
    expect(extractAccountLast4('Account *1234 balance update')).toBe('1234')
  })
  it('matches "acct ...1234"', () => {
    expect(extractAccountLast4('Transfer from acct ...1234 completed.')).toBe('1234')
  })
  it('matches "Card ending: 1234" label style', () => {
    expect(extractAccountLast4('Amount: $10.00 Card ending: 1234')).toBe('1234')
  })
  it('matches "account number ending in 1234"', () => {
    expect(extractAccountLast4('Your account number ending in 1234 was credited.')).toBe('1234')
  })
  it('matches 3-digit endings like Schwab checking ("account ending in 134")', () => {
    expect(extractAccountLast4('Your account ending in 134 was debited.')).toBe('134')
  })
  it('captures all four digits when four are shown', () => {
    expect(extractAccountLast4('Your account ending in 0134 was debited.')).toBe('0134')
  })

  // --- never match years or amounts ------------------------------------
  it('does not match a bare year', () => {
    expect(extractAccountLast4('Your 2026 annual statement is ready.')).toBeUndefined()
  })
  it('does not match a dollar amount with no card/account keyword', () => {
    expect(extractAccountLast4('A charge of $1234.56 was posted on 08/06/2026.')).toBeUndefined()
  })
  it('does not match an amount that merely follows the word card at a distance', () => {
    expect(extractAccountLast4('Your card was used for a purchase of 1234.56 dollars.')).toBeUndefined()
  })
  it('does not match a year even when an account keyword is far away', () => {
    expect(extractAccountLast4('Your account summary for the year 2026 is attached.')).toBeUndefined()
  })
  it('still finds the real last-4 in text that also contains a year', () => {
    expect(extractAccountLast4('Statement dated 08/06/2026 for card ending in 4444')).toBe('4444')
  })

  // --- multi-account preference ----------------------------------------
  const twoAccounts = 'You made a payment from your account ending in 1234 to your card ending in 5678.'
  it('prefers the card mention when prefer="card"', () => {
    expect(extractAccountLast4(twoAccounts, 'card')).toBe('5678')
  })
  it('prefers the account mention when prefer="account"', () => {
    expect(extractAccountLast4(twoAccounts, 'account')).toBe('1234')
  })
  it('returns the sole mention regardless of preference', () => {
    expect(extractAccountLast4('Purchase on card ending in 9999', 'account')).toBe('9999')
    expect(extractAccountLast4('Deposit to account ending in 9999', 'card')).toBe('9999')
  })
  it('treats "crd" as card-like for preference', () => {
    expect(extractAccountLast4('From acct x-1111 to crd x2222', 'card')).toBe('2222')
    expect(extractAccountLast4('From acct x-1111 to crd x2222', 'account')).toBe('1111')
  })
  it('returns the first mention when no preference is given', () => {
    expect(extractAccountLast4(twoAccounts)).toBe('1234')
  })
  it('returns undefined with no mention at all', () => {
    expect(extractAccountLast4('Thanks for banking with us.')).toBeUndefined()
    expect(extractAccountLast4('Thanks for banking with us.', 'card')).toBeUndefined()
  })

  // --- provider wiring --------------------------------------------------
  it('attributes a card payment to the card, not the funding checking account', () => {
    const tx = parseProviderEmail('Chase <no.reply.alerts@chase.com>',
      email('Payment posted',
        'You made a payment of $250.00 from your account ending in 1234 to your card ending in 5678.'))!
    expect(tx.direction).toBe('expense')
    expect(tx.accountLast4).toBe('5678')
  })
  it('attributes an income deposit to the account', () => {
    const tx = parseProviderEmail('Ally Bank <no.reply@ally.com>',
      email('Deposit posted',
        'A deposit of $500.00 from ACME CORP has posted to your account ending in ***4321. Ref acct ...8888.'))!
    expect(tx.direction).toBe('income')
    expect(tx.accountLast4).toBe('4321')
  })
  it('picks the card last-4 for an expense that lists the account first', () => {
    const tx = parseProviderEmail('Wells Fargo <alerts@notify.wellsfargo.com>',
      email('Debit card purchase',
        'Amount: $12.75 Where: SHELL OIL Funding account x-1111 Card ending: 9876'))!
    expect(tx.direction).toBe('expense')
    expect(tx.accountLast4).toBe('9876')
  })
})

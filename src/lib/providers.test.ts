import { describe, it, expect } from 'vitest'
import { parseProviderEmail, KNOWN_SENDER_DOMAINS } from './email/providers'
import { parseGenericCsv } from './csv/generic'

const email = (subject: string, body: string, receivedDate = '2026-08-06') => ({ subject, body, receivedDate })

describe('provider email parsing', () => {
  it('parses a Chase card transaction alert', () => {
    const tx = parseProviderEmail('Chase <no.reply.alerts@chase.com>',
      email('Your $23.45 transaction with STARBUCKS', 'You made a $23.45 transaction with STARBUCKS on Aug 5, 2026 with your credit card ending in 1234.'))!
    expect(tx.amountCents).toBe(2345)
    expect(tx.direction).toBe('expense')
    expect(tx.merchant).toContain('STARBUCKS')
    expect(tx.provider).toBe('Chase')
    expect(tx.source).toBe('bank-email')
  })

  it('parses a Bank of America purchase alert', () => {
    const tx = parseProviderEmail('Bank of America <onlinebanking@ealerts.bankofamerica.com>',
      email('Credit card transaction alert', 'A purchase of $45.67 at TARGET STORE 123 on 08/05/2026 exceeded the alert limit you set.'))!
    expect(tx.amountCents).toBe(4567)
    expect(tx.direction).toBe('expense')
    expect(tx.merchant).toContain('TARGET')
    expect(tx.provider).toBe('Bank of America')
  })

  it('parses Zelle received and sent', () => {
    const got = parseProviderEmail('Zelle <no-reply@zellepay.com>',
      email('Jane Smith sent you $25.00', 'Jane Smith sent you $25.00 with Zelle.'))!
    expect(got.direction).toBe('income')
    expect(got.amountCents).toBe(2500)
    expect(got.merchant).toBe('Zelle: Jane Smith')

    const sent = parseProviderEmail('Zelle <no-reply@zellepay.com>',
      email('You sent $30.00 to Bob Jones', 'Your Zelle payment to Bob Jones was sent.'))!
    expect(sent.direction).toBe('expense')
    expect(sent.amountCents).toBe(3000)
    expect(sent.merchant).toBe('Zelle: Bob Jones')
  })

  it('parses Cash App payments both directions', () => {
    const got = parseProviderEmail('Cash App <cash@square.com>',
      email('Maya sent you $15.00', 'Maya sent you $15.00 for lunch'))!
    expect(got.direction).toBe('income')
    expect(got.merchant).toBe('Cash App: Maya')

    const sent = parseProviderEmail('Cash App <cash@cash.app>',
      email('You paid Jordan $20.00', 'Payment to Jordan'))!
    expect(sent.direction).toBe('expense')
    expect(sent.amountCents).toBe(2000)
    expect(sent.merchant).toBe('Cash App: Jordan')
  })

  it('parses PayPal payments both directions', () => {
    const sent = parseProviderEmail('PayPal <service@paypal.com>',
      email('You sent $12.34 USD to John Doe', "You've sent $12.34 USD to John Doe"))!
    expect(sent.direction).toBe('expense')
    expect(sent.amountCents).toBe(1234)
    expect(sent.merchant).toBe('PayPal: John Doe')

    const got = parseProviderEmail('PayPal <service@paypal.com>',
      email('John Doe sent you $50.00 USD', 'John Doe sent you $50.00 USD'))!
    expect(got.direction).toBe('income')
    expect(got.merchant).toBe('PayPal: John Doe')
  })

  it('falls back to a generic bank parser for other banks', () => {
    const tx = parseProviderEmail('Wells Fargo <alerts@notify.wellsfargo.com>',
      email('Card purchase alert', 'A purchase of $78.90 was made at BEST BUY on 08/06/2026 with your card ending in 5678.'))!
    expect(tx.amountCents).toBe(7890)
    expect(tx.direction).toBe('expense')
    expect(tx.merchant).toContain('BEST BUY')
    expect(tx.provider).toBe('Wells Fargo')
  })

  it('recognizes generic deposits as income', () => {
    const tx = parseProviderEmail('Ally Bank <no.reply@ally.com>',
      email('Deposit posted', 'A direct deposit of $1,234.56 from ACME PAYROLL has posted to your account.'))!
    expect(tx.direction).toBe('income')
    expect(tx.amountCents).toBe(123456)
  })

  it('still routes Venmo and Schwab to their dedicated parsers', () => {
    const v = parseProviderEmail('Venmo <venmo@venmo.com>', email('You paid Priya Patel $18.50', ''))!
    expect(v.source).toBe('venmo-email')
    const s = parseProviderEmail('Charles Schwab <donotreply@alerts.schwab.com>',
      email('Your card was used', 'A card purchase of $23.87 was made at CHIPOTLE 1178 on 08/06/2026.'))!
    expect(s.source).toBe('schwab-email')
  })

  it('returns null for unrecognizable emails instead of guessing', () => {
    expect(parseProviderEmail('Chase <news@chase.com>', email('Rates are changing', 'Read about our new offerings.'))).toBeNull()
  })

  it('exports a sender-domain list that covers the majors', () => {
    for (const d of ['chase.com', 'bankofamerica.com', 'wellsfargo.com', 'capitalone.com', 'zellepay.com', 'cash.app', 'paypal.com', 'venmo.com', 'schwab.com']) {
      expect(KNOWN_SENDER_DOMAINS.some(k => k.includes(d))).toBe(true)
    }
  })
})

describe('generic bank CSV', () => {
  it('handles a signed single amount column (Chase style)', () => {
    const csv = 'Transaction Date,Post Date,Description,Category,Type,Amount\n08/05/2026,08/06/2026,STARBUCKS STORE 123,Food & Drink,Sale,-6.75\n08/03/2026,08/04/2026,PAYROLL DEPOSIT,,Payment,1850.00'
    const { txs } = parseGenericCsv(csv, 'Chase')
    expect(txs).toHaveLength(2)
    expect(txs[0].direction).toBe('expense')
    expect(txs[0].amountCents).toBe(675)
    expect(txs[0].date).toBe('2026-08-05')
    expect(txs[0].merchant).toBe('STARBUCKS STORE 123')
    expect(txs[1].direction).toBe('income')
  })

  it('handles separate debit/credit columns', () => {
    const csv = 'Date,Description,Debit,Credit,Balance\n2026-08-05,GROCERY OUTLET,42.10,,1000.00\n2026-08-03,DIRECT DEPOSIT,,900.00,1042.10'
    const { txs } = parseGenericCsv(csv, 'My Bank')
    expect(txs).toHaveLength(2)
    expect(txs[0].direction).toBe('expense')
    expect(txs[0].amountCents).toBe(4210)
    expect(txs[1].direction).toBe('income')
    expect(txs[1].amountCents).toBe(90000)
  })

  it('skips junk rows and reports them', () => {
    const csv = 'Date,Description,Amount\nnot-a-date,???,abc\n08/01/2026,COFFEE SHOP,-4.50'
    const { txs, skipped } = parseGenericCsv(csv, 'X')
    expect(txs).toHaveLength(1)
    expect(skipped).toBe(1)
  })
})

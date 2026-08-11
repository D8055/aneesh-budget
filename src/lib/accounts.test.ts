import { describe, it, expect } from 'vitest'
import { accountNickname, isAccountReference, applyAccountTitle, accountLabel } from './accounts'
import type { Card } from '../types'

describe('account nicknames', () => {
  it('resolves the Schwab checking ending', () => {
    expect(accountNickname('134')).toBe('Charles Schwab Checking')
  })
  it('ignores leading zeros', () => {
    expect(accountNickname('0134')).toBe('Charles Schwab Checking')
  })
  it('does not fire on other accounts that merely end with the same digits', () => {
    expect(accountNickname('2134')).toBeUndefined()
    expect(accountNickname('4321')).toBeUndefined()
    expect(accountNickname(undefined)).toBeUndefined()
  })
})

describe('isAccountReference', () => {
  it('recognizes account self-references', () => {
    expect(isAccountReference('your account ending in 134')).toBe(true)
    expect(isAccountReference('account ending in ***4321')).toBe(true)
    expect(isAccountReference('acct x-1234')).toBe(true)
    expect(isAccountReference('Account number 9876')).toBe(true)
  })
  it('leaves real merchants alone', () => {
    expect(isAccountReference('Account Services Inc 1234')).toBe(false)
    expect(isAccountReference('STARBUCKS STORE 5723')).toBe(false)
    expect(isAccountReference('PAYROLL ACME CORP')).toBe(false)
  })
})

describe('applyAccountTitle', () => {
  it('replaces an account-reference title with the friendly name', () => {
    expect(applyAccountTitle('your account ending in 134', '134', '', false)).toBe('Charles Schwab Checking')
  })
  it('upgrades a generic fallback when the email says "from … account"', () => {
    expect(applyAccountTitle('Schwab deposit', '134', 'A deposit of $500.00 from your account ending in 134 was credited.', true))
      .toBe('Charles Schwab Checking')
  })
  it('keeps a real payee even when the account is known', () => {
    expect(applyAccountTitle('PAYROLL ACME CORP', '134', 'deposit from PAYROLL ACME CORP to account ending in 134', false))
      .toBe('PAYROLL ACME CORP')
  })
  it('does nothing for unknown accounts', () => {
    expect(applyAccountTitle('your account ending in 555', '555', '', false)).toBe('your account ending in 555')
  })
})

describe('accountLabel', () => {
  const card = (name: string, last4: string): Card => ({ name, last4, limitCents: 0, balanceCents: 0 })
  it('prefers a user-renamed card', () => {
    expect(accountLabel('Schwab', '134', [card('My checking', '134')])).toBe('My checking')
  })
  it('ignores auto-generated card names and falls back to the nickname', () => {
    expect(accountLabel('Schwab', '134', [card('Schwab •134', '134')])).toBe('Charles Schwab Checking')
  })
  it('falls back to "Provider •digits" for unknown accounts', () => {
    expect(accountLabel('Chase', '5678', [])).toBe('Chase •5678')
    expect(accountLabel(undefined, '5678', [])).toBe('•5678')
  })
})

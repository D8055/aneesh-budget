import type { Card } from '../types'

/** Friendly names for known accounts, keyed by the trailing digits alert emails
 * print ("account ending in 134"). Keys match exactly, ignoring leading zeros,
 * so "0134" and "134" resolve to the same account. */
export const ACCOUNT_NICKNAMES: Record<string, string> = {
  '134': 'Charles Schwab Checking',
}

const stripZeros = (digits: string) => digits.replace(/^0+/, '')

export function accountNickname(digits?: string): string | undefined {
  if (!digits) return undefined
  for (const [suffix, name] of Object.entries(ACCOUNT_NICKNAMES)) {
    if (stripZeros(digits) === stripZeros(suffix)) return name
  }
  return undefined
}

/** True when a parsed "merchant" is really a reference to one of the user's own
 * accounts ("your account ending in 134", "acct x134") rather than a payee. */
export function isAccountReference(merchant: string): boolean {
  return /^(?:your\s+|the\s+)?acc(?:oun)?t\b(?:\s*(?:number|no\.?|ending|end|in|with)\b|[\s.:#*x•-])*\d{3,4}$/i.test(merchant.trim())
}

/** Generic titles the parsers fall back to when no payee could be extracted
 * ("Schwab deposit", "Chase transaction"). These may be upgraded to an account name. */
export function isGenericFallbackTitle(merchant: string): boolean {
  return /^[A-Za-z. ]*(?:deposit|card purchase|transaction)$/i.test(merchant.trim())
}

/** Title a transaction by its account's friendly name when the parsed title is
 * just an account reference, or when nothing better was found and the email uses
 * account-to-account phrasing ("transfer from your account ending in 134"). */
export function applyAccountTitle(merchant: string, digits: string | undefined, rawText: string, isFallback: boolean): string {
  const nickname = accountNickname(digits)
  if (!nickname) return merchant
  if (isAccountReference(merchant)) return nickname
  if (isFallback && /\bfrom\b[^.!?]{0,60}?\bacc(?:oun)?t\b/i.test(rawText)) return nickname
  return merchant
}

/** Display label for an account: a user-renamed card beats the built-in nickname,
 * which beats the raw "Provider •134" form. Auto-registered cards keep their
 * generated "… •134" name until renamed, so they don't count as user names. */
export function accountLabel(provider: string | undefined, digits: string, cards: Card[]): string {
  const card = cards.find(c => c.last4 === digits)
  if (card && !/•\d{3,4}$/.test(card.name)) return card.name
  return accountNickname(digits) ?? (provider ? `${provider} •${digits}` : `•${digits}`)
}

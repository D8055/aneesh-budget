/** Shared extraction helpers used by every provider parser. */

/** Remove alert-threshold phrases ("purchases over $1.00", "more than the $5.00 alert limit")
 * so threshold dollar values can never be mistaken for the transaction amount. */
export function stripThresholds(text: string): string {
  return text
    .replace(/(?:over|exceed(?:s|ed|ing)?|more than|at least|greater than|above)\s+(?:the\s+|your\s+)?\$\s?[\d,]+\.?\d*(?:\s+(?:alert\s+)?(?:amount|limit|threshold)(?:\s+you\s+set)?)?/gi, '')
    .replace(/(?:alert\s+(?:amount|limit|threshold)|limit|threshold)\s+of\s+\$\s?[\d,]+\.?\d*/gi, '')
}

/** Amount from a labeled field ("Amount: $45.23", "Total: 12.75"), preferred over positional amounts. */
export function extractLabeledAmount(text: string): number | null {
  const m = text.match(/(?:transaction amount|payment amount|amount|total)\s*:\s*\$?\s?([\d,]+\.\d{2})/i)
  if (!m) return null
  const cents = Math.round(Number(m[1].replace(/,/g, '')) * 100)
  return Number.isFinite(cents) && cents > 0 ? cents : null
}

const NEXT_LABEL = '(?:date|time|when|amount|total|card|account|available|balance|category|status|reference)'

/** Merchant from a labeled field ("Where: STARBUCKS 5723", "Merchant: TRADER JOES"). */
export function extractLabeledMerchant(text: string): string | null {
  const re = new RegExp(`(?:where|merchant|location|payee|vendor|description)\\s*:\\s*(.{2,60}?)(?=\\s+${NEXT_LABEL}\\b\\s*:?|\\s+(?:card|account)\\s+ending|[.\\n]|$)`, 'i')
  const m = text.match(re)
  const merchant = m?.[1].trim()
  return merchant && merchant.length >= 2 ? merchant : null
}

/** card/crd (card-like) or account/acct (account-like), then a SHORT bounded gap,
 * then three or four digits that are not part of a longer number (Schwab checking
 * alerts print only three: "account ending in 134"). The gap is a single
 * lazy wildcard — deliberately unambiguous, because a multi-group whitespace pattern
 * here caused catastrophic backtracking on HTML-stripped email bodies (long
 * whitespace runs after the word "account" froze the UI thread). Gap content is
 * validated separately with plain string ops. */
const LAST4_RE = /\b(cards?|crds?|accounts?|acct)\b(.{0,24}?)(\d{3,4})(?!\d)/gi

/** True when the keyword→digits gap contains only connective filler
 * ("number", "ending in", masking chars) — not arbitrary sentence text. */
function isFillerGap(gap: string): boolean {
  return gap.replace(/\b(?:number|no|ending|end|in|with)\b/gi, '').replace(/[\s.:#*x•-]/gi, '') === ''
}

type Last4Mention = { kind: 'card' | 'account'; last4: string }

function findLast4Mentions(text: string): Last4Mention[] {
  const collapsed = text.replace(/\s+/g, ' ')
  const mentions: Last4Mention[] = []
  for (const m of collapsed.matchAll(LAST4_RE)) {
    if (!isFillerGap(m[2])) continue
    mentions.push({ kind: /^(?:card|crd)/i.test(m[1]) ? 'card' : 'account', last4: m[3] })
  }
  return mentions
}

/** Card/account trailing digits from "card ending in 1234", "account ending in ***4321",
 * "card x1234", "acct x-1234", "Card ending: 1234", "account *1234", "acct ...1234",
 * and three-digit endings like Schwab checking's "account ending in 134".
 *
 * Payment/transfer alerts name two accounts ("from your account ending in 1234 to your
 * card ending in 5678"); `prefer` picks the right side so a card payment is not attributed
 * to the funding checking account. With a single mention the preference is ignored. */
export function extractAccountLast4(text: string, prefer?: 'card' | 'account'): string | undefined {
  const mentions = findLast4Mentions(text)
  if (mentions.length === 0) return undefined
  if (mentions.length === 1 || !prefer) return mentions[0].last4
  return (mentions.find(m => m.kind === prefer) ?? mentions[0]).last4
}

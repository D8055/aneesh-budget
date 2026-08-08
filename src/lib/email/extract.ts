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

/** Longest run of filler allowed between the card/account keyword and the digits.
 * Keeps 4-digit years and amounts elsewhere in the email from being mistaken for a last-4. */
const MAX_KEYWORD_GAP = 20

/** card/crd (card-like) or account/acct (account-like), then optional
 * "number"/"ending"/"in" filler and masking punctuation (":", "#", "*", "x", "-", "."),
 * then exactly four digits that are not part of a longer number. */
const LAST4_RE =
  /\b(cards?|crds?|accounts?|acct\.?)((?:\s*(?:number|no\.?|#)?\s*(?:ending|end)?\s*(?:in|with)?\s*[-:#*x•.\s]{0,10}))(\d{4})(?!\d)/gi

type Last4Mention = { kind: 'card' | 'account'; last4: string }

function findLast4Mentions(text: string): Last4Mention[] {
  const mentions: Last4Mention[] = []
  for (const m of text.matchAll(LAST4_RE)) {
    if (m[2].length > MAX_KEYWORD_GAP) continue
    mentions.push({ kind: /^(?:card|crd)/i.test(m[1]) ? 'card' : 'account', last4: m[3] })
  }
  return mentions
}

/** Card/account last-4 from "card ending in 1234", "account ending in ***4321",
 * "card x1234", "acct x-1234", "Card ending: 1234", "account *1234", "acct ...1234".
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

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

/** Card/account last-4 from "card ending in 1234", "account ending in ***4321", etc. */
export function extractAccountLast4(text: string): string | undefined {
  const m = text.match(/(?:card|account)(?:\s+number)?\s+ending(?:\s+in)?\s*[:#\s*x•.]*(\d{4})/i)
  return m ? m[1] : undefined
}

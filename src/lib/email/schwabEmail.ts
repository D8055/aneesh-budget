import type { Transaction } from '../../types'
import { parseCents } from '../money'
import { dedupeHash } from '../dedupe'
import { applyAccountTitle } from '../accounts'
import { extractAccountLast4 } from './extract'

export interface EmailInput {
  subject: string
  body: string
  /** ISO date the email arrived, used when the body has no date */
  receivedDate: string
}

/** Parse a Charles Schwab transaction-alert email. Formats drift, so this looks for
 * an amount plus merchant phrasing anywhere in subject/body and returns null when
 * nothing recognizable is found (caller routes those to Needs Review). */
export function parseSchwabEmail(email: EmailInput): Omit<Transaction, 'category'> | null {
  const text = `${email.subject}\n${email.body}`.replace(/\s+/g, ' ')

  const amountMatch = text.match(/\$\s?([\d,]+\.?\d{0,2})/)
  if (!amountMatch) return null
  const cents = parseCents(amountMatch[0])
  if (cents === null || cents === 0) return null

  // "at MERCHANT" / "to MERCHANT" / "from MERCHANT" — stop at sentence-ish boundaries
  const merchantMatch =
    text.match(/(?:card purchase|debit card transaction|purchase)[^.$]*?(?:at|to)\s+([^.,\n]{2,60}?)(?:\s+on\s|\s+was\s|[.,]|$)/i) ??
    text.match(/\bat\s+([A-Z0-9][^.,\n]{2,60}?)(?:\s+on\s|\s+was\s|[.,]|$)/) ??
    text.match(/\b(?:deposit|credit)\s+from\s+([^.,\n]{2,60}?)(?:\s+on\s|[.,]|$)/i)

  const isIncome = /\b(deposit|credit to your account|refund)\b/i.test(text) && !/card purchase|debit/i.test(text)
  const direction = isIncome ? 'income' as const : 'expense' as const
  const parsed = merchantMatch ? merchantMatch[1].trim() : (isIncome ? 'Schwab deposit' : 'Schwab card purchase')

  // "from your account ending in 134" alerts get the account's friendly name as
  // the title instead of the raw digits or a generic fallback.
  const digits = extractAccountLast4(text, isIncome ? 'account' : 'card')
  const merchant = applyAccountTitle(parsed, digits, text, !merchantMatch)

  const dateMatch = text.match(/\bon\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  const date = dateMatch
    ? `${dateMatch[3]}-${dateMatch[1].padStart(2, '0')}-${dateMatch[2].padStart(2, '0')}`
    : email.receivedDate

  return {
    date,
    amountCents: cents,
    direction,
    source: 'schwab-email',
    merchant,
    rawText: text.slice(0, 500),
    dedupeHash: dedupeHash(date, cents, merchant, direction),
    needsReview: !merchantMatch && merchant === parsed,
  }
}

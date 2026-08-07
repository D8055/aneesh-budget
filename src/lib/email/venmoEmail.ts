import type { Transaction } from '../../types'
import { parseCents } from '../money'
import { dedupeHash } from '../dedupe'
import type { EmailInput } from './schwabEmail'

/** Parse a Venmo notification email. Subjects look like:
 *  "You paid Priya Patel $18.50"           -> expense
 *  "Aneesh Rao paid you $25.00"            -> income  (subject may omit amount; body has it)
 *  "You completed Jordan Lee's $12.00 charge request" -> expense
 * Returns null when nothing recognizable is found. */
export function parseVenmoEmail(email: EmailInput): Omit<Transaction, 'category'> | null {
  const subject = email.subject.replace(/\s+/g, ' ').trim()
  const text = `${subject}\n${email.body}`.replace(/\s+/g, ' ')

  const amountMatch = text.match(/\$\s?([\d,]+\.\d{2})/)
  if (!amountMatch) return null
  const cents = parseCents(amountMatch[0])
  if (cents === null || cents === 0) return null

  let direction: 'income' | 'expense' | null = null
  let counterparty = ''

  let m = subject.match(/^You paid (.+?)(?:\s+\$[\d,.]+)?$/i)
  if (m) { direction = 'expense'; counterparty = m[1] }

  if (!direction) {
    m = subject.match(/^(.+?) paid you(?:\s+\$[\d,.]+)?$/i)
    if (m) { direction = 'income'; counterparty = m[1] }
  }

  if (!direction) {
    m = subject.match(/^You completed (.+?)['’]s .*charge request/i)
    if (m) { direction = 'expense'; counterparty = m[1] }
  }

  if (!direction) {
    // Fallback to body phrasing
    if (/you paid/i.test(text)) { direction = 'expense' }
    else if (/paid you/i.test(text)) { direction = 'income' }
    else return null
  }

  const merchant = counterparty ? `Venmo: ${counterparty.trim()}` : 'Venmo'
  const date = email.receivedDate

  return {
    date,
    amountCents: cents,
    direction,
    source: 'venmo-email',
    merchant,
    rawText: text.slice(0, 500),
    dedupeHash: dedupeHash(date, cents, merchant, direction),
    needsReview: !counterparty,
  }
}

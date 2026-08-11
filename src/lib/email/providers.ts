import type { Transaction } from '../../types'
import { parseCents } from '../money'
import { dedupeHash } from '../dedupe'
import { parseSchwabEmail, type EmailInput } from './schwabEmail'
import { parseVenmoEmail } from './venmoEmail'
import { stripThresholds, extractLabeledAmount, extractLabeledMerchant, extractAccountLast4 } from './extract'
import { applyAccountTitle } from '../accounts'

export type ParsedTx = Omit<Transaction, 'category'>

/** Sender domains the Gmail sync watches. Order doesn't matter. */
export const KNOWN_SENDER_DOMAINS = [
  'venmo.com',
  'schwab.com', 'alerts.schwab.com',
  'chase.com', 'alertsp.chase.com',
  'bankofamerica.com', 'ealerts.bankofamerica.com',
  'wellsfargo.com', 'notify.wellsfargo.com',
  'citi.com', 'citibank.com',
  'capitalone.com', 'notification.capitalone.com',
  'discover.com',
  'americanexpress.com', 'welcome.aexp.com',
  'usbank.com', 'pnc.com', 'ally.com', 'sofi.com',
  'truist.com', 'td.com', 'tdbank.com', '53.com', 'regions.com', 'citizensbank.com',
  'key.com', 'huntington.com', 'navyfederal.org', 'usaa.com', 'chime.com',
  'synchronybank.com', 'barclaycardus.com', 'marcus.com',
  'zellepay.com', 'zelle.com',
  'cash.app', 'square.com',
  'paypal.com',
]

const PROVIDER_NAMES: [pattern: string, name: string][] = [
  ['venmo', 'Venmo'],
  ['schwab', 'Schwab'],
  ['chase', 'Chase'],
  ['bankofamerica', 'Bank of America'],
  ['wellsfargo', 'Wells Fargo'],
  ['citi', 'Citi'],
  ['capitalone', 'Capital One'],
  ['discover', 'Discover'],
  ['americanexpress', 'American Express'],
  ['aexp', 'American Express'],
  ['usbank', 'U.S. Bank'],
  ['pnc', 'PNC'],
  ['ally.com', 'Ally'],
  ['sofi', 'SoFi'],
  ['truist', 'Truist'],
  ['tdbank', 'TD Bank'],
  ['td.com', 'TD Bank'],
  ['53.com', 'Fifth Third'],
  ['regions', 'Regions'],
  ['citizensbank', 'Citizens'],
  ['key.com', 'KeyBank'],
  ['huntington', 'Huntington'],
  ['navyfederal', 'Navy Federal'],
  ['usaa', 'USAA'],
  ['chime', 'Chime'],
  ['synchrony', 'Synchrony'],
  ['barclay', 'Barclays'],
  ['marcus', 'Marcus'],
  ['zelle', 'Zelle'],
  ['cash.app', 'Cash App'],
  ['square', 'Cash App'],
  ['paypal', 'PayPal'],
]

function providerFor(from: string): string {
  const lower = from.toLowerCase()
  for (const [pattern, name] of PROVIDER_NAMES) if (lower.includes(pattern)) return name
  const m = lower.match(/@([a-z0-9.-]+)/)
  return m ? m[1] : 'Bank'
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

/** Find "on 08/05/2026" or "on Aug 5, 2026" in text; ISO date or null. */
function extractDate(text: string): string | null {
  let m = text.match(/\bon\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  m = text.match(/\bon\s+([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/)
  if (m) {
    const month = MONTHS[m[1].slice(0, 3).toLowerCase()]
    if (month) return `${m[3]}-${month}-${m[2].padStart(2, '0')}`
  }
  return null
}

/** Person-to-person phrasing shared by Zelle, Cash App, PayPal, and bank-embedded Zelle. */
function parseP2P(text: string, provider: string): { cents: number; direction: 'income' | 'expense'; name: string } | null {
  let m = text.match(/^(.{2,60}?) sent you \$\s?([\d,]+\.?\d{0,2})/i) ?? text.match(/\b([A-Z][^.,\n$]{1,50}?) sent you \$\s?([\d,]+\.?\d{0,2})/)
  if (m) {
    const cents = parseCents(`$${m[2]}`)
    if (cents) return { cents, direction: 'income', name: m[1].trim() }
  }
  m = text.match(/You sent \$\s?([\d,]+\.?\d{0,2})(?:\s?USD)? to (.{2,60}?)(?: with|[.,\n]|$)/i)
  if (m) {
    const cents = parseCents(`$${m[1]}`)
    if (cents) return { cents, direction: 'expense', name: m[2].trim() }
  }
  m = text.match(/You paid (.{2,60}?) \$\s?([\d,]+\.?\d{0,2})/i)
  if (m) {
    const cents = parseCents(`$${m[2]}`)
    if (cents) return { cents, direction: 'expense', name: m[1].trim() }
  }
  void provider
  return null
}

/** Generic bank-alert phrasing: card purchases, charges, deposits.
 * Threshold phrases are stripped first so "purchases over $1.00" never becomes the amount;
 * labeled fields (Amount:, Where:, Merchant:) win over positional guessing. */
function parseBankText(rawText: string): { cents: number; direction: 'income' | 'expense'; merchant: string | null } | null {
  const text = stripThresholds(rawText)
  const labeledCents = extractLabeledAmount(text)

  // A labeled Amount: field is itself a strong transaction signal (some alerts are pure field tables)
  const signal = /purchase|transaction|charge|debit|withdrawal|deposit|credited|posted|payment/i
  if (!signal.test(rawText) && labeledCents === null) return null

  const cents = labeledCents ?? (() => {
    const amountMatch = text.match(/\$\s?([\d,]+\.?\d{0,2})/)
    return amountMatch ? parseCents(amountMatch[0]) : null
  })()
  if (!cents) return null

  const isIncome = /\b(deposit|credited|payment received|refund)\b/i.test(text) && !/\b(purchase|card|charge)\b/i.test(text)

  const merchantMatch = isIncome
    ? text.match(/\bfrom\s+([^.,\n$]{2,60}?)(?:\s+has\s|\s+was\s|\s+on\s|[.,\n]|$)/i)
    : text.match(/(?:transaction with|purchase (?:of \$[\d,.]+\s)?(?:was made )?at|charged? at|\bat)\s+([A-Z0-9][^.,\n$]{1,60}?)(?:\s+on\s|\s+exceeded\s|\s+was\s|\s+with\s|\s+which\s|[.,\n]|$)/) ??
      text.match(/transaction with\s+(?!your\b)([^.,\n$]{2,60}?)(?:\s+on\s|[.,\n]|$)/i)

  const merchant = extractLabeledMerchant(text) ?? (merchantMatch ? merchantMatch[1].trim() : null)

  return { cents, direction: isIncome ? 'income' : 'expense', merchant }
}

/** Route an email from a known financial sender to the right parser.
 * Returns null when nothing transaction-like can be extracted (marketing, statements, etc). */
export function parseProviderEmail(from: string, mail: EmailInput): ParsedTx | null {
  const provider = providerFor(from)
  const allText = `${mail.subject} ${mail.body}`
  /** Expenses hit the card, income lands in the account — matters only when an email
   * names both ("from your account ending in 1234 to your card ending in 5678"). */
  const last4For = (direction: 'income' | 'expense') =>
    extractAccountLast4(allText, direction === 'income' ? 'account' : 'card')

  if (provider === 'Venmo') {
    const tx = parseVenmoEmail(mail)
    return tx ? { ...tx, provider, accountLast4: extractAccountLast4(allText) } : null
  }
  if (provider === 'Schwab') {
    const tx = parseSchwabEmail(mail)
    return tx ? { ...tx, provider, accountLast4: last4For(tx.direction) } : null
  }

  const segments = [mail.subject.replace(/\s+/g, ' ').trim(), mail.body.replace(/\s+/g, ' ').trim()]

  // P2P phrasing first (Zelle/Cash App/PayPal, and Zelle inside bank emails)
  for (const seg of segments) {
    const p2p = parseP2P(seg, provider)
    if (p2p) {
      const date = extractDate(segments.join(' ')) ?? mail.receivedDate
      const merchant = `${provider}: ${p2p.name}`
      return {
        date,
        amountCents: p2p.cents,
        direction: p2p.direction,
        source: 'bank-email',
        provider,
        accountLast4: last4For(p2p.direction),
        merchant,
        rawText: segments.join(' | ').slice(0, 500),
        dedupeHash: dedupeHash(date, p2p.cents, merchant, p2p.direction),
      }
    }
  }

  // Bank purchase/deposit phrasing
  for (const seg of segments) {
    const bank = parseBankText(seg)
    if (bank) {
      const date = extractDate(segments.join(' ')) ?? mail.receivedDate
      const last4 = last4For(bank.direction)
      const fallback = `${provider} transaction`
      const merchant = applyAccountTitle(bank.merchant ?? fallback, last4, allText, !bank.merchant)
      return {
        date,
        amountCents: bank.cents,
        direction: bank.direction,
        source: 'bank-email',
        provider,
        accountLast4: last4,
        merchant,
        rawText: segments.join(' | ').slice(0, 500),
        dedupeHash: dedupeHash(date, bank.cents, merchant, bank.direction),
        needsReview: !bank.merchant && merchant === fallback,
      }
    }
  }

  return null
}

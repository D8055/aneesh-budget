import Papa from 'papaparse'
import type { Transaction } from '../../types'
import { parseCents, isNegative } from '../money'
import { dedupeHash } from '../dedupe'

/** Parse a Venmo statement CSV. Venmo exports have preamble lines before the real
 * header row, so we locate the row containing "Datetime" and "Amount (total)" first.
 * Money out is "- $12.34", money in is "+ $12.34". */
export function parseVenmoCsv(csvText: string): { txs: Omit<Transaction, 'category'>[]; skipped: number } {
  const lines = csvText.split(/\r?\n/)
  const headerIdx = lines.findIndex(l => l.includes('Datetime') && l.includes('Amount (total)'))
  if (headerIdx === -1) return { txs: [], skipped: lines.filter(l => l.trim()).length }
  const body = lines.slice(headerIdx).join('\n')

  const parsed = Papa.parse<Record<string, string>>(body, { header: true, skipEmptyLines: true })
  const txs: Omit<Transaction, 'category'>[] = []
  let skipped = 0
  for (const row of parsed.data) {
    const datetime = (row['Datetime'] ?? '').trim()
    const amountRaw = (row['Amount (total)'] ?? '').trim()
    const type = (row['Type'] ?? '').trim()
    const note = (row['Note'] ?? '').trim()
    const from = (row['From'] ?? '').trim()
    const to = (row['To'] ?? '').trim()
    const date = datetime.slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !amountRaw) { skipped++; continue }
    const cents = parseCents(amountRaw)
    if (cents === null || cents === 0) { skipped++; continue }
    const direction = isNegative(amountRaw) ? 'expense' as const : 'income' as const
    const counterparty = direction === 'expense' ? to : from
    const merchant = counterparty ? `Venmo: ${counterparty}` : `Venmo ${type}`
    txs.push({
      date,
      amountCents: cents,
      direction,
      source: 'venmo-csv',
      merchant,
      rawText: `${type} | ${note} | ${from} -> ${to} | ${amountRaw}`,
      dedupeHash: dedupeHash(date, cents, merchant, direction),
    })
  }
  return { txs, skipped }
}

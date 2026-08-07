import Papa from 'papaparse'
import type { Transaction } from '../../types'
import { parseCents } from '../money'
import { dedupeHash } from '../dedupe'

/** Convert MM/DD/YYYY to YYYY-MM-DD. Returns null if unrecognized. */
export function usDateToISO(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
}

/** Parse a Charles Schwab checking/debit statement CSV export.
 * Expected columns (case-insensitive, extra columns ignored):
 * Date, Type, Description, Withdrawal, Deposit  — amounts like "$12.34". */
export function parseSchwabCsv(csvText: string): { txs: Omit<Transaction, 'category'>[]; skipped: number } {
  const parsed = Papa.parse<Record<string, string>>(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: h => h.trim().toLowerCase().replace(/\s*\(.*\)/, ''),
  })
  const txs: Omit<Transaction, 'category'>[] = []
  let skipped = 0
  for (const row of parsed.data) {
    const date = usDateToISO(row['date'] ?? '')
    const description = (row['description'] ?? '').trim()
    const withdrawal = (row['withdrawal'] ?? '').trim()
    const deposit = (row['deposit'] ?? '').trim()
    if (!date || !description) { skipped++; continue }
    const isExpense = withdrawal !== ''
    const cents = parseCents(isExpense ? withdrawal : deposit)
    if (cents === null || cents === 0) { skipped++; continue }
    const direction = isExpense ? 'expense' as const : 'income' as const
    txs.push({
      date,
      amountCents: cents,
      direction,
      source: 'schwab-csv',
      merchant: description,
      rawText: Object.values(row).join(' | '),
      dedupeHash: dedupeHash(date, cents, description, direction),
    })
  }
  return { txs, skipped }
}

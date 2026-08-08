import Papa from 'papaparse'
import type { Transaction } from '../../types'
import { parseCents, isNegative } from '../money'
import { dedupeHash } from '../dedupe'

function toISO(raw: string): string | null {
  const t = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10)
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  return null
}

/** Parse any bank/card CSV export by auto-detecting the date, description, and amount columns.
 * Supports one signed amount column (negative = money out) or separate debit/credit columns. */
export function parseGenericCsv(csvText: string, provider: string): { txs: Omit<Transaction, 'category'>[]; skipped: number } {
  const lines = csvText.split(/\r?\n/)
  const headerIdx = lines.findIndex(l => /date/i.test(l) && /(amount|debit|credit|withdrawal|deposit)/i.test(l))
  if (headerIdx === -1) return { txs: [], skipped: lines.filter(l => l.trim()).length }

  const parsed = Papa.parse<Record<string, string>>(lines.slice(headerIdx).join('\n'), {
    header: true,
    skipEmptyLines: true,
    transformHeader: h => h.trim().toLowerCase(),
  })
  const headers = parsed.meta.fields ?? []
  const dateCol = headers.find(h => /^(transaction |posting |post )?date$/.test(h)) ?? headers.find(h => h.includes('date'))
  const descCol = headers.find(h => /desc|payee|merchant|memo|name|detail/.test(h))
  const amountCol = headers.find(h => /^amount/.test(h))
  const debitCol = headers.find(h => /debit|withdrawal/.test(h))
  const creditCol = headers.find(h => /credit|deposit/.test(h))

  const txs: Omit<Transaction, 'category'>[] = []
  let skipped = 0
  for (const row of parsed.data) {
    const date = dateCol ? toISO(row[dateCol] ?? '') : null
    const merchant = (descCol ? row[descCol] : '')?.trim() || ''
    if (!date || !merchant) { skipped++; continue }

    let cents: number | null = null
    let direction: 'income' | 'expense' | null = null
    if (amountCol && (row[amountCol] ?? '').trim() !== '') {
      const raw = row[amountCol].trim()
      cents = parseCents(raw)
      direction = isNegative(raw) ? 'expense' : 'income'
    } else if (debitCol && (row[debitCol] ?? '').trim() !== '') {
      cents = parseCents(row[debitCol])
      direction = 'expense'
    } else if (creditCol && (row[creditCol] ?? '').trim() !== '') {
      cents = parseCents(row[creditCol])
      direction = 'income'
    }
    if (cents === null || cents === 0 || !direction) { skipped++; continue }

    txs.push({
      date,
      amountCents: cents,
      direction,
      source: 'bank-csv',
      provider,
      merchant,
      rawText: Object.values(row).join(' | ').slice(0, 300),
      dedupeHash: dedupeHash(date, cents, merchant, direction),
    })
  }
  return { txs, skipped }
}

import Dexie, { type Table } from 'dexie'
import type { Transaction, Rule, Settings, Card, CustomCategory } from './types'
import { CATEGORIES } from './types'
import { accountNickname, applyAccountTitle, isGenericFallbackTitle } from './lib/accounts'
import { extractAccountLast4 } from './lib/email/extract'
import { dedupeHash } from './lib/dedupe'

export class BudgetDB extends Dexie {
  transactions!: Table<Transaction, number>
  rules!: Table<Rule, number>
  settings!: Table<Settings, string>
  cards!: Table<Card, number>
  customCategories!: Table<CustomCategory, number>

  constructor() {
    super('aneesh-budget')
    this.version(1).stores({
      transactions: '++id, date, category, direction, source, &dedupeHash',
      rules: '++id, priority',
      settings: 'key',
    })
    this.version(2).stores({
      transactions: '++id, date, category, direction, source, &dedupeHash',
      rules: '++id, priority',
      settings: 'key',
      cards: '++id',
      customCategories: '++id, &name',
    })
    // "Other" was retired in favor of Miscellaneous
    this.version(3).upgrade(async tx => {
      await tx.table('transactions').where('category').equals('Other').modify({ category: 'Miscellaneous' })
      await tx.table('rules').filter(r => r.category === 'Other').modify({ category: 'Miscellaneous' })
    })
    // Older parsers missed 3-digit account endings ("account ending in 134") and
    // titled those alerts with the raw account reference or a generic fallback.
    // Backfill the digits, apply friendly account names, and refresh dedupe
    // hashes so future email re-scans match the renamed rows instead of
    // re-importing them.
    this.version(4).upgrade(async tx => {
      const table = tx.table('transactions')
      const all: Transaction[] = await table.toArray()
      const hashes = new Set(all.map(t => t.dedupeHash))
      for (const t of all) {
        const changes: Partial<Transaction> = {}
        const digits = t.accountLast4 ?? extractAccountLast4(t.rawText ?? '', t.direction === 'income' ? 'account' : 'card')
        if (digits && digits !== t.accountLast4) changes.accountLast4 = digits
        const titled = applyAccountTitle(t.merchant, digits, t.rawText ?? '', isGenericFallbackTitle(t.merchant))
        if (titled !== t.merchant) {
          changes.merchant = titled
          if (t.needsReview) changes.needsReview = false
          // dedupeHash is a unique index; on the rare collision keep the old hash
          const newHash = dedupeHash(t.date, t.amountCents, titled, t.direction)
          if (!hashes.has(newHash)) {
            changes.dedupeHash = newHash
            hashes.add(newHash)
          }
        }
        if (Object.keys(changes).length > 0) await table.update(t.id!, changes)
      }
      await tx.table('cards').toCollection().modify(card => {
        const nickname = card.last4 ? accountNickname(card.last4) : undefined
        if (nickname && /•\d{3,4}$/.test(card.name)) {
          card.name = nickname
          if (/checking|savings/i.test(nickname)) card.kind = 'debit'
        }
      })
    })
  }
}

/** Delete everything: transactions, rules, cards, categories, and settings. */
export async function eraseAllData(): Promise<void> {
  await Promise.all([
    db.transactions.clear(),
    db.rules.clear(),
    db.cards.clear(),
    db.customCategories.clear(),
    db.settings.clear(),
  ])
}

/** Built-in categories plus any the user has created (customs shadowed by a
 * later-added built-in of the same name are dropped). */
export async function getAllCategoryNames(): Promise<string[]> {
  const custom = await db.customCategories.toArray()
  const builtIns = new Set<string>(CATEGORIES)
  return [...CATEGORIES, ...custom.map(c => c.name).filter(n => !builtIns.has(n))]
}

export const db = new BudgetDB()

export async function getSetting(key: string): Promise<string | undefined> {
  return (await db.settings.get(key))?.value
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.settings.put({ key, value })
}

/** Insert transactions, silently skipping any whose dedupeHash already exists. Returns count added. */
export async function addTransactions(txs: Transaction[]): Promise<number> {
  let added = 0
  await db.transaction('rw', db.transactions, async () => {
    for (const tx of txs) {
      const existing = await db.transactions.where('dedupeHash').equals(tx.dedupeHash).first()
      if (!existing) {
        await db.transactions.add(tx)
        added++
      }
    }
  })
  return added
}

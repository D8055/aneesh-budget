import Dexie, { type Table } from 'dexie'
import type { Transaction, Rule, Settings, Card, CustomCategory } from './types'
import { CATEGORIES } from './types'

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

/** Built-in categories plus any the user has created. */
export async function getAllCategoryNames(): Promise<string[]> {
  const custom = await db.customCategories.toArray()
  return [...CATEGORIES, ...custom.map(c => c.name)]
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

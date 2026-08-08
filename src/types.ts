export type Direction = 'income' | 'expense'

export type Source = 'schwab-csv' | 'venmo-csv' | 'schwab-email' | 'venmo-email' | 'bank-csv' | 'bank-email' | 'manual'

export interface Transaction {
  id?: number
  /** ISO date, local: YYYY-MM-DD */
  date: string
  /** integer cents, always positive; direction carries the sign */
  amountCents: number
  direction: Direction
  source: Source
  merchant: string
  category: string
  /** which institution this came from, e.g. "Chase", "Zelle" (shown in the transaction list) */
  provider?: string
  /** last 4 digits of the card/account the alert mentioned, for separating accounts */
  accountLast4?: string
  /** user-written note */
  note?: string
  /** original row/email text for reference and re-parsing */
  rawText: string
  /** hash of date+amount+merchant used to prevent double counting */
  dedupeHash: string
  needsReview?: boolean
}

export interface Rule {
  id?: number
  /** lowercase substring matched against merchant + raw text */
  pattern: string
  category: string
  /** lower runs first; user rules run before defaults */
  priority: number
}

export interface Settings {
  key: string
  value: string
}

export const CATEGORIES = [
  'Groceries',
  'Dining',
  'Entertainment',
  'Transport',
  'Shopping',
  'Bills & Utilities',
  'Health',
  'Travel',
  'Transfers',
  'Income',
  'Miscellaneous',
] as const

export type Category = (typeof CATEGORIES)[number]

export const CATEGORY_COLORS: Record<string, { bg: string; ink: string }> = {
  Groceries: { bg: '#BFE8D4', ink: '#22664A' },
  Dining: { bg: '#F9D5B8', ink: '#8A5220' },
  Entertainment: { bg: '#CDC7F2', ink: '#48408F' },
  Transport: { bg: '#BFDCF4', ink: '#2E5E8C' },
  Shopping: { bg: '#F4C9DC', ink: '#8F3D63' },
  'Bills & Utilities': { bg: '#FBE7A1', ink: '#7A5A0B' },
  Health: { bg: '#C9EDE8', ink: '#22685F' },
  Travel: { bg: '#C7E3F2', ink: '#2C5E7E' },
  Transfers: { bg: '#E3E5EC', ink: '#565B6B' },
  Income: { bg: '#A9DFC3', ink: '#1D5E41' },
  Miscellaneous: { bg: '#DCE8C9', ink: '#55663A' },
}

export interface Card {
  id?: number
  name: string
  /** credit or debit; treated as 'credit' when absent (pre-existing records) */
  kind?: 'credit' | 'debit'
  /** last 4 digits, set for cards auto-detected from alert emails */
  last4?: string
  /** credit limit in integer cents; 0 = not set yet */
  limitCents: number
  /** current balance in integer cents, entered/updated by the user */
  balanceCents: number
}

export interface CustomCategory {
  id?: number
  name: string
}

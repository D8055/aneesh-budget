import type { Rule } from '../types'

/** Built-in keyword rules, applied after user rules. Patterns are lowercase substrings. */
export const DEFAULT_RULES: Omit<Rule, 'id'>[] = [
  // Groceries
  ...['trader joe', 'whole foods', 'safeway', 'kroger', 'costco', 'aldi', 'sprouts', 'grocery', 'market', 'h mart', 'ralphs', 'vons', 'wegmans', 'publix'].map(p => ({ pattern: p, category: 'Groceries', priority: 100 })),
  // Dining
  ...['chipotle', 'mcdonald', 'starbucks', 'doordash', 'ubereats', 'uber eats', 'grubhub', 'restaurant', 'pizza', 'sushi', 'taco', 'cafe', 'coffee', 'chick-fil-a', 'panda express', 'in-n-out', 'subway', 'wingstop', 'dining', 'boba', 'tea house', 'ramen', 'kbbq', 'bbq', 'burger', 'deli', 'bakery', 'donut', 'ice cream', 'lunch', 'dinner', 'food'].map(p => ({ pattern: p, category: 'Dining', priority: 110 })),
  // Entertainment
  ...['netflix', 'spotify', 'hulu', 'disney', 'hbo', 'max.com', 'steam', 'playstation', 'xbox', 'nintendo', 'amc', 'cinema', 'movie', 'concert', 'ticketmaster', 'stubhub', 'twitch', 'youtube premium', 'crunchyroll', 'game'].map(p => ({ pattern: p, category: 'Entertainment', priority: 120 })),
  // Transport
  ...['uber', 'lyft', 'shell', 'chevron', 'exxon', 'mobil', 'arco', '76 ', 'gas', 'fuel', 'parking', 'metro', 'transit', 'bart', 'caltrain', 'toll', 'valero'].map(p => ({ pattern: p, category: 'Transport', priority: 130 })),
  // Shopping
  ...['amazon', 'target', 'walmart', 'best buy', 'nike', 'adidas', 'zara', 'uniqlo', 'h&m', 'sephora', 'ulta', 'etsy', 'ebay', 'shein', 'temu', 'apple.com', 'apple store'].map(p => ({ pattern: p, category: 'Shopping', priority: 140 })),
  // Bills & Utilities
  ...['at&t', 'verizon', 't-mobile', 'comcast', 'xfinity', 'spectrum', 'pg&e', 'edison', 'water', 'electric', 'internet', 'insurance', 'rent', 'utility', 'utilities', 'phone bill'].map(p => ({ pattern: p, category: 'Bills & Utilities', priority: 150 })),
  // Health
  ...['cvs', 'walgreens', 'pharmacy', 'doctor', 'dental', 'medical', 'gym', 'fitness', '24 hour', 'planet fitness', 'urgent care', 'clinic', 'kaiser'].map(p => ({ pattern: p, category: 'Health', priority: 160 })),
  // Transfers
  ...['transfer', 'zelle', 'atm', 'withdrawal', 'cash app', 'wire'].map(p => ({ pattern: p, category: 'Transfers', priority: 170 })),
  // Income
  ...['payroll', 'direct dep', 'deposit', 'salary', 'paycheck', 'interest paid', 'refund', 'cashback', 'reimburse'].map(p => ({ pattern: p, category: 'Income', priority: 180 })),
]

/** Pick a category for a transaction. User rules (priority < 100) win over defaults. */
export function categorize(
  merchant: string,
  rawText: string,
  direction: 'income' | 'expense',
  userRules: Rule[],
): string {
  const haystack = `${merchant} ${rawText}`.toLowerCase()
  const all = [...userRules, ...DEFAULT_RULES].sort((a, b) => a.priority - b.priority)
  for (const rule of all) {
    if (rule.pattern && haystack.includes(rule.pattern.toLowerCase())) return rule.category
  }
  return direction === 'income' ? 'Income' : 'Miscellaneous'
}

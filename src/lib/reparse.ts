import type { Transaction, Rule } from '../types'
import { db, getSetting, setSetting } from '../db'
import { parseProviderEmail, syntheticSender, type ParsedTx } from './email/providers'
import { isAccountReference, isGenericFallbackTitle } from './accounts'
import { categorize, applyVenmoIncomeDefaults } from './categorize'
import { dedupeHash } from './dedupe'

/** Bump whenever the email scraping/titling logic changes. On the next app
 * start every already-imported email transaction is re-run through the new
 * parser, upgrading parser-produced fields while leaving user edits alone. */
export const PARSER_VERSION = '3'

/** Sources safe to re-parse from rawText. Venmo emails are excluded: their
 * parser is anchored to the original subject line, which rawText does not
 * preserve as a separate field, so a re-parse would only degrade them. */
const EMAIL_SOURCES: Transaction['source'][] = ['schwab-email', 'bank-email']

/** Re-run the CURRENT parser over a stored email transaction's raw text. */
export function reparseOne(t: Transaction): ParsedTx | null {
  if (!EMAIL_SOURCES.includes(t.source) || !t.rawText) return null
  const provider = t.provider ?? (t.source === 'schwab-email' ? 'Schwab' : undefined)
  return parseProviderEmail(syntheticSender(provider), { subject: '', body: t.rawText, receivedDate: t.date })
}

/** The category the import pipeline would assign this transaction today. */
function autoCategoryFor(t: Transaction, merchant: string, rules: Rule[]): string {
  const base = categorize(merchant, t.rawText, t.direction, rules)
  return applyVenmoIncomeDefaults({ ...t, merchant, category: base }, rules).category
}

/** Decide what a re-parse may change on a stored transaction. Pure; unit tested.
 *
 * User edits are sacred: a merchant/category differing from its recorded auto
 * value was set by the user and is kept. Rows from before auto values were
 * recorded only get their title upgraded when the current one is clearly
 * parser-produced junk (an account self-reference or a generic fallback), and
 * their category only when it is still the uninformative expense default.
 * Notes are never touched. A re-parse that disagrees on amount read the email
 * differently than the import did — skip the row entirely.
 *
 * Direction is upgradeable: a stored direction the user never flipped is
 * parser-produced, so when the current parser reads the opposite sign (received
 * Zelle money used to import as an expense) the new read wins — flagged for a
 * one-tap review since it changes money math. A user-flipped direction (one that
 * differs from its recorded autoDirection) is sacred; skip the row, because every
 * other decision here keys off direction. */
export function planReparseUpdate(t: Transaction, parsed: ParsedTx | null, rules: Rule[]): Partial<Transaction> | null {
  if (!parsed) return null
  if (parsed.amountCents !== t.amountCents) return null

  const directionIsAuto = t.autoDirection === undefined || t.direction === t.autoDirection
  const flipsDirection = parsed.direction !== t.direction
  if (flipsDirection && !directionIsAuto) return null

  const changes: Partial<Transaction> = {}
  if (flipsDirection) changes.direction = parsed.direction
  if (t.autoDirection !== parsed.direction) changes.autoDirection = parsed.direction

  const merchantIsAuto = t.autoMerchant !== undefined
    ? t.merchant === t.autoMerchant
    : isAccountReference(t.merchant) || isGenericFallbackTitle(t.merchant)
  if (merchantIsAuto && parsed.merchant !== t.merchant) {
    changes.merchant = parsed.merchant
    changes.needsReview = !!parsed.needsReview
  }
  if (t.autoMerchant !== parsed.merchant) changes.autoMerchant = parsed.merchant

  const autoCat = autoCategoryFor({ ...t, direction: parsed.direction }, parsed.merchant, rules)
  const categoryIsAuto = t.autoCategory !== undefined
    ? t.category === t.autoCategory
    : t.direction === 'expense' && t.category === 'Miscellaneous'
  if (categoryIsAuto && autoCat !== t.category) changes.category = autoCat
  if (t.autoCategory !== autoCat) changes.autoCategory = autoCat

  if (parsed.accountLast4 && parsed.accountLast4 !== t.accountLast4) changes.accountLast4 = parsed.accountLast4

  // A flipped sign changes totals — always surface it, even if the merchant kept its title.
  if (flipsDirection) changes.needsReview = true

  return Object.keys(changes).length > 0 ? changes : null
}

/** Once per PARSER_VERSION bump: re-run the parser over every stored email
 * transaction and apply the allowed updates. Dedupe hashes follow renamed
 * titles (collision-guarded) so future email re-scans still match these rows
 * instead of importing duplicates. */
export async function reparseIfNeeded(): Promise<void> {
  if ((await getSetting('parserVersion')) === PARSER_VERSION) return
  const rules = await db.rules.toArray()
  const all = await db.transactions.toArray()
  const hashes = new Set(all.map(t => t.dedupeHash))
  for (const t of all) {
    if (!t.id) continue
    const changes = planReparseUpdate(t, reparseOne(t), rules)
    if (!changes) continue
    if (changes.merchant || changes.direction) {
      const newHash = dedupeHash(t.date, t.amountCents, changes.merchant ?? t.merchant, changes.direction ?? t.direction)
      if (!hashes.has(newHash)) {
        changes.dedupeHash = newHash
        hashes.add(newHash)
      }
    }
    await db.transactions.update(t.id, changes)
  }
  await setSetting('parserVersion', PARSER_VERSION)
}

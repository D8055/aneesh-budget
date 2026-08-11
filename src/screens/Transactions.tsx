import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, addTransactions } from '../db'
import { CATEGORIES, type Transaction } from '../types'
import { fmtCents, parseCents } from '../lib/money'
import { fmtDateShort, todayISO } from '../lib/dates'
import { dedupeHash } from '../lib/dedupe'
import { accountLabel } from '../lib/accounts'
import type { Card } from '../types'
import CategoryChip from '../components/CategoryChip'

const SOURCE_LABEL: Record<Transaction['source'], string> = {
  'schwab-csv': 'Schwab',
  'schwab-email': 'Schwab',
  'venmo-csv': 'Venmo',
  'venmo-email': 'Venmo',
  'bank-csv': 'Bank',
  'bank-email': 'Bank',
  manual: 'Manual',
}

const sourceLabel = (t: Transaction, cards: Card[]) => {
  const base = t.provider ?? SOURCE_LABEL[t.source]
  return t.accountLast4 ? accountLabel(base, t.accountLast4, cards) : base
}

/** Mobile transfer apps that get their own filter tab when detected. */
const TRANSFER_APPS = ['Venmo', 'Zelle', 'Cash App', 'PayPal']

const effectiveProvider = (t: Transaction) => t.provider ?? SOURCE_LABEL[t.source]

const EMPTY_FORM = { date: '', merchant: '', amount: '', direction: 'expense' as 'expense' | 'income', category: 'Miscellaneous' }

export default function Transactions() {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<string>('All')
  const [appFilter, setAppFilter] = useState<string>('All')
  const [accountFilter, setAccountFilter] = useState<string>('All')
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [makeRule, setMakeRule] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [newCatSheet, setNewCatSheet] = useState('')
  const [newCatForm, setNewCatForm] = useState('')
  const [editName, setEditName] = useState('')
  const [editNote, setEditNote] = useState('')
  const sheetRef = useRef<HTMLDialogElement>(null)
  const addRef = useRef<HTMLDialogElement>(null)

  const cards = useLiveQuery(() => db.cards.toArray()) ?? []
  const customNames = useLiveQuery(async () => (await db.customCategories.toArray()).map(c => c.name)) ?? []
  const allCategories = [...CATEGORIES, ...customNames.filter(n => !(CATEGORIES as readonly string[]).includes(n))]

  const txs = useLiveQuery(async () => {
    let all = await db.transactions.orderBy('date').reverse().toArray()
    if (filter === 'Needs review') all = all.filter(t => t.needsReview)
    else if (filter !== 'All') all = all.filter(t => t.category === filter)
    if (appFilter !== 'All') all = all.filter(t => effectiveProvider(t) === appFilter)
    if (accountFilter !== 'All') all = all.filter(t => t.accountLast4 === accountFilter)
    const q = query.trim().toLowerCase()
    if (q) all = all.filter(t => t.merchant.toLowerCase().includes(q) || t.rawText.toLowerCase().includes(q))
    return all.slice(0, 300)
  }, [query, filter, appFilter, accountFilter])

  const accounts = useLiveQuery(async () => {
    const all = await db.transactions.toArray()
    return [...new Set(all.map(t => t.accountLast4).filter((a): a is string => !!a))].sort()
  }) ?? []

  const transferApps = useLiveQuery(async () => {
    const present = new Set((await db.transactions.toArray()).map(effectiveProvider))
    return TRANSFER_APPS.filter(a => present.has(a))
  }) ?? []

  const reviewCount = useLiveQuery(() => db.transactions.filter(t => !!t.needsReview).count()) ?? 0

  const openEditor = (t: Transaction) => {
    setEditing(t)
    setMakeRule(false)
    setNewCatSheet('')
    setEditName(t.merchant)
    setEditNote(t.note ?? '')
    sheetRef.current?.showModal()
  }

  /** Create a custom category if the name is new; returns the name to use, or null. */
  const createCategory = async (raw: string): Promise<string | null> => {
    const name = raw.trim()
    if (!name) return null
    const existing = allCategories.find(c => c.toLowerCase() === name.toLowerCase())
    if (existing) return existing
    await db.customCategories.add({ name })
    return name
  }

  const openAdd = () => {
    setForm({ ...EMPTY_FORM, date: todayISO() })
    setFormError(null)
    setNewCatForm('')
    addRef.current?.showModal()
  }

  const saveManual = async () => {
    const cents = parseCents(form.amount)
    if (!form.merchant.trim()) { setFormError('Add a description — who or what was it?'); return }
    if (cents === null || cents === 0) { setFormError('Enter an amount like 12.50.'); return }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) { setFormError('Pick a date.'); return }
    const merchant = form.merchant.trim()
    const added = await addTransactions([{
      date: form.date,
      amountCents: cents,
      direction: form.direction,
      source: 'manual',
      merchant,
      category: form.category,
      rawText: `manual entry | ${merchant}`,
      dedupeHash: dedupeHash(form.date, cents, merchant, form.direction),
    }])
    if (added === 0) { setFormError('That exact transaction (same date, amount, and description) is already in the app.'); return }
    addRef.current?.close()
  }

  const saveCategory = async (category: string) => {
    if (!editing?.id) return
    await db.transactions.update(editing.id, { category, needsReview: false })
    if (makeRule) {
      await db.rules.add({ pattern: editing.merchant.toLowerCase(), category, priority: 10 })
      const same = await db.transactions.filter(t => t.merchant.toLowerCase() === editing.merchant.toLowerCase()).toArray()
      for (const t of same) if (t.id !== editing.id) await db.transactions.update(t.id!, { category, needsReview: false })
    }
    sheetRef.current?.close()
    setEditing(null)
  }

  const saveDetails = async () => {
    if (!editing?.id) return
    const merchant = editName.trim() || editing.merchant
    const note = editNote.trim()
    await db.transactions.update(editing.id, { merchant, note: note || undefined })
    sheetRef.current?.close()
    setEditing(null)
  }

  const deleteTransaction = async () => {
    if (!editing?.id) return
    if (window.confirm('Delete this transaction? This cannot be undone. Note: a future email re-scan may re-import it, since deleting does not clear its dedupe record.')) {
      await db.transactions.delete(editing.id)
      sheetRef.current?.close()
      setEditing(null)
    }
  }

  const filters = ['All', ...(reviewCount > 0 ? ['Needs review'] : []), ...allCategories]

  return (
    <main className="screen">
      <header className="row between">
        <div>
          <h1 className="screen-title">Activity</h1>
          <p className="screen-sub">Tap any transaction to recategorize it</p>
        </div>
        <button className="btn small" onClick={openAdd}>+ Add</button>
      </header>

      <input
        className="card"
        style={{ border: 'none', padding: '13px 16px' }}
        placeholder="Search merchants and notes"
        value={query}
        onChange={e => setQuery(e.target.value)}
        aria-label="Search transactions"
      />

      <div className="chips">
        {filters.map(f => (
          <button key={f} className={`chip ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {f}{f === 'Needs review' ? ` (${reviewCount})` : ''}
          </button>
        ))}
      </div>

      {transferApps.length > 0 && (
        <div className="chips">
          {['All', ...transferApps].map(a => (
            <button key={a} className={`chip ${appFilter === a ? 'active' : ''}`} onClick={() => setAppFilter(a)}>
              {a === 'All' ? 'All apps' : a}
            </button>
          ))}
        </div>
      )}

      {accounts.length > 1 && (
        <div className="chips">
          {['All', ...accounts].map(a => (
            <button key={a} className={`chip ${accountFilter === a ? 'active' : ''}`} onClick={() => setAccountFilter(a)}>
              {a === 'All' ? 'All accounts' : accountLabel(undefined, a, cards)}
            </button>
          ))}
        </div>
      )}

      <section className="card">
        {!txs || txs.length === 0 ? (
          <div className="empty">
            <span className="big">🔍</span>
            <strong>Nothing here yet</strong>
            <p>Import a CSV or connect Gmail in Settings, or add a transaction with the + Add button.</p>
          </div>
        ) : (
          txs.map(t => (
            <button key={t.id} className="tx-row" style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', borderBottom: '1px solid var(--line)' }} onClick={() => openEditor(t)}>
              <CategoryChip category={t.category} size={36} />
              <div className="tx-main">
                <p className="tx-merchant">{t.merchant}</p>
                <p className="tx-meta">
                  {fmtDateShort(t.date)} · {sourceLabel(t, cards)} · {t.category}
                  {t.needsReview && <span className="tx-badge needs-review">review</span>}
                </p>
                {t.note && <p className="muted" style={{ fontSize: '0.78rem', fontStyle: 'italic', margin: '2px 0 0' }}>{t.note}</p>}
              </div>
              <span className={`tx-amount ${t.direction}`}>
                {t.direction === 'income' ? '+' : '−'}{fmtCents(t.amountCents)}
              </span>
            </button>
          ))
        )}
      </section>

      <dialog className="sheet" ref={sheetRef} onClose={() => setEditing(null)}>
        {editing && (
          <div className="stack">
            <div className="row" style={{ gap: 12 }}>
              <CategoryChip category={editing.category} />
              <div>
                <strong>{editing.merchant}</strong>
                <p className="muted">{fmtDateShort(editing.date)} · {fmtCents(editing.amountCents)}</p>
              </div>
            </div>
            {editing.needsReview && editing.direction === 'income' && (editing.source === 'venmo-email' || editing.source === 'venmo-csv') && (
              <div className="row">
                <button className="btn small" style={{ flex: 1 }} onClick={() => saveCategory('Reimbursements')}>
                  Paying me back
                </button>
                <button className="btn secondary small" style={{ flex: 1 }} onClick={() => saveCategory('Income')}>
                  Real income
                </button>
              </div>
            )}
            <div className="chips" style={{ flexWrap: 'wrap', overflow: 'visible' }}>
              {allCategories.map(c => (
                <button key={c} className={`chip ${editing.category === c ? 'active' : ''}`} onClick={() => saveCategory(c)}>
                  {c}
                </button>
              ))}
            </div>
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <div className="field" style={{ flex: 1 }}>
                <label htmlFor="sheet-new-cat">Or make a new category</label>
                <input
                  id="sheet-new-cat"
                  value={newCatSheet}
                  onChange={e => setNewCatSheet(e.target.value)}
                  placeholder="e.g. Travel"
                  onKeyDown={async e => {
                    if (e.key === 'Enter') {
                      const name = await createCategory(newCatSheet)
                      if (name) saveCategory(name)
                    }
                  }}
                />
              </div>
              <button
                className="btn secondary small"
                onClick={async () => {
                  const name = await createCategory(newCatSheet)
                  if (name) saveCategory(name)
                }}
              >
                Create & use
              </button>
            </div>
            <label className="row" style={{ fontSize: '0.88rem', gap: 8 }}>
              <input type="checkbox" checked={makeRule} onChange={e => setMakeRule(e.target.checked)} />
              Always categorize “{editing.merchant}” this way
            </label>
            <div className="field">
              <label htmlFor="sheet-name">Name</label>
              <input id="sheet-name" value={editName} onChange={e => setEditName(e.target.value)} placeholder="Transaction name" />
            </div>
            <div className="field">
              <label htmlFor="sheet-note">Note</label>
              <input id="sheet-note" value={editNote} onChange={e => setEditNote(e.target.value)} placeholder="Add a note…" />
            </div>
            <button className="btn" onClick={saveDetails}>Save</button>
            <button className="btn ghost" style={{ color: 'var(--blush-deep)' }} onClick={deleteTransaction}>
              Delete transaction
            </button>
            <button className="btn ghost" onClick={() => sheetRef.current?.close()}>Cancel</button>
          </div>
        )}
      </dialog>

      <dialog className="sheet" ref={addRef}>
        <div className="stack">
          <strong style={{ fontFamily: 'var(--font-display)' }}>Add a transaction</strong>
          {formError && <div className="notice err">{formError}</div>}
          <div className="field">
            <label htmlFor="add-desc">Description</label>
            <input id="add-desc" value={form.merchant} onChange={e => setForm({ ...form, merchant: e.target.value })} placeholder="e.g. Farmers market" />
          </div>
          <div className="row">
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="add-amount">Amount ($)</label>
              <input id="add-amount" inputMode="decimal" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="12.50" />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="add-date">Date</label>
              <input id="add-date" type="date" value={form.date} max={todayISO()} onChange={e => setForm({ ...form, date: e.target.value })} />
            </div>
          </div>
          <div className="row">
            <button className={`chip ${form.direction === 'expense' ? 'active' : ''}`} onClick={() => setForm({ ...form, direction: 'expense' })}>Expense</button>
            <button className={`chip ${form.direction === 'income' ? 'active' : ''}`} onClick={() => setForm({ ...form, direction: 'income' })}>Income</button>
          </div>
          <div className="field">
            <label htmlFor="add-cat">Category</label>
            <select id="add-cat" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
              {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="add-new-cat">Or make a new category</label>
              <input id="add-new-cat" value={newCatForm} onChange={e => setNewCatForm(e.target.value)} placeholder="e.g. Travel" />
            </div>
            <button
              className="btn secondary small"
              onClick={async () => {
                const name = await createCategory(newCatForm)
                if (name) { setForm({ ...form, category: name }); setNewCatForm('') }
              }}
            >
              Create & select
            </button>
          </div>
          <div className="row">
            <button className="btn" onClick={saveManual}>Save transaction</button>
            <button className="btn ghost" onClick={() => addRef.current?.close()}>Cancel</button>
          </div>
        </div>
      </dialog>
    </main>
  )
}

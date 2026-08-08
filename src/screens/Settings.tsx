import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSetting, setSetting, addTransactions } from '../db'
import { parseSchwabCsv } from '../lib/csv/schwab'
import { parseVenmoCsv } from '../lib/csv/venmo'
import { parseGenericCsv } from '../lib/csv/generic'
import { categorize } from '../lib/categorize'
import { connectGmail, disconnectGmail, syncGmail, hasBuiltInClientId } from '../lib/gmail'
import { eraseAllData } from '../db'
import { fmtCents, parseCents } from '../lib/money'
import { CATEGORIES, type Transaction } from '../types'
import CategoryChip from '../components/CategoryChip'

type Pending = { source: 'schwab' | 'venmo' | 'bank'; label: string; txs: Transaction[]; skipped: number }

export default function Settings() {
  const [clientId, setClientId] = useState('')
  const [budget, setBudget] = useState('')
  const [note, setNote] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<'schwab' | 'venmo' | 'bank'>('schwab')
  const bankNameRef = useRef('')
  const inputRef = useRef<HTMLInputElement>(null)

  const connected = useLiveQuery(() => db.settings.get('gmailConnected'))?.value === 'true'
  const lastSync = useLiveQuery(() => db.settings.get('gmailLastSyncAt'))?.value
  const txCount = useLiveQuery(() => db.transactions.count()) ?? 0
  const userRules = useLiveQuery(() => db.rules.orderBy('priority').toArray()) ?? []
  const cards = useLiveQuery(() => db.cards.toArray()) ?? []
  const customCats = useLiveQuery(() => db.customCategories.toArray()) ?? []
  const [cardForm, setCardForm] = useState({ name: '', limit: '', balance: '' })
  const [newCat, setNewCat] = useState('')

  useEffect(() => {
    getSetting('gmailClientId').then(v => v && setClientId(v))
    getSetting('monthlyBudgetCents').then(v => v && setBudget((Number(v) / 100).toFixed(0)))
  }, [])

  const flash = (kind: 'ok' | 'err' | 'info', text: string) => {
    setNote({ kind, text })
    setTimeout(() => setNote(null), 5000)
  }

  const pickFile = (source: 'schwab' | 'venmo' | 'bank') => {
    if (source === 'bank') {
      const name = window.prompt('Which bank or card is this CSV from? (e.g. Chase, Wells Fargo)')
      if (name === null) return
      bankNameRef.current = name.trim() || 'Bank'
    }
    fileRef.current = source
    inputRef.current?.click()
  }

  const onFile = async (f: File | undefined) => {
    if (!f) return
    const text = await f.text()
    const source = fileRef.current
    const label = source === 'schwab' ? 'Schwab' : source === 'venmo' ? 'Venmo' : bankNameRef.current
    const { txs, skipped } =
      source === 'schwab' ? parseSchwabCsv(text)
      : source === 'venmo' ? parseVenmoCsv(text)
      : parseGenericCsv(text, label)
    if (txs.length === 0) {
      flash('err', `Nothing recognizable in that file. Expecting a ${label} statement CSV with date, description, and amount columns.`)
      return
    }
    const rules = await db.rules.toArray()
    const withCats = txs.map(t => ({ ...t, category: categorize(t.merchant, t.rawText, t.direction, rules) }))
    setPending({ source, label, txs: withCats, skipped })
  }

  const commitImport = async () => {
    if (!pending) return
    setBusy(true)
    const added = await addTransactions(pending.txs)
    setBusy(false)
    setPending(null)
    flash('ok', `Imported ${added} transactions${added < pending.txs.length ? ` (${pending.txs.length - added} were already in the app)` : ''}.`)
  }

  const saveClientId = async () => {
    await setSetting('gmailClientId', clientId.trim())
    flash('ok', 'Client ID saved.')
  }

  const doConnect = async () => {
    try {
      setBusy(true)
      await connectGmail()
      const result = await syncGmail()
      flash('ok', `Gmail connected. ${result.message}`)
    } catch (e) {
      flash('err', e instanceof Error ? e.message : 'Could not connect Gmail.')
    } finally {
      setBusy(false)
    }
  }

  const doSync = async () => {
    setBusy(true)
    try {
      const result = await syncGmail()
      flash(result.ok ? 'ok' : 'err', `${result.message} (${result.scanned} emails scanned)`)
    } catch (e) {
      flash('err', e instanceof Error ? e.message : 'Sync failed.')
    } finally {
      setBusy(false)
    }
  }

  const saveBudget = async () => {
    const cents = parseCents(budget)
    if (cents === null) {
      await setSetting('monthlyBudgetCents', '')
      flash('info', 'Budget cleared — the app will compare spending against monthly income instead.')
      return
    }
    await setSetting('monthlyBudgetCents', String(cents))
    flash('ok', `Monthly budget set to ${fmtCents(cents)}.`)
  }

  const addCard = async () => {
    const limit = parseCents(cardForm.limit)
    const balance = parseCents(cardForm.balance) ?? 0
    if (!cardForm.name.trim() || limit === null || limit === 0) {
      flash('err', 'A card needs a name and a credit limit.')
      return
    }
    await db.cards.add({ name: cardForm.name.trim(), limitCents: limit, balanceCents: balance })
    setCardForm({ name: '', limit: '', balance: '' })
    flash('ok', 'Card added — utilization shows on Home.')
  }

  const updateCardBalance = async (id: number, raw: string) => {
    const cents = parseCents(raw)
    if (cents !== null) await db.cards.update(id, { balanceCents: cents })
  }

  const addCategory = async () => {
    const name = newCat.trim()
    if (!name) return
    const taken = ['All', 'Needs review', ...CATEGORIES, ...customCats.map(c => c.name)]
    if (taken.some(t => t.toLowerCase() === name.toLowerCase())) {
      flash('err', `“${name}” already exists.`)
      return
    }
    await db.customCategories.add({ name })
    setNewCat('')
    flash('ok', `Category “${name}” added.`)
  }

  const removeCategory = async (id: number, name: string) => {
    await db.customCategories.delete(id)
    // transactions in the removed category fall back to Miscellaneous
    const affected = await db.transactions.filter(t => t.category === name).toArray()
    for (const t of affected) await db.transactions.update(t.id!, { category: 'Miscellaneous' })
    flash('info', `Removed “${name}”${affected.length ? ` — ${affected.length} transactions moved to Miscellaneous` : ''}.`)
  }

  return (
    <main className="screen">
      <header>
        <h1 className="screen-title">Settings</h1>
        <p className="screen-sub">{txCount} transactions stored on this device</p>
      </header>

      {note && <div className={`notice ${note.kind === 'info' ? '' : note.kind}`}>{note.text}</div>}

      <section className="card stack">
        <h2>Seed with statements</h2>
        <p className="muted">Export a CSV from your bank, card, or payment app and import it here. Works with Schwab, Venmo, and any bank export that has date, description, and amount columns (Chase, Bank of America, Wells Fargo, etc.). Duplicates are skipped automatically.</p>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button className="btn secondary small" onClick={() => pickFile('schwab')}>Schwab CSV</button>
          <button className="btn secondary small" onClick={() => pickFile('venmo')}>Venmo CSV</button>
          <button className="btn secondary small" onClick={() => pickFile('bank')}>Other bank CSV</button>
        </div>
        <input ref={inputRef} type="file" accept=".csv,text/csv" hidden onChange={e => { onFile(e.target.files?.[0]); e.target.value = '' }} />
      </section>

      <section className="card stack">
        <h2>Live updates from Gmail</h2>
        <p className="muted">
          Sign in with the Google account that receives Schwab and Venmo alert emails. The app checks for new
          transaction emails every few minutes while open. Read-only access; everything stays on this device.
        </p>
        {!connected ? (
          <>
            <button className="google-btn" disabled={busy || (!clientId.trim() && !hasBuiltInClientId())} onClick={doConnect}>
              <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden>
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              Sign in with Google
            </button>
            {!clientId.trim() && !hasBuiltInClientId() && (
              <p className="muted">This build has no Google Client ID yet — add one under Advanced setup, or rebuild with VITE_GOOGLE_CLIENT_ID set.</p>
            )}
          </>
        ) : (
          <div className="row">
            <button className="btn small" disabled={busy} onClick={doSync}>Sync now</button>
            <button className="btn ghost small" onClick={() => disconnectGmail().then(() => flash('info', 'Gmail disconnected.'))}>Sign out</button>
          </div>
        )}
        {connected && lastSync && <p className="muted">Last synced {new Date(lastSync).toLocaleString()}</p>}
        <details>
          <summary className="muted" style={{ cursor: 'pointer' }}>Advanced setup</summary>
          <div className="stack" style={{ marginTop: 10 }}>
            <div className="field">
              <label htmlFor="cid">Google OAuth Client ID override</label>
              <input id="cid" value={clientId} onChange={e => setClientId(e.target.value)} placeholder="xxxxxxxx.apps.googleusercontent.com" />
            </div>
            <button className="btn ghost small" style={{ alignSelf: 'flex-start' }} onClick={saveClientId}>Save ID</button>
          </div>
        </details>
      </section>

      <section className="card stack">
        <h2>Monthly budget</h2>
        <p className="muted">Leave blank to measure against this month’s income automatically.</p>
        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="budget">Budget ($ per month)</label>
            <input id="budget" inputMode="decimal" value={budget} onChange={e => setBudget(e.target.value)} placeholder="e.g. 2500" />
          </div>
          <button className="btn small" style={{ alignSelf: 'flex-end' }} onClick={saveBudget}>Save</button>
        </div>
      </section>

      <section className="card stack">
        <h2>Credit cards</h2>
        <p className="muted">Track each card’s limit and how much of it is used. Update the balance whenever you like — utilization shows on Home.</p>
        {cards.map(c => (
          <div className="row between" key={c.id}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ fontSize: '0.9rem' }}>{c.name}</strong>
              <p className="muted">limit {fmtCents(c.limitCents)}</p>
            </div>
            <div className="field" style={{ width: 110 }}>
              <label htmlFor={`bal-${c.id}`}>Balance ($)</label>
              <input
                id={`bal-${c.id}`}
                inputMode="decimal"
                defaultValue={(c.balanceCents / 100).toFixed(2)}
                onBlur={e => updateCardBalance(c.id!, e.target.value)}
              />
            </div>
            <button className="btn ghost small" onClick={() => db.cards.delete(c.id!)}>Remove</button>
          </div>
        ))}
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: 2 }}>
            <label htmlFor="card-name">Card name</label>
            <input id="card-name" value={cardForm.name} onChange={e => setCardForm({ ...cardForm, name: e.target.value })} placeholder="e.g. Schwab Visa" />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="card-limit">Limit ($)</label>
            <input id="card-limit" inputMode="decimal" value={cardForm.limit} onChange={e => setCardForm({ ...cardForm, limit: e.target.value })} placeholder="3000" />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="card-bal">Balance ($)</label>
            <input id="card-bal" inputMode="decimal" value={cardForm.balance} onChange={e => setCardForm({ ...cardForm, balance: e.target.value })} placeholder="0" />
          </div>
        </div>
        <button className="btn small" onClick={addCard}>Add card</button>
      </section>

      <section className="card stack">
        <h2>Categories</h2>
        <p className="muted">Add your own spending categories. Removing one moves its transactions to Miscellaneous.</p>
        {customCats.map(c => (
          <div className="row between" key={c.id}>
            <div className="row" style={{ gap: 8 }}>
              <CategoryChip category={c.name} size={26} />
              <span style={{ fontSize: '0.9rem' }}>{c.name}</span>
            </div>
            <button className="btn ghost small" onClick={() => removeCategory(c.id!, c.name)}>Remove</button>
          </div>
        ))}
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="new-cat">New category</label>
            <input id="new-cat" value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="e.g. Travel" onKeyDown={e => e.key === 'Enter' && addCategory()} />
          </div>
          <button className="btn small" onClick={addCategory}>Add</button>
        </div>
      </section>

      {userRules.length > 0 && (
        <section className="card stack">
          <h2>Your category rules</h2>
          {userRules.map(r => (
            <div className="row between" key={r.id}>
              <div className="row" style={{ gap: 8, minWidth: 0 }}>
                <CategoryChip category={r.category} size={26} />
                <span style={{ fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>“{r.pattern}”</span>
              </div>
              <button className="btn ghost small" onClick={() => db.rules.delete(r.id!)}>Remove</button>
            </div>
          ))}
        </section>
      )}

      <section className="card stack">
        <h2>Reset</h2>
        <p className="muted">Start over from a clean slate on this device.</p>
        <button
          className="btn ghost small"
          style={{ color: 'var(--blush-deep)', alignSelf: 'flex-start' }}
          onClick={async () => {
            if (window.confirm('Erase ALL data on this device — transactions, cards, categories, rules, and settings? This cannot be undone.')) {
              await eraseAllData()
              flash('info', 'All data erased.')
            }
          }}
        >
          Erase all data
        </button>
      </section>

      {pending && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(45,49,66,0.35)', zIndex: 20, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div className="card stack" style={{ width: '100%', maxWidth: 480, borderRadius: '20px 20px 0 0', maxHeight: '75dvh', overflow: 'auto' }}>
            <h2>Preview — {pending.label} import</h2>
            <p className="muted">
              {pending.txs.length} transactions found{pending.skipped > 0 ? `, ${pending.skipped} rows skipped` : ''}. First few:
            </p>
            {pending.txs.slice(0, 5).map((t, i) => (
              <div className="tx-row" key={i}>
                <CategoryChip category={t.category} size={30} />
                <div className="tx-main">
                  <p className="tx-merchant">{t.merchant}</p>
                  <p className="tx-meta">{t.date} · {t.category}</p>
                </div>
                <span className={`tx-amount ${t.direction}`}>{t.direction === 'income' ? '+' : '−'}{fmtCents(t.amountCents)}</span>
              </div>
            ))}
            <div className="row">
              <button className="btn" disabled={busy} onClick={commitImport}>Import {pending.txs.length} transactions</button>
              <button className="btn ghost" onClick={() => setPending(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

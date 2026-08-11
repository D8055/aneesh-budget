import { useEffect, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Transaction } from '../types'
import { db } from '../db'
import CategoryChip from './CategoryChip'
import { fmtCents } from '../lib/money'
import { fmtDateShort } from '../lib/dates'
import { accountLabel } from '../lib/accounts'

export interface Breakdown {
  title: string
  /** plain-language definition, or the formula with real numbers filled in */
  description: string
  txs: Transaction[]
  /** shown next to the title; defaults to the sum of txs */
  totalCents?: number
}

/** Bottom sheet listing the transactions (and math) behind a tapped metric. */
export default function BreakdownSheet({ breakdown, onClose }: { breakdown: Breakdown | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const cards = useLiveQuery(() => db.cards.toArray()) ?? []

  useEffect(() => {
    if (breakdown && !ref.current?.open) ref.current?.showModal()
    if (!breakdown && ref.current?.open) ref.current?.close()
  }, [breakdown])

  if (!breakdown) return <dialog className="sheet" ref={ref} onClose={onClose} />
  const total = breakdown.totalCents ?? breakdown.txs.reduce((s, t) => s + t.amountCents, 0)

  return (
    <dialog className="sheet" ref={ref} onClose={onClose}>
      <div className="stack">
        <div className="row between">
          <strong style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem' }}>{breakdown.title}</strong>
          <strong className="num">{fmtCents(total)}</strong>
        </div>
        <p className="muted">{breakdown.description}</p>
        <div style={{ maxHeight: '50dvh', overflowY: 'auto' }}>
          {breakdown.txs.length === 0 ? (
            <p className="muted">No transactions behind this number yet.</p>
          ) : (
            breakdown.txs.map(t => (
              <div className="tx-row" key={t.id}>
                <CategoryChip category={t.category} size={30} />
                <div className="tx-main">
                  <p className="tx-merchant">{t.merchant}</p>
                  <p className="tx-meta">
                    {fmtDateShort(t.date)}
                    {t.accountLast4
                      ? ` · ${accountLabel(t.provider, t.accountLast4, cards)}`
                      : t.provider ? ` · ${t.provider}` : ''}
                  </p>
                </div>
                <span className={`tx-amount ${t.direction}`}>
                  {t.direction === 'income' ? '+' : '−'}{fmtCents(t.amountCents)}
                </span>
              </div>
            ))
          )}
        </div>
        <button className="btn ghost" onClick={() => ref.current?.close()}>Close</button>
      </div>
    </dialog>
  )
}

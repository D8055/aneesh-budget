import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, LineChart, Line,
} from 'recharts'
import { db } from '../db'
import { CATEGORIES } from '../types'
import { colorForCategory } from '../lib/categoryColors'
import { fmtCompact, fmtCents } from '../lib/money'
import { monthKey, monthLabel, monthLabelShort } from '../lib/dates'
import BreakdownSheet, { type Breakdown } from '../components/BreakdownSheet'
import { monthTotals } from '../lib/totals'

const MONTHS_SHOWN = 12

export default function Trends() {
  const [focusCategory, setFocusCategory] = useState<string>('All spending')
  const [breakdown, setBreakdown] = useState<Breakdown | null>(null)

  /** Tap a month on either chart → list what that month's numbers are made of. */
  const showMonth = async (key: string, category?: string) => {
    let txs = (await db.transactions.where('date').between(`${key}-00`, `${key}-99`).toArray())
      .filter(t => t.category !== 'Transfers')
    if (category) txs = txs.filter(t => t.direction === 'expense' && t.category === category)
    const { spentCents: spent, incomeCents: income } = monthTotals(txs)
    txs.sort((a, b) => b.amountCents - a.amountCents)
    setBreakdown({
      title: category ? `${category} — ${monthLabel(key)}` : monthLabel(key),
      description: category
        ? `All ${category} spending in ${monthLabel(key)}.`
        : `Spent ${fmtCents(spent)}, received ${fmtCents(income)}. Transfers between your own accounts are excluded. Largest first:`,
      txs,
      totalCents: spent,
    })
  }
  const customNames = useLiveQuery(async () =>
    (await db.customCategories.toArray()).map(c => c.name).filter(n => !(CATEGORIES as readonly string[]).includes(n))) ?? []

  const data = useLiveQuery(async () => {
    const all = await db.transactions.toArray()
    const months = new Map<string, { txs: typeof all; byCat: Map<string, number> }>()
    for (const t of all) {
      const k = monthKey(t.date)
      if (!months.has(k)) months.set(k, { txs: [], byCat: new Map() })
      const m = months.get(k)!
      m.txs.push(t)
      if (t.category !== 'Transfers' && t.direction === 'expense') {
        m.byCat.set(t.category, (m.byCat.get(t.category) ?? 0) + t.amountCents)
      }
    }
    const keys = [...months.keys()].sort().slice(-MONTHS_SHOWN)
    return keys.map(k => {
      const m = months.get(k)!
      const totals = monthTotals(m.txs)
      return {
        month: monthLabelShort(k),
        key: k,
        Spent: totals.spentCents / 100,
        Income: totals.incomeCents / 100,
        ...Object.fromEntries([...m.byCat.entries()].map(([c, v]) => [c, v / 100])),
      }
    })
  })

  if (!data) return <main className="screen" />

  if (data.length === 0) {
    return (
      <main className="screen">
        <header>
          <h1 className="screen-title">Trends</h1>
        </header>
        <div className="card empty">
          <span className="big">📈</span>
          <strong>No history yet</strong>
          <p>Once transactions are imported, monthly spending and income trends appear here.</p>
        </div>
      </main>
    )
  }

  const focusData = focusCategory === 'All spending'
    ? data.map(d => ({ month: d.month, key: d.key, value: d.Spent }))
    : data.map(d => ({ month: d.month, key: d.key, value: (d as Record<string, any>)[focusCategory] ?? 0 }))
  const focusColor = focusCategory === 'All spending' ? '#5F57C7' : colorForCategory(focusCategory).ink

  const dollarTick = (v: number) => fmtCompact(v * 100)
  const dollarTip = (v: number) => fmtCents(Math.round(v * 100))

  return (
    <main className="screen">
      <header>
        <h1 className="screen-title">Trends</h1>
        <p className="screen-sub">Last {data.length} month{data.length > 1 ? 's' : ''}</p>
      </header>

      <section className="card">
        <h2>Income vs spending</h2>
        <div style={{ height: 220 }}>
          <ResponsiveContainer>
            <BarChart data={data} barGap={2} onClick={(s: any) => { const key = s?.activePayload?.[0]?.payload?.key; if (key) showMonth(key) }}>
              <CartesianGrid vertical={false} stroke="#E7E9F2" />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#6E7387' }} />
              <YAxis tickFormatter={dollarTick} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#6E7387' }} width={44} />
              <Tooltip formatter={(v: number) => dollarTip(v)} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Income" fill="#A9DFC3" radius={[6, 6, 0, 0]} />
              <Bar dataKey="Spent" fill="#F6C6C6" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="card">
        <h2>Spending over time</h2>
        <div className="chips" style={{ marginBottom: 10 }}>
          {['All spending', ...CATEGORIES.filter(c => c !== 'Income' && c !== 'Transfers' && c !== 'Reimbursements'), ...customNames].map(c => (
            <button key={c} className={`chip ${focusCategory === c ? 'active' : ''}`} onClick={() => setFocusCategory(c)}>
              {c}
            </button>
          ))}
        </div>
        <div style={{ height: 200 }}>
          <ResponsiveContainer>
            <LineChart data={focusData} onClick={(s: any) => { const key = s?.activePayload?.[0]?.payload?.key; if (key) showMonth(key, focusCategory === 'All spending' ? undefined : focusCategory) }}>
              <CartesianGrid vertical={false} stroke="#E7E9F2" />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#6E7387' }} />
              <YAxis tickFormatter={dollarTick} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#6E7387' }} width={44} />
              <Tooltip formatter={(v: number) => dollarTip(v)} />
              <Line type="monotone" dataKey="value" name={focusCategory} stroke={focusColor} strokeWidth={2.5} dot={{ r: 3, fill: focusColor }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>Tap any month on a chart to see the transactions behind it.</p>
      </section>

      <BreakdownSheet breakdown={breakdown} onClose={() => setBreakdown(null)} />
    </main>
  )
}

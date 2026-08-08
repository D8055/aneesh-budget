import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, LineChart, Line,
} from 'recharts'
import { db } from '../db'
import { CATEGORIES } from '../types'
import { colorForCategory } from '../lib/categoryColors'
import { fmtCompact, fmtCents } from '../lib/money'
import { monthKey, monthLabelShort } from '../lib/dates'

const MONTHS_SHOWN = 12

export default function Trends() {
  const [focusCategory, setFocusCategory] = useState<string>('All spending')
  const customNames = useLiveQuery(async () =>
    (await db.customCategories.toArray()).map(c => c.name).filter(n => !(CATEGORIES as readonly string[]).includes(n))) ?? []

  const data = useLiveQuery(async () => {
    const all = await db.transactions.toArray()
    const months = new Map<string, { spent: number; income: number; byCat: Map<string, number> }>()
    for (const t of all) {
      const k = monthKey(t.date)
      if (!months.has(k)) months.set(k, { spent: 0, income: 0, byCat: new Map() })
      const m = months.get(k)!
      if (t.category === 'Transfers') continue
      if (t.direction === 'income') m.income += t.amountCents
      else {
        m.spent += t.amountCents
        m.byCat.set(t.category, (m.byCat.get(t.category) ?? 0) + t.amountCents)
      }
    }
    const keys = [...months.keys()].sort().slice(-MONTHS_SHOWN)
    return keys.map(k => {
      const m = months.get(k)!
      return {
        month: monthLabelShort(k),
        key: k,
        Spent: m.spent / 100,
        Income: m.income / 100,
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
    ? data.map(d => ({ month: d.month, value: d.Spent }))
    : data.map(d => ({ month: d.month, value: (d as Record<string, any>)[focusCategory] ?? 0 }))
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
            <BarChart data={data} barGap={2}>
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
          {['All spending', ...CATEGORIES.filter(c => c !== 'Income' && c !== 'Transfers'), ...customNames].map(c => (
            <button key={c} className={`chip ${focusCategory === c ? 'active' : ''}`} onClick={() => setFocusCategory(c)}>
              {c}
            </button>
          ))}
        </div>
        <div style={{ height: 200 }}>
          <ResponsiveContainer>
            <LineChart data={focusData}>
              <CartesianGrid vertical={false} stroke="#E7E9F2" />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#6E7387' }} />
              <YAxis tickFormatter={dollarTick} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#6E7387' }} width={44} />
              <Tooltip formatter={(v: number) => dollarTip(v)} />
              <Line type="monotone" dataKey="value" name={focusCategory} stroke={focusColor} strokeWidth={2.5} dot={{ r: 3, fill: focusColor }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
    </main>
  )
}

import { useLiveQuery } from 'dexie-react-hooks'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { db } from '../db'
import { colorForCategory } from '../lib/categoryColors'
import { cardUtilization } from '../lib/cards'
import { fmtCents } from '../lib/money'
import { monthKey, fmtDateShort } from '../lib/dates'
import { projectMonth, type Projection } from '../lib/projection'
import CategoryChip from '../components/CategoryChip'

const STATUS_COPY: Record<Projection['status'], string> = {
  'on-track': 'On track',
  'at-risk': 'Pacing to overspend',
  over: 'Over budget',
}

export default function Dashboard() {
  const now = new Date()
  const thisMonth = monthKey(now)

  const data = useLiveQuery(async () => {
    const [monthTxs, budgetSetting, allTxs, cards] = await Promise.all([
      db.transactions.where('date').between(`${thisMonth}-00`, `${thisMonth}-99`).toArray(),
      db.settings.get('monthlyBudgetCents'),
      db.transactions.toArray(),
      db.cards.toArray(),
    ])

    const spent = monthTxs.filter(t => t.direction === 'expense' && t.category !== 'Transfers').reduce((s, t) => s + t.amountCents, 0)
    const income = monthTxs.filter(t => t.direction === 'income').reduce((s, t) => s + t.amountCents, 0)

    // fallback budget: average income of the previous 3 months with data
    const incomeByMonth = new Map<string, number>()
    for (const t of allTxs) {
      if (t.direction !== 'income') continue
      const k = monthKey(t.date)
      if (k >= thisMonth) continue
      incomeByMonth.set(k, (incomeByMonth.get(k) ?? 0) + t.amountCents)
    }
    const recent = [...incomeByMonth.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 3)
    const fallback = recent.length ? Math.round(recent.reduce((s, [, v]) => s + v, 0) / recent.length) : 0

    const override = budgetSetting?.value ? Number(budgetSetting.value) : null
    const projection = projectMonth(spent, income, override, fallback, now)

    const byCategory = new Map<string, number>()
    for (const t of monthTxs) {
      if (t.direction !== 'expense' || t.category === 'Transfers') continue
      byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + t.amountCents)
    }
    const categories = [...byCategory.entries()].sort((a, b) => b[1] - a[1])

    const recentTxs = [...allTxs].sort((a, b) => b.date.localeCompare(a.date) || (b.id ?? 0) - (a.id ?? 0)).slice(0, 6)
    const total = allTxs.length
    return { projection, categories, recentTxs, total, cards }
  }, [thisMonth])

  if (!data) return <main className="screen" />
  const { projection: p, categories, recentTxs, total, cards } = data

  if (total === 0) {
    return (
      <main className="screen">
        <header>
          <h1 className="screen-title">Aneesh’s Budget</h1>
          <p className="screen-sub">{now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
        </header>
        <div className="card empty">
          <span className="big">🌱</span>
          <strong>No transactions yet</strong>
          <p>Import a Schwab or Venmo CSV in Settings to seed your history, then connect Gmail to keep it updated automatically.</p>
        </div>
      </main>
    )
  }

  const spendPct = p.budgetCents > 0 ? Math.min(100, (p.spentCents / p.budgetCents) * 100) : 0
  const todayPct = (p.daysElapsed / p.daysInMonth) * 100
  const maxCat = categories.length ? categories[0][1] : 1

  return (
    <main className="screen">
      <header className="row between">
        <div>
          <h1 className="screen-title">Aneesh’s Budget</h1>
          <p className="screen-sub">{now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
        </div>
        <span className={`status-pill ${p.status}`}>{STATUS_COPY[p.status]}</span>
      </header>

      <section className="card">
        <p className="hero-caption">Spent this month</p>
        <p className="hero-amount num">{fmtCents(p.spentCents)}</p>
        <div className="runway" role="img" aria-label={`Spent ${fmtCents(p.spentCents)} of ${fmtCents(p.budgetCents)}; day ${p.daysElapsed} of ${p.daysInMonth}`}>
          <div className={`runway-fill ${p.status}`} style={{ width: `${spendPct}%` }} />
          <div className="runway-today" style={{ left: `${todayPct}%` }} />
        </div>
        <div className="runway-labels">
          <span>day {p.daysElapsed} of {p.daysInMonth}</span>
          <span>{p.budgetCents > 0 ? `budget ${fmtCents(p.budgetCents)}` : 'set a budget in Settings'}</span>
        </div>
        <div className="row between" style={{ marginTop: 12 }}>
          <span className="muted">Projected month-end</span>
          <strong className="num">{fmtCents(p.projectedCents)}</strong>
        </div>
        <div className="row between">
          <span className="muted">Income so far</span>
          <strong className="num" style={{ color: 'var(--mint-deep)' }}>{fmtCents(p.incomeCents)}</strong>
        </div>
      </section>

      {cards.length > 0 && (
        <section className="card">
          <h2>Credit cards</h2>
          {cards.map(c => {
            const u = cardUtilization(c.balanceCents, c.limitCents)
            const fillClass = u.status === 'low' ? 'on-track' : u.status === 'medium' ? 'at-risk' : 'over'
            return (
              <div key={c.id} style={{ padding: '8px 0' }}>
                <div className="cat-name">
                  <span>{c.name}</span>
                  <span className="num">{u.pct}% used</span>
                </div>
                <div className="cat-track" style={{ height: 8, marginTop: 6 }}>
                  <div className={`cat-fill runway-fill ${fillClass}`} style={{ width: `${u.barPct}%`, position: 'relative' }} />
                </div>
                <div className="runway-labels" style={{ marginTop: 4 }}>
                  <span>{fmtCents(c.balanceCents)} balance</span>
                  <span>{fmtCents(c.limitCents)} limit</span>
                </div>
              </div>
            )
          })}
        </section>
      )}

      {categories.length > 0 && (
        <section className="card">
          <h2>Where it went</h2>
          <div style={{ height: 170 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={categories.map(([name, value]) => ({ name, value }))} dataKey="value" innerRadius={52} outerRadius={80} paddingAngle={2} stroke="none">
                  {categories.map(([name]) => (
                    <Cell key={name} fill={colorForCategory(name).bg} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          {categories.map(([name, cents]) => (
            <div className="cat-row" key={name}>
              <CategoryChip category={name} size={32} />
              <div className="cat-info">
                <div className="cat-name">
                  <span>{name}</span>
                  <span className="num">{fmtCents(cents)}</span>
                </div>
                <div className="cat-track">
                  <div className="cat-fill" style={{ width: `${(cents / maxCat) * 100}%`, background: colorForCategory(name).bg }} />
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="card">
        <h2>Recent</h2>
        {recentTxs.map(t => (
          <div className="tx-row" key={t.id}>
            <CategoryChip category={t.category} size={32} />
            <div className="tx-main">
              <p className="tx-merchant">{t.merchant}</p>
              <p className="tx-meta">{fmtDateShort(t.date)}</p>
            </div>
            <span className={`tx-amount ${t.direction}`}>
              {t.direction === 'income' ? '+' : '−'}{fmtCents(t.amountCents)}
            </span>
          </div>
        ))}
      </section>
    </main>
  )
}

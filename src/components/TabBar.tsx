export type Tab = 'home' | 'activity' | 'trends' | 'settings'

const icons: Record<Tab, JSX.Element> = {
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v9.5h13V10" />
    </svg>
  ),
  activity: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 6.5h16M4 12h16M4 17.5h10" />
    </svg>
  ),
  trends: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19 10 12l4 3.5L20 8" /><path d="M15.5 8H20v4.5" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M18.5 5.5l-2.1 2.1M7.6 16.4l-2.1 2.1" />
    </svg>
  ),
}

const labels: Record<Tab, string> = { home: 'Home', activity: 'Activity', trends: 'Trends', settings: 'Settings' }

export default function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav className="tabbar">
      {(Object.keys(labels) as Tab[]).map(t => (
        <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => onChange(t)}>
          {icons[t]}
          {labels[t]}
        </button>
      ))}
    </nav>
  )
}

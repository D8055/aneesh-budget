import { useEffect, useState } from 'react'
import Dashboard from './screens/Dashboard'
import Transactions from './screens/Transactions'
import Trends from './screens/Trends'
import Settings from './screens/Settings'
import TabBar, { type Tab } from './components/TabBar'
import { syncGmail } from './lib/gmail'

const SYNC_INTERVAL_MS = 5 * 60 * 1000

export default function App() {
  const [tab, setTab] = useState<Tab>('home')
  const [syncNote, setSyncNote] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const result = await syncGmail()
        if (!cancelled && result.ok && result.added > 0) {
          setSyncNote(result.message)
          setTimeout(() => setSyncNote(null), 4000)
        }
      } catch {
        // offline or token expired — next interval will retry
      }
    }
    run()
    const id = setInterval(run, SYNC_INTERVAL_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  return (
    <>
      {syncNote && (
        <div className="notice ok" style={{ position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 10 }}>
          {syncNote}
        </div>
      )}
      {tab === 'home' && <Dashboard />}
      {tab === 'activity' && <Transactions />}
      {tab === 'trends' && <Trends />}
      {tab === 'settings' && <Settings />}
      <TabBar tab={tab} onChange={setTab} />
    </>
  )
}

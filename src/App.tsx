import { useEffect, useState } from 'react'
import Dashboard from './screens/Dashboard'
import Transactions from './screens/Transactions'
import Trends from './screens/Trends'
import Settings from './screens/Settings'
import TabBar, { type Tab } from './components/TabBar'
import { syncGmail } from './lib/gmail'

const SYNC_INTERVAL_MS = 5 * 60 * 1000
/** Don't re-sync on foreground if we synced more recently than this (rapid app switching). */
const FOREGROUND_THROTTLE_MS = 60 * 1000

export default function App() {
  const [tab, setTab] = useState<Tab>('home')
  const [syncNote, setSyncNote] = useState<string | null>(null)

  useEffect(() => {
    // Ask the browser to mark this app's on-device storage as persistent so the
    // OS never silently evicts transactions under storage pressure.
    navigator.storage?.persist?.().catch(() => {})
    let cancelled = false
    let syncing = false
    let lastRunAt = 0
    const run = async () => {
      if (syncing) return
      syncing = true
      lastRunAt = Date.now()
      try {
        const result = await syncGmail()
        if (!cancelled && result.ok && result.added > 0) {
          setSyncNote(result.message)
          setTimeout(() => setSyncNote(null), 4000)
        }
      } catch {
        // offline or token expired — the next trigger will retry
      } finally {
        syncing = false
      }
    }
    run()
    const id = setInterval(run, SYNC_INTERVAL_MS)
    // Mobile browsers freeze timers while the app is backgrounded or the screen is
    // locked — sync immediately whenever the app comes back to the foreground.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRunAt > FOREGROUND_THROTTLE_MS) run()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => { cancelled = true; clearInterval(id); document.removeEventListener('visibilitychange', onVisible) }
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

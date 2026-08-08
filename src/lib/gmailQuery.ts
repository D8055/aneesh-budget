import { KNOWN_SENDER_DOMAINS } from './email/providers'

/** Gmail search query for the sync.
 * First-ever sync (no stored timestamp) and explicit re-scans walk the ENTIRE
 * mailbox history; incremental syncs only look at mail since the last sync. */
export function buildGmailQuery(lastSyncEpoch: string | undefined, fullHistory: boolean): string {
  const senders = `from:(${KNOWN_SENDER_DOMAINS.join(' OR ')})`
  if (fullHistory || !lastSyncEpoch) return senders
  return `${senders} after:${lastSyncEpoch}`
}

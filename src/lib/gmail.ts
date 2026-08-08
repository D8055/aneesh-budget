import { db, getSetting, setSetting, addTransactions } from '../db'
import { categorize } from './categorize'
import type { EmailInput } from './email/schwabEmail'
import { parseProviderEmail } from './email/providers'
import { buildGmailQuery } from './gmailQuery'
import type { Transaction } from '../types'

const GSI_SRC = 'https://accounts.google.com/gsi/client'
const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'
/** Baked in at build time from .env (VITE_GOOGLE_CLIENT_ID); a Settings override wins if present. */
const BUILT_IN_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''

export async function resolveClientId(): Promise<string> {
  return (await getSetting('gmailClientId'))?.trim() || BUILT_IN_CLIENT_ID
}

export function hasBuiltInClientId(): boolean {
  return BUILT_IN_CLIENT_ID.length > 0
}

let accessToken: string | null = null
let tokenExpiry = 0

declare global {
  interface Window {
    google?: any
  }
}

function loadGsi(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve()
    const s = document.createElement('script')
    s.src = GSI_SRC
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Could not load Google Sign-In. Check your internet connection.'))
    document.head.appendChild(s)
  })
}

/** Interactive connect: opens Google's sign-in popup. Uses the built-in Client ID, or a Settings override. */
export async function connectGmail(): Promise<void> {
  const clientId = await resolveClientId()
  if (!clientId) throw new Error('This build has no Google Client ID. Add one under Advanced setup below.')
  await loadGsi()
  await requestToken(clientId, '')
  await setSetting('gmailConnected', 'true')
}

function requestToken(clientId: string, promptMode: '' | 'none'): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      prompt: promptMode,
      callback: (resp: any) => {
        if (resp.error) return reject(new Error(resp.error_description ?? resp.error))
        accessToken = resp.access_token
        tokenExpiry = Date.now() + (resp.expires_in - 60) * 1000
        resolve()
      },
      error_callback: (err: any) => reject(new Error(err?.message ?? 'Google sign-in was closed.')),
    })
    client.requestAccessToken()
  })
}

async function ensureToken(): Promise<boolean> {
  if (accessToken && Date.now() < tokenExpiry) return true
  const clientId = await resolveClientId()
  const connected = await getSetting('gmailConnected')
  if (!clientId || connected !== 'true') return false
  try {
    await loadGsi()
    await requestToken(clientId, 'none')
    return true
  } catch {
    return false
  }
}

async function gmailFetch(path: string): Promise<any> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Gmail API error ${res.status}`)
  return res.json()
}

function b64urlDecode(data: string): string {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/')
  try {
    return decodeURIComponent(
      atob(b64).split('').map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''),
    )
  } catch {
    return atob(b64)
  }
}

function extractBody(payload: any): string {
  if (!payload) return ''
  if (payload.body?.data) {
    const text = b64urlDecode(payload.body.data)
    return payload.mimeType === 'text/html' ? text.replace(/<[^>]+>/g, ' ') : text
  }
  if (payload.parts) {
    const plain = payload.parts.find((p: any) => p.mimeType === 'text/plain')
    const html = payload.parts.find((p: any) => p.mimeType === 'text/html')
    for (const part of [plain, html, ...payload.parts]) {
      if (part) {
        const text = extractBody(part)
        if (text) return text
      }
    }
  }
  return ''
}

export interface SyncResult {
  ok: boolean
  added: number
  scanned: number
  message: string
}

/** Fetch alert emails from all known banks and payment apps and turn them into transactions.
 * The first-ever sync (and any explicit fullHistory re-scan) walks the entire mailbox;
 * later syncs only fetch mail newer than the last sync. */
export async function syncGmail(
  options: { fullHistory?: boolean } = {},
  onProgress?: (done: number, total: number) => void,
): Promise<SyncResult> {
  if (!(await ensureToken())) {
    return { ok: false, added: 0, scanned: 0, message: 'Gmail is not connected.' }
  }
  const lastSync = await getSetting('gmailLastSyncEpoch')
  const q = encodeURIComponent(buildGmailQuery(lastSync, options.fullHistory ?? false))

  // Collect every matching message id first so progress can report done/total
  const allIds: string[] = []
  let pageToken: string | undefined
  do {
    const list = await gmailFetch(`messages?q=${q}&maxResults=500${pageToken ? `&pageToken=${pageToken}` : ''}`)
    for (const m of list.messages ?? []) allIds.push(m.id)
    pageToken = list.nextPageToken
  } while (pageToken)
  onProgress?.(0, allIds.length)

  let scanned = 0
  const txs: Transaction[] = []
  const userRules = await db.rules.toArray()
  for (const id of allIds) {
    const msg = await gmailFetch(`messages/${id}?format=full`)
    scanned++
    onProgress?.(scanned, allIds.length)
    const headers: { name: string; value: string }[] = msg.payload?.headers ?? []
    const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value ?? ''
    const from = headers.find(h => h.name.toLowerCase() === 'from')?.value ?? ''
    const receivedDate = new Date(Number(msg.internalDate)).toISOString().slice(0, 10)
    const body = extractBody(msg.payload)
    const email: EmailInput = { subject, body, receivedDate }

    const parsed = parseProviderEmail(from, email)
    if (parsed) {
      const category = categorize(parsed.merchant, parsed.rawText, parsed.direction, userRules)
      txs.push({ ...parsed, category })
    }
  }

  const added = await addTransactions(txs)

  // Auto-register any cards/accounts newly seen in this batch's alert emails.
  let newCards = 0
  const seenPairs = new Map<string, { provider?: string; last4: string }>()
  for (const t of txs) {
    if (t.accountLast4) seenPairs.set(`${t.provider ?? ''}|${t.accountLast4}`, { provider: t.provider, last4: t.accountLast4 })
  }
  if (seenPairs.size > 0) {
    const existingCards = await db.cards.toArray()
    const existingLast4s = new Set(existingCards.map(c => c.last4).filter(Boolean))
    for (const { provider, last4 } of seenPairs.values()) {
      if (existingLast4s.has(last4)) continue
      await db.cards.add({ name: `${provider ?? 'Card'} •${last4}`, kind: 'credit', last4, limitCents: 0, balanceCents: 0 })
      existingLast4s.add(last4)
      newCards++
    }
  }

  await setSetting('gmailLastSyncEpoch', String(Math.floor(Date.now() / 1000)))
  await setSetting('gmailLastSyncAt', new Date().toISOString())
  const message = added
    ? `Added ${added} new transactions.${newCards > 0 ? ` ${newCards} new card${newCards === 1 ? '' : 's'} detected.` : ''}`
    : 'Up to date.'
  return { ok: true, added, scanned, message }
}

export async function disconnectGmail(): Promise<void> {
  accessToken = null
  await setSetting('gmailConnected', 'false')
}

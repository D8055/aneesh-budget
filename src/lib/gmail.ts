import { db, getSetting, setSetting, addTransactions } from '../db'
import { categorize, applyVenmoIncomeDefaults } from './categorize'
import type { EmailInput } from './email/schwabEmail'
import { parseProviderEmail } from './email/providers'
import { buildGmailQuery } from './gmailQuery'
import { accountNickname } from './accounts'
import type { Transaction } from '../types'

const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'
/** Baked in at build time from .env (VITE_GOOGLE_CLIENT_ID); a Settings override wins if present. */
const BUILT_IN_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''

export async function resolveClientId(): Promise<string> {
  return (await getSetting('gmailClientId'))?.trim() || BUILT_IN_CLIENT_ID
}

export function hasBuiltInClientId(): boolean {
  return BUILT_IN_CLIENT_ID.length > 0
}

/* ===== Auth: full-page redirect flow (implicit grant) =====
 * Popups are blocked in installed PWAs (especially iOS Safari), so sign-in
 * navigates to Google and Google redirects back here with the token in the
 * URL hash. Tokens live ~1h in localStorage (sessionStorage dies whenever iOS
 * kills the installed app, which forced a re-auth on nearly every open).
 * Renewal is a quick prompt=none bounce guarded against redirect loops; the
 * signed-in address is remembered and sent as login_hint so any re-auth is a
 * one-tap "Continue as …", not a fresh account picker. */

let accessToken: string | null = null
let tokenExpiry = 0

const LS_TOKEN = 'gmailToken'
const LS_TOKEN_EXP = 'gmailTokenExp'
const LS_SILENT_AT = 'gmailSilentAt'
const LS_INTERACTIVE_AT = 'gmailInteractiveAt'
const SS_AUTH_STATE = 'gmailAuthState'
const SILENT_RETRY_MS = 3 * 60 * 1000
const INTERACTIVE_RETRY_MS = 15 * 60 * 1000

/** OAuth authorization URL for the redirect flow. Pure; unit tested. */
export function buildAuthUrl(clientId: string, redirectUri: string, opts: { state: string; silent?: boolean; loginHint?: string }): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: SCOPE,
    state: opts.state,
    ...(opts.silent ? { prompt: 'none' } : {}),
    ...(opts.loginHint ? { login_hint: opts.loginHint } : {}),
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export type AuthHashResult =
  | { accessToken: string; expiresIn: number; state: string }
  | { error: string; state: string }
  | null

/** Parse Google's redirect-return hash. Pure; unit tested. */
export function parseAuthHash(hash: string): AuthHashResult {
  if (!hash.startsWith('#')) return null
  const p = new URLSearchParams(hash.slice(1))
  const state = p.get('state') ?? ''
  const error = p.get('error')
  if (error) return { error, state }
  const token = p.get('access_token')
  if (!token) return null
  return { accessToken: token, expiresIn: Number(p.get('expires_in') ?? 3600), state }
}

/** The app's own URL, exactly as Google must have it in Authorized redirect URIs. */
function redirectUri(): string {
  return location.origin + location.pathname.replace(/index\.html$/, '')
}

function newState(kind: 'i' | 's'): string {
  const nonce = crypto.getRandomValues(new Uint32Array(2)).join('')
  const state = `${kind}:${nonce}`
  sessionStorage.setItem(SS_AUTH_STATE, state)
  return state
}

/** Interactive connect: navigates this page to Google's sign-in. The page unloads;
 * handleAuthReturn() picks the result up when Google redirects back. */
export async function connectGmail(): Promise<void> {
  const clientId = await resolveClientId()
  if (!clientId) throw new Error('This build has no Google Client ID. Add one under Advanced setup below.')
  const hint = await getSetting('gmailAccount')
  location.assign(buildAuthUrl(clientId, redirectUri(), { state: newState('i'), loginHint: hint || undefined }))
}

/** Call once on app start, before the first sync. Consumes a Google redirect
 * return if one is in the URL. Returns a user-facing message, or null. */
export async function handleAuthReturn(): Promise<string | null> {
  const parsed = parseAuthHash(location.hash)
  if (!parsed) return null
  history.replaceState(null, '', location.pathname + location.search)
  const expected = sessionStorage.getItem(SS_AUTH_STATE)
  sessionStorage.removeItem(SS_AUTH_STATE)
  const silent = parsed.state.startsWith('s:')

  if ('error' in parsed) {
    if (silent) {
      // Silent renewal failed — Google wants interaction. Instead of dropping the
      // connection (which forced a full re-login from Settings), bounce once through
      // interactive auth pre-filled with the saved account: with the scope already
      // granted that's typically a single "Continue as …" tap, or no tap at all.
      const clientId = await resolveClientId()
      const hint = await getSetting('gmailAccount')
      const lastInteractive = Number(localStorage.getItem(LS_INTERACTIVE_AT) ?? 0)
      if (clientId && hint && Date.now() - lastInteractive > INTERACTIVE_RETRY_MS) {
        localStorage.setItem(LS_INTERACTIVE_AT, String(Date.now()))
        location.assign(buildAuthUrl(clientId, redirectUri(), { state: newState('i'), loginHint: hint }))
        return null
      }
      await setSetting('gmailConnected', 'false')
      return 'Google sign-in expired — reconnect Gmail in Settings.'
    }
    return `Google sign-in didn’t complete (${parsed.error}). Try again from Settings.`
  }
  if (expected && parsed.state !== expected) return null // stale or injected return — ignore
  accessToken = parsed.accessToken
  tokenExpiry = Date.now() + (parsed.expiresIn - 60) * 1000
  localStorage.setItem(LS_TOKEN, accessToken)
  localStorage.setItem(LS_TOKEN_EXP, String(tokenExpiry))
  localStorage.removeItem(LS_INTERACTIVE_AT)
  await setSetting('gmailConnected', 'true')
  // Remember which account signed in so every future auth can pre-select it.
  try {
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (res.ok) {
      const profile = await res.json()
      if (profile.emailAddress) await setSetting('gmailAccount', profile.emailAddress)
    }
  } catch {
    // saving the hint is best-effort; auth itself already succeeded
  }
  return silent ? null : 'Gmail connected.'
}

async function ensureToken(): Promise<boolean> {
  if (!accessToken) {
    const stored = localStorage.getItem(LS_TOKEN)
    const exp = Number(localStorage.getItem(LS_TOKEN_EXP) ?? 0)
    if (stored && Date.now() < exp) { accessToken = stored; tokenExpiry = exp }
  }
  if (accessToken && Date.now() < tokenExpiry) return true

  const clientId = await resolveClientId()
  const connected = await getSetting('gmailConnected')
  if (!clientId || connected !== 'true') return false

  // Renew via a quick prompt=none redirect bounce — only when the app is visible
  // and we haven't just tried (prevents redirect loops). The saved account rides
  // along so Google knows exactly which session to renew.
  const lastSilent = Number(localStorage.getItem(LS_SILENT_AT) ?? 0)
  if (document.visibilityState === 'visible' && Date.now() - lastSilent > SILENT_RETRY_MS) {
    localStorage.setItem(LS_SILENT_AT, String(Date.now()))
    const hint = await getSetting('gmailAccount')
    location.assign(buildAuthUrl(clientId, redirectUri(), { state: newState('s'), silent: true, loginHint: hint || undefined }))
  }
  return false
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
  onProgress?.(0, 0) // shows the "searching…" state immediately
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
    scanned++
    onProgress?.(scanned, allIds.length)
    try {
      const msg = await gmailFetch(`messages/${id}?format=full`)
      const headers: { name: string; value: string }[] = msg.payload?.headers ?? []
      const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value ?? ''
      const from = headers.find(h => h.name.toLowerCase() === 'from')?.value ?? ''
      const receivedDate = new Date(Number(msg.internalDate)).toISOString().slice(0, 10)
      const body = extractBody(msg.payload)
      const email: EmailInput = { subject, body, receivedDate }

      const parsed = parseProviderEmail(from, email)
      if (parsed) {
        const category = categorize(parsed.merchant, parsed.rawText, parsed.direction, userRules)
        const tx = applyVenmoIncomeDefaults({ ...parsed, category }, userRules)
        // Record what the parser/categorizer produced so later re-parses can
        // tell auto values (upgradable) apart from user edits (untouchable).
        txs.push({ ...tx, autoMerchant: tx.merchant, autoCategory: tx.category })
      }
    } catch {
      // one unreadable/unparseable email must never abort the whole scan
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
      const nickname = accountNickname(last4)
      await db.cards.add({
        name: nickname ?? `${provider ?? 'Card'} •${last4}`,
        kind: nickname && /checking|savings/i.test(nickname) ? 'debit' : 'credit',
        last4, limitCents: 0, balanceCents: 0,
      })
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
  tokenExpiry = 0
  localStorage.removeItem(LS_TOKEN)
  localStorage.removeItem(LS_TOKEN_EXP)
  localStorage.removeItem(LS_SILENT_AT)
  localStorage.removeItem(LS_INTERACTIVE_AT)
  await setSetting('gmailConnected', 'false')
  // An explicit sign-out also forgets which account to pre-select next time.
  await setSetting('gmailAccount', '')
}

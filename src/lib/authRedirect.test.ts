import { describe, it, expect } from 'vitest'
import { buildAuthUrl, parseAuthHash, shouldRedirectForAuth } from './gmail'

describe('buildAuthUrl', () => {
  const url = buildAuthUrl('CLIENT123.apps.googleusercontent.com', 'https://d8055.github.io/aneesh-budget/', { state: 'i:abc' })
  it('targets the Google OAuth endpoint with an implicit token response', () => {
    expect(url.startsWith('https://accounts.google.com/o/oauth2/v2/auth?')).toBe(true)
    expect(url).toContain('response_type=token')
    expect(url).toContain('client_id=CLIENT123.apps.googleusercontent.com')
  })
  it('carries the redirect target, gmail scope, and state', () => {
    expect(url).toContain(encodeURIComponent('https://d8055.github.io/aneesh-budget/'))
    expect(url).toContain(encodeURIComponent('https://www.googleapis.com/auth/gmail.readonly'))
    expect(url).toContain('state=i%3Aabc')
  })
  it('adds prompt=none only for silent refreshes', () => {
    expect(url).not.toContain('prompt=none')
    expect(buildAuthUrl('c', 'r', { state: 's:x', silent: true })).toContain('prompt=none')
  })
  it('carries the saved account as login_hint so re-auth pre-selects it', () => {
    expect(buildAuthUrl('c', 'r', { state: 'i:x', loginHint: 'aneesh@gmail.com' }))
      .toContain(`login_hint=${encodeURIComponent('aneesh@gmail.com')}`)
    expect(url).not.toContain('login_hint')
  })
})

describe('shouldRedirectForAuth', () => {
  const ok = { online: true, visible: true, lastAttemptAt: 0, now: 600_000, retryMs: 180_000 }

  it('allows a renewal when online, visible, and past the retry window', () => {
    expect(shouldRedirectForAuth(ok)).toBe(true)
  })
  it('never navigates away while offline — the app stays usable instead', () => {
    expect(shouldRedirectForAuth({ ...ok, online: false })).toBe(false)
  })
  it('waits until the app is visible', () => {
    expect(shouldRedirectForAuth({ ...ok, visible: false })).toBe(false)
  })
  it('rate-limits repeat attempts to prevent redirect loops', () => {
    expect(shouldRedirectForAuth({ ...ok, lastAttemptAt: 500_000 })).toBe(false)
  })
  it('requires every condition, not just the network', () => {
    expect(shouldRedirectForAuth({ ...ok, online: false, visible: false })).toBe(false)
  })
})

describe('parseAuthHash', () => {
  it('parses a successful token return', () => {
    const r = parseAuthHash('#state=i%3Aabc&access_token=ya29.token&token_type=Bearer&expires_in=3599&scope=x')
    expect(r).toEqual({ accessToken: 'ya29.token', expiresIn: 3599, state: 'i:abc' })
  })
  it('parses an error return', () => {
    const r = parseAuthHash('#error=interaction_required&state=s%3Axyz')
    expect(r).toEqual({ error: 'interaction_required', state: 's:xyz' })
  })
  it('returns null for hashes that are not auth responses', () => {
    expect(parseAuthHash('')).toBeNull()
    expect(parseAuthHash('#section-2')).toBeNull()
  })
})

import { describe, it, expect } from 'vitest'
import { buildGmailQuery } from './gmailQuery'

describe('buildGmailQuery', () => {
  it('scans full history on the first ever sync (no stored timestamp)', () => {
    const q = buildGmailQuery(undefined, false)
    expect(q).toContain('from:(')
    expect(q).not.toContain('after:')
    expect(q).not.toContain('newer_than')
  })
  it('scans only new emails on later syncs', () => {
    const q = buildGmailQuery('1754600000', false)
    expect(q).toContain('after:1754600000')
  })
  it('ignores the stored timestamp when a full re-scan is requested', () => {
    const q = buildGmailQuery('1754600000', true)
    expect(q).not.toContain('after:')
  })
  it('always restricts to known financial senders', () => {
    for (const q of [buildGmailQuery(undefined, false), buildGmailQuery('123', false), buildGmailQuery('123', true)]) {
      expect(q).toMatch(/from:\(.*venmo\.com.*\)/)
      expect(q).toMatch(/chase\.com/)
    }
  })
})

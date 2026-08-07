import { describe, it, expect } from 'vitest'
import { cardUtilization } from './cards'
import { colorForCategory } from './categoryColors'

describe('cardUtilization', () => {
  it('computes percent used from balance and limit', () => {
    const u = cardUtilization(25000, 100000) // $250 of $1,000
    expect(u.pct).toBe(25)
    expect(u.status).toBe('low')
  })
  it('flags medium utilization above 30%', () => {
    expect(cardUtilization(31000, 100000).status).toBe('medium')
    expect(cardUtilization(75000, 100000).status).toBe('medium')
  })
  it('flags high utilization above 75%', () => {
    expect(cardUtilization(76000, 100000).status).toBe('high')
  })
  it('caps the bar at 100% but reports the true percent', () => {
    const u = cardUtilization(120000, 100000)
    expect(u.pct).toBe(120)
    expect(u.barPct).toBe(100)
    expect(u.status).toBe('high')
  })
  it('handles a zero or missing limit without dividing by zero', () => {
    const u = cardUtilization(5000, 0)
    expect(u.pct).toBe(0)
    expect(u.status).toBe('low')
  })
  it('rounds to whole percent', () => {
    expect(cardUtilization(3333, 100000).pct).toBe(3)
  })
})

describe('colorForCategory', () => {
  it('returns the fixed palette for built-in categories', () => {
    expect(colorForCategory('Groceries').bg).toBe('#BFE8D4')
    expect(colorForCategory('Miscellaneous').bg).toBeTruthy()
  })
  it('gives a custom category a stable pastel color', () => {
    const a = colorForCategory('Pets')
    const b = colorForCategory('Pets')
    expect(a.bg).toBe(b.bg)
    expect(a.bg).toMatch(/^#[0-9A-F]{6}$/i)
  })
  it('usually gives different customs different colors', () => {
    expect(colorForCategory('Pets').bg === colorForCategory('Travel').bg
      && colorForCategory('Pets').bg === colorForCategory('Gifts').bg).toBe(false)
  })
})

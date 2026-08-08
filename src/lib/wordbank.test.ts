import { describe, it, expect } from 'vitest'
import { categorize } from './categorize'
import { CATEGORIES, CATEGORY_COLORS } from '../types'

const cat = (merchant: string) => categorize(merchant, '', 'expense', [])

describe('expanded merchant word bank', () => {
  it('recognizes grocery chains', () => {
    for (const m of ['KROGER #123', 'ALBERTSONS 4432', 'FOOD LION 221', 'WINCO FOODS', 'HEB #044', 'MEIJER STORE', 'INSTACART*ORDER', 'STOP & SHOP 0553', 'GROCERY OUTLET']) {
      expect(cat(m), m).toBe('Groceries')
    }
  })
  it('recognizes restaurants, fast food, and delivery', () => {
    for (const m of ['TACO BELL 29341', 'WENDYS #482', 'FIVE GUYS CA-1207', 'PANERA BREAD #204', 'OLIVE GARDEN 0021', 'DUNKIN #350412', 'TST* THAI GARDEN', 'DOORDASH*BURGERS', 'RAISING CANES 402', 'DUTCH BROS #221']) {
      expect(cat(m), m).toBe('Dining')
    }
  })
  it('recognizes streaming, games, and events', () => {
    for (const m of ['PARAMOUNT+ SUBSCRIPTION', 'PEACOCK PREMIUM', 'CRUNCHYROLL MEMBERSHIP', 'NINTENDO ESHOP', 'REGAL CINEMAS 0421', 'TICKETMASTER EVENT', 'DAVE & BUSTERS #83', 'APPLE.COM/BILL SUBSCRIPTION']) {
      expect(cat(m), m).toBe('Entertainment')
    }
  })
  it('recognizes gas, rideshare, transit, parking, and auto care', () => {
    for (const m of ['CIRCLE K 09441', 'SPEEDWAY 8823', 'QUIKTRIP 0834', 'PARKMOBILE PHOENIX', 'FASTRAK CSC', 'AMTRAK .COM', 'HERTZ RENT-A-CAR', 'JIFFY LUBE #3041', 'CHARGEPOINT INC', 'DISCOUNT TIRE CO']) {
      expect(cat(m), m).toBe('Transport')
    }
  })
  it('recognizes retail', () => {
    for (const m of ['HOME DEPOT #6621', 'LOWES #02231', 'TJ MAXX #904', 'ROSS DRESS FOR LESS', 'NORDSTROM #032', 'DICKS SPORTING GOODS', 'PETSMART #1204', 'CHEWY.COM', 'DOLLAR TREE #2231', 'FIVE BELOW 5512', 'GAMESTOP #4419']) {
      expect(cat(m), m).toBe('Shopping')
    }
  })
  it('recognizes utilities, telecom, insurance, and subscriptions-as-bills', () => {
    for (const m of ['XFINITY MOBILE', 'SPECTRUM 855-707', 'DUKE ENERGY BILL PAY', 'SOCALGAS PAYMENT', 'GEICO *AUTO', 'STATE FARM INSURANCE', 'WASTE MANAGEMENT WM EZPAY', 'METRO PCS PAYMENT', 'GOOGLE ONE STORAGE', 'ADOBE CREATIVE CLOUD']) {
      expect(cat(m), m).toBe('Bills & Utilities')
    }
  })
  it('recognizes health, pharmacy, and fitness', () => {
    for (const m of ['RITE AID STORE 5521', 'QUEST DIAGNOSTICS', 'LA FITNESS MEMBER', 'ORANGETHEORY BREA', 'WARBY PARKER', 'DELTA DENTAL PPO', 'LABCORP HOLDINGS']) {
      expect(cat(m), m).toBe('Health')
    }
  })
  it('recognizes travel as a built-in category', () => {
    expect(CATEGORIES).toContain('Travel')
    expect(CATEGORY_COLORS['Travel']).toBeTruthy()
    for (const m of ['UNITED AIRLINES 0162', 'DELTA AIR LINES ATLANTA', 'SOUTHWEST AIRLINES', 'AIRBNB HMB4XYZ', 'MARRIOTT COURTYARD', 'HILTON GARDEN INN', 'EXPEDIA 7243', 'HAMPTON INN SEATTLE']) {
      expect(cat(m), m).toBe('Travel')
    }
  })
  it('keeps priority collisions sane', () => {
    expect(cat('METRO PCS PAYMENT')).toBe('Bills & Utilities') // not Transport's "metro"
    expect(cat('COSTCO GAS #441')).toBe('Transport')            // not Groceries' "costco"
    expect(cat('UBER EATS ORDER')).toBe('Dining')               // not Transport's "uber"
    expect(cat('CROSSFIT INVICTUS')).toBe('Health')             // not Shopping's "ross"
    expect(cat('UNITED HEALTHCARE PREM')).not.toBe('Travel')    // "united" alone must not mean airline
    expect(cat('DELTA DENTAL PPO')).not.toBe('Travel')
  })
  it('categorizes credit card bill payments as Transfers, not spending, even when the email body contains marketing text', () => {
    expect(categorize('WELLS FARGO CARD PAYMENT', 'Thank you for your payment. Earn 3% on dining and food purchases.', 'expense', [])).toBe('Transfers')
    expect(categorize('CHASE EPAY', '', 'expense', [])).toBe('Transfers')
    expect(categorize('Payment Received - Thank You', 'dining rewards summary', 'income', [])).toBe('Transfers')
    // generic payment words must still lose to specific utility merchant names
    expect(categorize('T-MOBILE AUTOPAY', '', 'expense', [])).toBe('Bills & Utilities')
    // merchant-only pass still works for ordinary dining transactions
    expect(categorize('CHIPOTLE 1178', 'random body text', 'expense', [])).toBe('Dining')
  })
})

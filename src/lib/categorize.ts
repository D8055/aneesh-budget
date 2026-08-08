import type { Rule } from '../types'

/** Built-in merchant word bank, applied after user rules. Patterns are lowercase substrings.
 * Priority ordering resolves collisions: overrides (90) run before every category block, and
 * more-specific categories (groceries/dining) run before broader ones (shopping/bills).
 * Modeled on the merchant-database approach commercial apps use (Plaid-style taxonomies),
 * hand-curated for the most common US chains. */
export const DEFAULT_RULES: Omit<Rule, 'id'>[] = [
  // Specific overrides that must beat their broader sibling rules
  ...[
    { p: 'metro pcs', c: 'Bills & Utilities' }, { p: 'metropcs', c: 'Bills & Utilities' }, { p: 'metro by t-mobile', c: 'Bills & Utilities' },
    { p: 'costco gas', c: 'Transport' }, { p: 'sams fuel', c: 'Transport' }, { p: "sam's club fuel", c: 'Transport' },
    { p: 'amazon fresh', c: 'Groceries' }, { p: 'walmart neighborhood', c: 'Groceries' },
    { p: 'uber eats', c: 'Dining' }, { p: 'ubereats', c: 'Dining' },
    { p: 'crossfit', c: 'Health' },
    { p: 'united health', c: 'Health' }, { p: 'delta dental', c: 'Health' },
    { p: 'apple.com/bill', c: 'Entertainment' },
    { p: 'gamestop', c: 'Shopping' },
    { p: 'socalgas', c: 'Bills & Utilities' }, { p: 'gas company', c: 'Bills & Utilities' },
    { p: 'natural gas', c: 'Bills & Utilities' }, { p: 'gas & electric', c: 'Bills & Utilities' },
  ].map(({ p, c }) => ({ pattern: p, category: c, priority: 90 })),

  // Groceries
  ...['trader joe', 'whole foods', 'safeway', 'kroger', 'costco', 'aldi', 'lidl', 'sprouts', 'grocery', 'market',
    'h mart', 'ralphs', 'vons', 'pavilions', 'wegmans', 'publix', 'albertsons', 'food 4 less', 'foodsco', 'fred meyer',
    'qfc', 'king soopers', 'city market', "smith's food", 'harris teeter', 'giant eagle', 'stop & shop', 'giant food',
    'food lion', 'hannaford', 'shoprite', 'price chopper', 'winn-dixie', 'piggly wiggly', 'heb ', 'h-e-b', 'meijer',
    'hy-vee', 'winco', 'save mart', 'stater bros', 'gelson', '99 ranch', 'mitsuwa', 'cardenas', 'vallarta', 'el super',
    'instacart', 'weee!', 'lucky #', 'bristol farms', 'seafood city', 'fiesta mart',
  ].map(p => ({ pattern: p, category: 'Groceries', priority: 100 })),

  // Dining — restaurants, fast food, coffee, delivery
  ...['chipotle', 'mcdonald', 'starbucks', 'doordash', 'grubhub', 'postmates', 'seamless', 'caviar',
    'restaurant', 'pizza', 'sushi', 'taco', 'cafe', 'coffee', 'chick-fil-a', 'panda express', 'in-n-out', 'subway',
    'wingstop', 'dining', 'boba', 'tea house', 'ramen', 'kbbq', 'bbq', 'burger', 'deli', 'bakery', 'donut',
    'ice cream', 'lunch', 'dinner', 'food',
    'burger king', 'wendy', 'taco bell', 'kfc', 'popeyes', 'qdoba', 'five guys', 'shake shack', 'whataburger',
    'sonic drive', 'jack in the box', "carl's jr", 'carls jr', 'hardee', "arby's", 'arbys', 'jersey mike', 'jimmy john',
    'firehouse subs', 'panera', 'pf chang', 'olive garden', 'applebee', 'chili', 'tgi friday', 'outback',
    'texas roadhouse', 'red lobster', 'denny', 'ihop', 'waffle house', 'cracker barrel', 'buffalo wild wings',
    'raising cane', 'zaxby', 'el pollo loco', 'del taco', 'dunkin', 'peet', 'philz', 'blue bottle', 'dutch bros',
    'tim horton', 'krispy kreme', 'baskin', 'cold stone', 'dairy queen', 'jamba', 'smoothie king', 'kung fu tea',
    'gong cha', 'sharetea', '85c', 'paris baguette', 'domino', 'papa john', 'little caesar', 'round table',
    'mod pizza', 'blaze pizza', 'noodles & co', 'wing', 'poke', 'pho ', 'thai', 'izakaya', 'taqueria', 'cantina',
    'steakhouse', 'buffet', 'grill', 'bistro', 'diner', 'eatery', 'brewery', 'brewhouse', 'taproom', 'shawarma',
    'kebab', 'biryani', 'hotpot', 'hot pot', 'tst*', 'tst *',
  ].map(p => ({ pattern: p, category: 'Dining', priority: 110 })),

  // Entertainment — streaming, gaming, events
  ...['netflix', 'spotify', 'hulu', 'disney', 'hbo', 'max.com', 'steam', 'playstation', 'xbox', 'nintendo',
    'amc', 'cinema', 'movie', 'concert', 'ticketmaster', 'stubhub', 'twitch', 'youtube premium', 'youtube tv',
    'crunchyroll', 'game', 'paramount+', 'paramount plus', 'peacock', 'apple tv', 'apple music', 'pandora',
    'audible', 'kindle', 'funimation', 'epic games', 'riot games', 'blizzard', 'roblox', 'minecraft', 'regal',
    'cinemark', 'theatre', 'theater', 'axs.com', 'seatgeek', 'eventbrite', 'livenation', 'live nation',
    'dave & buster', 'bowlero', 'topgolf', 'museum', 'zoo ', 'aquarium', 'six flags', 'universal studios',
    'disneyland', 'knott', 'arcade', 'karaoke', 'escape room', 'fandango', 'tidal',
  ].map(p => ({ pattern: p, category: 'Entertainment', priority: 120 })),

  // Transport — gas, rideshare, transit, parking, auto care
  ...['uber', 'lyft', 'shell', 'chevron', 'exxon', 'mobil ', 'arco', '76 ', 'gas', 'fuel', 'parking', 'metro',
    'transit', 'bart', 'caltrain', 'toll', 'valero', 'circle k', 'speedway', 'wawa', 'sheetz', 'quiktrip',
    'racetrac', 'pilot travel', "love's travel", 'casey', 'marathon petro', 'sunoco', 'phillips 66', 'bp#',
    'parkmobile', 'spothero', 'laz parking', 'impark', 'fastrak', 'e-zpass', 'ezpass', 'ipass', 'sunpass', 'txtag',
    'amtrak', 'greyhound', 'flixbus', 'megabus', 'mta ', 'cta ', 'septa', 'wmata', 'waymo', 'turo', 'zipcar',
    'hertz', 'avis', 'enterprise rent', 'budget rent', 'national car rental', 'alamo rent', 'jiffy lube',
    'valvoline', 'autozone', "o'reilly auto", 'oreilly auto', 'napa auto', 'pep boys', 'discount tire',
    'les schwab', 'firestone', 'goodyear', 'midas', 'meineke', 'car wash', 'smog', 'oil change', 'chargepoint',
    'evgo', 'electrify america', 'supercharg', 'blink charging', 'dmv',
  ].map(p => ({ pattern: p, category: 'Transport', priority: 130 })),

  // Shopping — retail, online, home improvement, pets, hobbies
  ...['amazon', 'amzn', 'target', 'walmart', 'wal-mart', 'best buy', 'nike', 'adidas', 'zara', 'uniqlo', 'h&m',
    'sephora', 'ulta', 'etsy', 'ebay', 'shein', 'temu', 'apple.com', 'apple store', "sam's club", 'sams club',
    "bj's wholesale", 'home depot', 'lowes', "lowe's", 'menards', 'ace hardware', 'harbor freight', 'ikea',
    'wayfair', 'overstock', 'bed bath', 'homegoods', 'tj maxx', 'tjmaxx', 'marshalls', 'ross dress', 'ross stores',
    'burlington', 'nordstrom', 'macy', 'bloomingdale', 'dillard', 'kohl', 'jcpenney', 'saks', 'neiman',
    'under armour', 'lululemon', 'athleta', 'gap #', 'old navy', 'banana republic', 'forever 21', 'aliexpress',
    'poshmark', 'mercari', 'depop', 'stockx', 'goat.com', 'foot locker', 'finish line', 'dsw', 'famous footwear',
    'vans store', 'converse', 'bath & body', "victoria's secret", 'aerie', 'american eagle', 'hollister',
    'abercrombie', 'urban outfitters', 'anthropologie', 'free people', 'rei ', 'rei.com', "dick's sporting",
    'dicks sporting', 'big 5 sporting', 'academy sports', 'bass pro', 'cabela', 'petco', 'petsmart', 'chewy',
    'michaels', 'joann', 'hobby lobby', 'staples', 'office depot', 'gamestop', 'barnes & noble', 'five below',
    'dollar tree', 'dollar general', 'family dollar', '99 cents', 'big lots',
  ].map(p => ({ pattern: p, category: 'Shopping', priority: 140 })),

  // Bills & Utilities — telecom, energy, insurance, software subscriptions
  ...['at&t', 'verizon', 't-mobile', 'comcast', 'xfinity', 'spectrum', 'pg&e', 'edison', 'water', 'electric',
    'internet', 'insurance', 'rent', 'utility', 'utilities', 'phone bill', 'sprint', 'mint mobile', 'cricket',
    'boost mobile', 'visible', 'google fi', 'cox comm', 'optimum', 'frontier comm', 'centurylink', 'windstream',
    'directv', 'dish network', 'sling', 'socalgas', 'sdge', 'con edison', 'coned', 'national grid', 'duke energy',
    'dominion energy', 'georgia power', 'fpl ', 'xcel energy', 'pse&g', 'ameren', 'dte energy', 'entergy',
    'waste management', 'republic services', 'recology', 'geico', 'progressive', 'state farm', 'allstate',
    'farmers ins', 'liberty mutual', 'nationwide ins', 'aaa member', 'hoa ', 'public storage', 'extra space',
    'adt ', 'dropbox', 'icloud', 'google one', 'google storage', 'microsoft 365', 'adobe', 'canva', 'openai',
    'chatgpt', 'lastpass', '1password',
  ].map(p => ({ pattern: p, category: 'Bills & Utilities', priority: 150 })),

  // Health — pharmacy, medical, fitness
  ...['cvs', 'walgreens', 'pharmacy', 'doctor', 'dental', 'medical', 'gym', 'fitness', '24 hour', 'planet fitness',
    'urgent care', 'clinic', 'kaiser', 'rite aid', 'quest diag', 'labcorp', 'one medical', 'orthodont', 'vision',
    'optometr', 'lenscrafters', 'warby parker', 'la fitness', 'equinox', 'orangetheory', 'ymca', 'crunch fit',
    'anytime fit', "gold's gym", 'golds gym', "barry's", 'soulcycle', 'corepower', 'yoga', 'pilates', 'therapy',
    'counseling', 'chiropract', 'massage envy', 'gnc ', 'vitamin shoppe', 'hospital', 'radiology', 'dermatolog',
    'pediatric', 'sutter', 'dignity health',
  ].map(p => ({ pattern: p, category: 'Health', priority: 160 })),

  // Travel — airlines, lodging, booking
  ...['united air', 'delta air', 'american air', 'southwest air', 'alaska air', 'jetblue', 'spirit air',
    'frontier air', 'hawaiian air', 'allegiant', 'airline', 'airways', 'air lines', 'expedia', 'booking.com',
    'priceline', 'kayak.com', 'hotels.com', 'hotwire', 'airbnb', 'vrbo', 'marriott', 'hilton', 'hyatt',
    'ihg ', 'holiday inn', 'best western', 'motel 6', 'super 8', 'la quinta', 'wyndham', 'sheraton', 'westin',
    'doubletree', 'hampton inn', 'courtyard', 'residence inn', 'embassy suites', 'four seasons', 'ritz-carlton',
    'hotel', 'resort', 'hostel', 'cruise', 'carnival cruise', 'royal caribbean', 'norwegian cruise',
    'tsa precheck', 'travel',
  ].map(p => ({ pattern: p, category: 'Travel', priority: 165 })),

  // Transfers — includes both sides of a credit card bill payment, so paying the
  // card never double-counts spending that was already captured at purchase time
  ...['transfer', 'zelle', 'atm', 'withdrawal', 'cash app', 'wire',
    'credit card payment', 'credit crd', 'card payment', 'autopay', 'auto pay', 'e-payment', 'epay',
    'online payment', 'payment thank you', 'thank you for your payment', 'payment received',
  ].map(p => ({ pattern: p, category: 'Transfers', priority: 170 })),

  // Income
  ...['payroll', 'direct dep', 'deposit', 'salary', 'paycheck', 'interest paid', 'refund', 'cashback', 'reimburse',
  ].map(p => ({ pattern: p, category: 'Income', priority: 180 })),
]

/** Pick a category for a transaction. User rules (priority < 90) win over defaults. */
export function categorize(
  merchant: string,
  rawText: string,
  direction: 'income' | 'expense',
  userRules: Rule[],
): string {
  const haystack = `${merchant} ${rawText}`.toLowerCase()
  const all = [...userRules, ...DEFAULT_RULES].sort((a, b) => a.priority - b.priority)
  for (const rule of all) {
    if (rule.pattern && haystack.includes(rule.pattern.toLowerCase())) return rule.category
  }
  return direction === 'income' ? 'Income' : 'Miscellaneous'
}

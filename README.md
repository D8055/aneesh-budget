# Aneesh's Budget

A personal budgeting PWA that unifies income and spending from **Charles Schwab** (card/checking) and **Venmo**, categorizes every transaction with rules (no AI), and shows whether the month is on track — all stored on-device (IndexedDB), no server.

## Everyday use

- **Home** — spent this month, the *month runway* (spending fill vs. the "today" marker: mint = on track, butter = pacing to overspend, blush = over), projected month-end, credit-card utilization bars, category breakdown, recent activity.
- **Activity** — search/filter all transactions; tap one to recategorize, optionally creating an "always categorize this merchant" rule; **+ Add** for manually entering past transactions (cash, older history) into any category.
- **Trends** — income vs. spending by month, plus per-category spending over time.
- **Settings** — CSV import, Gmail connection, monthly budget, credit cards (limit + balance → % used, colored green ≤30%, amber ≤75%, red above), custom categories (built-ins include Miscellaneous; removing a custom category moves its transactions there), rule management.

## Getting data in

### 1. Seed history with CSVs
- **Schwab**: log in → Accounts → History → Export (CSV) → import via *Settings → Import Schwab CSV*.
- **Venmo**: venmo.com → Statement → Download CSV → *Settings → Import Venmo CSV*.

Duplicates are skipped automatically (date + amount + merchant hash), so re-importing overlapping ranges is safe.

### 2. Live updates from Gmail — "Sign in with Google"
The app reads Schwab/Venmo **notification emails** (read-only) and turns them into transactions — on every app open and every 5 minutes while open. On the phone it's one tap: *Settings → Sign in with Google*.

One-time developer setup (so the button works):
1. Turn on per-transaction email alerts: Schwab → Profile → Alerts (card transactions, deposits); Venmo emails arrive by default for payments.
2. Create a free Google OAuth Client ID at https://console.cloud.google.com/ → *APIs & Services*:
   - Enable the **Gmail API**.
   - *OAuth consent screen*: External, add the Gmail address as a test user.
   - *Credentials → Create OAuth client ID → Web application*; under **Authorized JavaScript origins** add every origin the app is served from (e.g. `http://localhost:4173` and your hosting URL like `https://<username>.github.io`).
3. Copy `.env.example` to `.env`, set `VITE_GOOGLE_CLIENT_ID`, and run `npm run build`. The ID is baked into the app — nothing to paste on the phone. (A per-device override still exists under *Settings → Advanced setup*.)

## Installing on a phone

### iPhone (requires hosting — Safari only installs PWAs from HTTPS)
There is no USB-install trick on iOS, so put the built app on free static hosting. GitHub Pages example:
1. Create a GitHub repository and push this project.
2. Build with `npm run build`, then publish the `dist/` folder to Pages (Settings → Pages → deploy from branch, or push `dist` to a `gh-pages` branch).
3. Add the resulting `https://…github.io` origin to the OAuth client's **Authorized JavaScript origins** and rebuild/redeploy.
4. On the iPhone: open the URL in **Safari** → Share → **Add to Home Screen**. Updates arrive automatically on next open.

Only the app code is hosted — every transaction stays in the phone's local storage.

### Android (USB, no hosting)
One-time PC setup: install [Android platform-tools](https://developer.android.com/tools/releases/platform-tools) (for `adb`), and enable **Developer options → USB debugging** on the phone.

1. On the PC:
   ```
   npm run build
   npm run preview        # serves the built app on port 4173
   adb reverse tcp:4173 tcp:4173
   ```
2. On the phone (connected via USB): open Chrome → `http://localhost:4173` → menu → **Add to Home screen / Install app**.
3. Unplug. The installed app keeps working offline; plug back in and repeat step 1–2 after code updates (the service worker auto-updates).

> `localhost` counts as a secure origin on Android, which is what makes both the PWA install and Google OAuth work without hosting.

## Development

```
npm install
npm run dev       # dev server
npm test          # vitest unit tests (parsers, categorizer, projection)
npm run build     # typecheck + production build to dist/
npm run icons     # regenerate PWA icons (scripts/gen-icons.mjs)
```

Stack: Vite + React + TypeScript, Dexie (IndexedDB), Recharts, PapaParse, vite-plugin-pwa. Fonts: Space Grotesk (display/numbers) + Karla (body), bundled locally for offline use.

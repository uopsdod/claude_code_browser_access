---
name: how-to-access-kayak
description: Practical playbook for scraping kayak.com — flight search, the /trips page, cookie-based authentication, and bot-detection evasion. Use when the user wants to query flight prices, read their saved trips, create or modify trips, or automate any kayak.com workflow with Playwright/curl. Captures what worked, what got blocked, and the empirical truth about which cookie matters.
---

# How to access kayak.com

A field-tested guide to scraping `kayak.com` — what works, what gets blocked, and the empirical findings about its auth & bot-detection system.

## Prerequisites

This skill assumes the project layout described in `CLAUDE.md` at the repo root. Specifically:

- Node.js + Playwright installed (`npm install && npx playwright install chromium`)
- A `lib/kayak-cookies.js` file with values captured from a signed-in Kayak session — see the `get-all-cookies-of-a-site` skill for capture steps and `lib/kayak-cookies.example.js` for the shape
- Drivers run from the repo root: copy `trips/kayak-trip.example.js` → `trips/<your-name>.js`, edit the config, then `node trips/<your-name>.js`

If you're reading this skill in isolation without that scaffolding, start with `CLAUDE.md` first.

## When this skill applies

- Querying flight search results from `https://www.kayak.com/flights/<O>-<D>/<YYYY-MM-DD>`
- Reading the user's saved trips at `/trips`
- Creating or modifying a trip via Playwright
- Any kayak.com automation that needs to "act like a logged-in human"

## ⚠️ Rule #1 — Never inject Kayak cookies via the Playwright MCP

The Playwright **MCP** only lets you set cookies through `document.cookie` in `browser_evaluate`. By browser design, `document.cookie` **cannot set HttpOnly cookies** — and every load-bearing Kayak auth cookie is HttpOnly: `p1.med.sid`, `kayak.mc`, `Apache`, `p1.med.stoken`, `p1.med.token`, `kmkid`, `mtoken.*`. The MCP path will navigate fine, but `/trips` will render the signed-out "Sign in to plan your trip" landing page. This was verified empirically on 2026-05-11 and is not worth re-attempting.

**When the user pastes Kayak cookies in chat, do this instead:**

1. **Transcribe** the pasted DevTools table into `lib/kayak-cookies.js` — same shape as `lib/kayak-cookies.example.js` (fields: `name`, `value`, `domain`, `path`, `httpOnly`, `secure`, `sameSite`). Trust the HttpOnly / Secure / SameSite columns from DevTools verbatim. Overwrite the file.
2. **Write a small driver** at `trips/<name>.js` that does:
   ```javascript
   const { launchWithCookies } = require('../lib/playwright-chromium');
   const cookies = require('../lib/kayak-cookies');
   (async () => {
     const { browser, page } = await launchWithCookies(cookies);
     // ... navigate, scrape, close ...
     await browser.close();
   })();
   ```
   `launchWithCookies` wraps `context.addCookies()`, which DOES set HttpOnly.
3. **Run** with `node trips/<name>.js`.

The Playwright MCP is still the right tool for **anonymous** Kayak access (e.g. step 2.2 of the demo ladder — flight search by URL with no cookies). Reserve MCP for stateless reads; reserve the Node path for anything authenticated.

## ⭐ End-to-end recipe — create a Trip + attach the cheapest flight

This is the "find a cheap ticket from X to Y for date D and put it in a new trip" flow, distilled from a verified working session. Use this template; only the destination, dates, and trip name should change.

```javascript
// add-cheap-trip.js
const { chromium } = require('playwright');
const cookies = require('./cookies.js'); // see "Auth findings" — only p1.med.sid is load-bearing for reads, but include the full set for write flows

// === CONFIG ===
const ORIGIN     = 'TPE';
const DEST_IATA  = 'MAD';                // airport code used in the search URL
const DEST_LABEL = 'Madrid';             // typed into the Create-Trip destination input
const DEPART     = '2026-06-10';         // YYYY-MM-DD for the search URL
const START_ARIA = 'June 10, 2026';      // aria-label on the calendar cell
const END_ARIA   = 'June 17, 2026';      // Start + 7 days minimum, or Save silently 200's
const TARGET_MONTH = 'June 2026';        // <caption> string in the calendar grid
const TRIP_NAME  = 'Spain Trip';

(async () => {
  const browser = await chromium.launch({ channel: 'chromium', headless: false });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
  });
  await context.addCookies(cookies);
  const page = await context.newPage();

  // --- 1. Create the empty Trip ---
  await page.goto('https://www.kayak.com/trips', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await page.getByRole('button', { name: 'Create Trip' }).first().click();
  await page.waitForTimeout(2500);

  // Destination autocomplete
  const destInput = page.locator('input[type="text"]').nth(0);
  await destInput.click();
  await destInput.fill(DEST_LABEL);
  await page.waitForTimeout(2000);
  const opt = page.locator(`[role="option"]:has-text("${DEST_LABEL}"), li:has-text("${DEST_LABEL}")`).first();
  if (await opt.count() > 0) await opt.click(); else await page.keyboard.press('Enter');
  await page.waitForTimeout(1000);

  await page.getByLabel(/^Trip name$/i).fill(TRIP_NAME);

  // Helper — navigate calendar grid to TARGET_MONTH, then click the day cell.
  // The "next month" arrow has NO aria-label. It's the 2nd icon-only
  // <div role="button"> inside <div class="OV9e-month-nav">.
  async function pickDate(targetCaption, targetAriaLabel) {
    const cur = () => page.evaluate(() =>
      document.querySelector('[role="grid"] caption')?.textContent.trim() || '');
    let safety = 12;
    while ((await cur()) !== targetCaption && safety-- > 0) {
      await page.locator('.OV9e-month-nav > div[role="button"]').nth(1).click();
      await page.waitForTimeout(700);
    }
    await page.locator(`[aria-label="${targetAriaLabel}"]`).first().click();
  }

  // Start date trigger label always begins "Change date, <weekday>, <today>".
  // Use the .first() loose match so today's exact weekday doesn't matter:
  await page.locator('div[role="button"][aria-label^="Change date,"]').first().click();
  await page.waitForTimeout(1500);
  await pickDate(TARGET_MONTH, START_ARIA);
  await page.waitForTimeout(1500);

  // End date trigger is the 2nd "Change date" element after Start is set.
  await page.locator('div[role="button"][aria-label^="Change date,"]').nth(1).click();
  await page.waitForTimeout(1500);
  await pickDate(TARGET_MONTH, END_ARIA);
  await page.waitForTimeout(1500);

  await page.getByRole('button', { name: 'Save' }).first().click();
  await page.waitForTimeout(6000);

  // --- 2. Search for the cheapest flight ---
  // Warm up first to look human, then go to the price-asc search.
  await page.goto('https://www.kayak.com/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.goto(`https://www.kayak.com/flights/${ORIGIN}-${DEST_IATA}/${DEPART}?sort=price_a`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(20000); // results stream in via XHR

  // Pick the first ORGANIC result card (skip sponsored "Ad" cards).
  // Strategy: walk divs; require a price, a time, "stop"/"nonstop", reasonable
  // text length, and NO "Ad disclaimer" text. Tag the Save heart inside it.
  const tagged = await page.evaluate(() => {
    for (const el of document.querySelectorAll('div')) {
      const t = el.innerText || '';
      if (!/\$\d{2,4}\b/.test(t)) continue;
      if (!/\d{1,2}:\d{2}/.test(t)) continue;
      if (!/(stop|nonstop)/i.test(t)) continue;
      if (t.length > 1000) continue;
      if (/Ad disclaimer/.test(t)) continue;
      const save = el.querySelector('[aria-label="Save"]');
      if (save) { save.setAttribute('data-cheap', '1'); return t.slice(0, 200).replace(/\s+/g,' '); }
    }
    return null;
  });
  if (!tagged) throw new Error('No organic flight card found.');
  console.log('Saving cheapest flight:', tagged);

  // --- 3. Click Save → pick the trip ---
  await page.locator('[data-cheap="1"]').first().click();
  await page.waitForTimeout(3500);
  await page.locator(`[role="button"][aria-label^="Save to ${TRIP_NAME}"]`).first().click();
  await page.waitForTimeout(5000);

  // --- 4. Verify ---
  await page.goto('https://www.kayak.com/trips', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await page.locator(`a:has-text("${TRIP_NAME}")`).first().click();
  await page.waitForTimeout(5000);
  const ok = await page.evaluate(() =>
    /1 saved item|1 flight/i.test(document.body.innerText));
  console.log('Flight attached to trip:', ok);
  await browser.close();
})();
```

### What this recipe handles that ad-hoc scripts get wrong

1. **Date picker shows ONE month.** The helper reads `<caption>` of `[role="grid"]` and clicks `.OV9e-month-nav > div[role="button"]:nth-of-type(2)` until the caption matches the target. The next-month arrow has no aria-label or text — only the structural selector works.
2. **Start/End date triggers** are `<div role="button">`, not `<button>`. The `^="Change date,"` prefix match doesn't depend on which weekday today is. Use `.first()` for Start, `.nth(1)` for End.
3. **End ≥ Start + 7 days.** Anything shorter and the POST silently 200's; the trip doesn't appear.
4. **The first flight card is usually an Ad.** Filter on absence of `"Ad disclaimer"` in the card's innerText before tagging its Save button.
5. **Many `aria-label="Save"` elements exist** (one per result card). Tag the specific one inside your chosen card with `data-cheap="1"` then locate that — don't grab `.first()` on a global Save selector.
6. **The trip picker dialog is outside the card.** After clicking Save, use a page-level selector `[role="button"][aria-label^="Save to <Trip Name>"]`.

### Adapting to other origins/destinations/dates

Only `ORIGIN`, `DEST_IATA`, `DEST_LABEL`, `DEPART`, `START_ARIA`, `END_ARIA`, `TARGET_MONTH`, `TRIP_NAME` change. If the trip spans months, call `pickDate` with the correct caption for the end-date click — the helper already advances forward but not backward, so order Start before End.

## Quick map of kayak.com surfaces

| URL | Auth needed? | JS-rendered? | Bot defense |
|---|---|---|---|
| `/flights/<O>-<D>/<DATE>` | No | **Yes** (SSR'd flight cards exist for the ?q=... variant; the direct path is JS-only) | Aggressive — easy to trigger redirect to `/help/bots.html` |
| `/trips` | **Yes** (HttpOnly cookie) | Yes | Lighter on read; users with a valid session pass |
| `/trips` POSTs (Create Trip) | Yes | Yes | **Strictest** — Forter fingerprint checks block synthetic browsers |
| `/help/bots.html` | — | — | This is the "you've been flagged" page. If you land here, your fingerprint failed. |

## Auth findings (empirically verified)

These are the cookies Kayak sets after a Google-SSO sign-in. Tested by injecting subsets into a clean Playwright context and probing whether `/trips` rendered real user data.

| Cookie | Role | Required for `/trips` read? |
|---|---|---|
| **`p1.med.sid`** | Active session ID (HttpOnly, Secure, Session-scoped, ~65 chars) | ✅ **Sufficient on its own** |
| `p1.med.token` | Likely CSRF (HttpOnly, Secure, ~22 chars, 6-month TTL) | ❌ Not needed for reads. Probably required for state-changing POSTs. |
| `p1.med.stoken` | Some session-bound secret (HttpOnly, Secure, ~55 chars) | ❌ Not needed; server does NOT auto-mint a new sid from it on GET |
| `kmkid` | User/member ID | ❌ Not needed for read; cosmetic |
| `kayak.mc` | Member context blob (~415 chars, HttpOnly, Secure) | ❌ Not needed for read |
| `mtoken.MLR99PXhVgA` | Persistent member token ("remember me") | ❌ Not needed for read |
| `mst_*` family (`mst_ADIrkw`, `mst_iBfK2g`, `mst_client`) | Anti-bot session tokens (HttpOnly, not Secure) | ❌ Not needed for read |
| `ssocontrol` | UI hint: SSO state (value = "googlelogout" or "googlestatus") | ❌ Cosmetic |

**The headline:** one cookie — `p1.med.sid` — is the entire lock on read access. It's HttpOnly, so `document.cookie` cannot see it; the user must copy it from DevTools → Application → Cookies.

## Reading the `/trips` page

```javascript
// playwright
const { chromium } = require('playwright');

const cookies = [{
  name: 'p1.med.sid', value: '<COPY_FROM_DEVTOOLS>',
  domain: 'www.kayak.com', path: '/',
  httpOnly: true, secure: true, sameSite: 'None',
}];

(async () => {
  const browser = await chromium.launch({ channel: 'chromium', headless: true });
  const context = await browser.newContext();
  await context.addCookies(cookies);
  const page = await context.newPage();
  await page.goto('https://www.kayak.com/trips', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000); // /trips fetches via XHR after mount

  const trips = await page.evaluate(() => {
    const cards = document.querySelectorAll('[class*="trip" i]');
    return [...cards].map(c => c.innerText.trim().replace(/\s+/g, ' '))
      .filter(t => /(Sun|Mon|Tue|Wed|Thu|Fri|Sat),/.test(t) && t.length < 200);
  });
  console.log(trips);
  await browser.close();
})();
```

The page renders cards like `"London Trip details London Trip Sun, May 10 – Sat, May 16 1 0 0 0 0 0"`.

## Flight search

### Path A — direct URL (most reliable when it works)

```
https://www.kayak.com/flights/<ORIGIN>-<DEST>/<YYYY-MM-DD>?sort=price_a
```

Example: `https://www.kayak.com/flights/TPE-SFO/2026-06-21?sort=price_a`

**Pitfalls:**

- **Synthetic Playwright contexts often get redirected to `/help/bots.html`.** Bot detection fires on the search request. Symptoms: `page.url()` ends with `/help/bots.html` after navigation.
- **Logged-in cookies help bypass the redirect**, but Kayak may still serve an empty page (0 result wrappers).
- A **real-browser User-Agent** + viewport + locale is required:
  ```javascript
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
  });
  ```
- **Warm-up navigation helps.** Visit `https://www.kayak.com/` first, wait 2–3 seconds, then go to the search URL. Looks more human.
- Allow **10–15 seconds** after `domcontentloaded` — results stream in via polling XHRs, not all at once.

### Extracting flight cards

The class names rotate. Don't lock to a specific class — match by content:

```javascript
const flights = await page.evaluate(() => {
  // Older approach: '[class*="resultWrapper"]' — sometimes empty
  // Better: scrape <li> / div elements with both $ and route codes
  const candidates = Array.from(document.querySelectorAll('li, div'));
  return candidates
    .map(el => el.innerText?.trim().replace(/\s+/g, ' '))
    .filter(t => t && /\$\d/.test(t) && /(TPE|SFO|HND|NRT|nonstop|stop)/i.test(t) && t.length < 500)
    .slice(0, 10);
});
```

Better yet: parse the page text. When `[class*="resultWrapper"]` returns 0, the text body still contains rendered flight details — grep it.

### Path B — query string (lazy but Google-Travel-style)

Some Kayak URLs accept `?q=` natural-language style; not as reliable as the canonical path. Skip unless the canonical fails.

## Rule #0 — Dump the DOM before guessing selectors

Before reaching for `getByRole('button')`, `getByLabel(...)`, or any other semantic selector, **dump the post-JS-rendered HTML of the relevant container and read it.** The DOM is the only source of truth; everything else is a guess that silently returns zero matches when wrong.

```javascript
// After the page/modal has hydrated:
const html = await page.evaluate(() => {
  const root = document.querySelector('[role="dialog"]') || document.body;
  return root.outerHTML;
});
console.log(html);
```

Or for a readable structural snapshot:
```javascript
const structure = await page.evaluate(() => {
  const root = document.querySelector('[role="dialog"]') || document.body;
  return Array.from(root.querySelectorAll('*')).slice(0, 80).map(el =>
    `<${el.tagName.toLowerCase()}${el.getAttribute('role') ? ` role="${el.getAttribute('role')}"` : ''}${el.getAttribute('aria-label') ? ` aria-label="${el.getAttribute('aria-label')}"` : ''}> ${(el.innerText || '').slice(0, 40).replace(/\s+/g, ' ')}`
  );
});
console.log(structure.join('\n'));
```

Only after you've actually seen the markup, pick selectors. **Don't assume `<button>` — check.** Modern sites use `<div role="button">`, `<a role="button">`, custom Web Components, etc. The kayak.com Create-Trip date trigger is literally a `<div role="button">` and that single fact derailed a session because I assumed.

This rule has higher priority than every other section of this document.

## Creating a trip via Playwright (✅ verified working)

**Verified end-to-end with auth cookies + correct date selection.** The whole flow runs through pure Playwright; no CDP, no stealth plugin needed. Forter is NOT the blocker here.

```javascript
await page.goto('https://www.kayak.com/trips');
await page.waitForTimeout(5000);

// Two "Create Trip" buttons exist; use .first()
await page.getByRole('button', { name: 'Create Trip' }).first().click();
await page.waitForTimeout(2500);

// Modal fields:
//   1. <input> aria-label "Search for a country or language" — irrelevant footer widget
//   2. <input type="text"> nth(0) inside dialog — DESTINATION (autocomplete combobox)
//   3. <input> aria-label "Trip name"
//   4. <input type="radio" value="public"> / value="private"
//   5. <div role="button" aria-label="Change date, Sunday, May 10, 2026"> — Start date
//   6. <div role="button" aria-label="Change date, Monday, May 11, 2026"> — End date

// --- Destination ---
const destInput = page.locator('input[type="text"]').nth(0);
await destInput.click();
await destInput.fill('San Francisco');
await page.waitForTimeout(2000);
const sfOption = page.locator('[role="option"]:has-text("San Francisco"), li:has-text("San Francisco")').first();
if (await sfOption.count() > 0) await sfOption.click();
else await page.keyboard.press('Enter');

// --- Trip name ---
await page.getByLabel(/^Trip name$/i).fill('San Francisco Trip');

// --- End date: advance to at least 1 week after Start ---
//
// CRITICAL GOTCHA: The "End date" trigger is NOT a real <button>. It's a
// <div role="button" aria-label="Change date, Monday, May 11, 2026">.
// Matching with page.getByRole('button', ...) or 'button[aria-label=...]'
// returns ZERO elements and times out. You MUST select div[role="button"]:
await page.locator('div[role="button"][aria-label^="Change date, Monday"]').click();
await page.waitForTimeout(2500);

// In the date picker, cells have aria-label like "May 17, 2026".
// Pick End >= Start + 7 days; Kayak's API silently 200-rejects trips
// where End equals the default (Start + 1 day).
await page.locator('[aria-label*="May 17, 2026"]').first().click();
await page.waitForTimeout(2000);

// === If the target date is in a FUTURE month (next month or later) ===
// The picker shows ONE month at a time, starting on the currently-selected
// month (May 2026 by default). To pick e.g. Jun 10:
//
//   1. Open the date trigger (start or end), as above.
//   2. Read the current month from <caption> inside [role="grid"]:
//        await page.evaluate(() => document.querySelector('[role="grid"] caption').textContent.trim())
//      → "May 2026"
//   3. Click the "next month" arrow until the caption matches the target.
//      Month-nav buttons live in <div class="OV9e-month-nav"> as two icon-only
//      <div role="button" class="c1fvi"> children — NO aria-labels, just SVG.
//      Index [0] = previous, [1] = next.
//   4. Then click the target day cell by aria-label, e.g. "June 10, 2026".
//
// Note: do NOT rely on a "next month" aria-label or text — there is none.
// Select by structural position: `.OV9e-month-nav > div[role="button"]`.
async function pickFutureDate(targetMonthYear /* e.g. "June 2026" */, targetAriaLabel /* "June 10, 2026" */) {
  const captionNow = () => page.evaluate(() =>
    document.querySelector('[role="grid"] caption')?.textContent.trim() || '');
  let cap = await captionNow();
  let safety = 12;
  while (cap !== targetMonthYear && safety-- > 0) {
    await page.locator('.OV9e-month-nav > div[role="button"]').nth(1).click();
    await page.waitForTimeout(800);
    cap = await captionNow();
  }
  await page.locator(`[aria-label="${targetAriaLabel}"]`).first().click();
}

// Usage (after opening Start picker):
//   await pickFutureDate('June 2026', 'June 10, 2026');
// Then re-open End picker and call again:
//   await pickFutureDate('June 2026', 'June 17, 2026');

// --- Save ---
await page.getByRole('button', { name: 'Save' }).first().click();
await page.waitForTimeout(6000);

// --- Verify ---
await page.goto('https://www.kayak.com/trips');
await page.waitForTimeout(4000);
const present = await page.evaluate(() =>
  /San Francisco Trip/i.test(document.body.innerText)
);
// → true; the new trip appears in the Upcoming list with correct dates.
```

### Why Save can silently fail — ranked by what actually happened in testing

1. **DOM mismatch — the End date trigger is a `<div role="button">`, not `<button>`.** This was the real blocker in the talk demo. `getByRole('button', ...)` and `button[aria-label=...]` both return 0 matches. Always use `[role="button"]` or just `[aria-label*="..."]`.
2. **End date == Start date + 1 day** (or earlier) — Kayak's backend silently 200's the POST and the trip never appears. Empirically Start + 7 days works. Smaller deltas not tested.
3. **`Escape` key kills the modal.** Don't press Escape to close the date picker — it closes the entire Create Trip modal and discards your form values. The picker auto-closes after a date click.
4. **Bot fingerprinting (Forter)** — was assumed to be the blocker but turned out to be a red herring. Save works fine through pure Playwright with the auth cookies; no stealth plugin or CDP connection needed. Reserve this hypothesis for write flows that actually fail.
5. **Target date in a future month, but never navigated there.** The Create-Trip date picker shows ONE month at a time and defaults to the currently-selected month (today's month). If you only `page.locator('[aria-label*="June 10, 2026"]')` without first clicking the next-month arrow, the locator matches 0 elements and times out. Read `<caption>` of `[role="grid"]` to know what month is visible, then click `.OV9e-month-nav > div[role="button"]:nth-of-type(2)` until it matches. See `pickFutureDate` helper above.

## Saving a flight result into an existing Trip (✅ verified working)

The `/trips` Create-Trip modal does NOT have an "Add flight" button on the trip detail page. The "Add location" / "Add note" buttons are for places-of-interest only. The actual way to attach a flight is from the search results page:

1. Each flight card on `/flights/<O>-<D>/<DATE>` has a heart-icon `<div role="button" aria-label="Save">` with class starting `AFFP`. There are many `aria-label="Save"` elements on the page (one per card).
2. Clicking it opens a `Save to Trip` bottom-sheet `<div role="dialog">` listing all the user's trips. Each option is `<div role="button" aria-label="Save to <Trip Name>, <date range>">`.
3. Clicking the trip option attaches the flight (no further confirmation), and the trip detail page now shows the flight under "Itinerary > Flights > <date>".

```javascript
// Find the cheapest organic card (skip ad rows containing "Ad disclaimer")
// and tag its Save button. Match the card by its price (e.g. "$474").
const found = await page.evaluate(() => {
  for (const el of document.querySelectorAll('div')) {
    const t = el.innerText || '';
    if (!/\$474\b/.test(t)) continue;
    if (!/\d{1,2}:\d{2}/.test(t)) continue;
    if (!/(stop|nonstop)/i.test(t)) continue;
    if (t.length > 1000) continue;
    if (/Ad disclaimer/.test(t)) continue;       // skip sponsored row
    const save = el.querySelector('[aria-label="Save"]');
    if (save) { save.setAttribute('data-target', '1'); return true; }
  }
  return false;
});
await page.locator('[data-target="1"]').click();
await page.waitForTimeout(3500);

// Pick the destination trip in the picker. Match by the prefix of aria-label.
await page.locator('[role="button"][aria-label^="Save to Spain Trip"]').first().click();
await page.waitForTimeout(5000);

// Verify by visiting the trip detail page; itinerary should now list the flight.
```

Gotchas:
- The first card on the results page is often a **sponsored Ad** (e.g. Etihad Book direct). Filter on `Ad disclaimer` absence or skip the first card.
- `aria-label="Save"` appears many times; selecting "first" without scoping to your target card will save the wrong flight.
- The picker `<div role="dialog">` is OUTSIDE the card; do NOT scope the picker query to the card element.

### Mitigations for the bot-fingerprint problem

If a properly-dated submission still silently fails:

- **`launchPersistentContext('./userdata-dir')`** — long-lived Chromium profile, lets Forter build a fingerprint that survives across runs.
- **`chromium.connectOverCDP('http://localhost:9222')`** — connect to the user's REAL Chrome, started with `--remote-debugging-port=9222`. Uses the daily-driver browser's accumulated fingerprint. Most reliable for write actions. Cleanest demo: "AI controlled the Chrome I'm already signed into."
- **`playwright-extra` + stealth plugin** — spoofs the automation signals Kayak/Forter check (navigator.webdriver, plugin enumeration, WebGL renderer). Works some of the time.

## Bot defense — what triggers it

Things that get flagged, in rough order of severity:

1. **Vanilla Playwright Chromium** without UA / viewport / locale overrides → redirected to `/help/bots.html` on the first /flights/ request.
2. **No referrer chain** — going directly to a deep URL without warming up on the homepage.
3. **Headless: true** with default flags. Use `headless: false` for the demo or pass anti-detection flags.
4. **State-changing POSTs** from any synthetic context, regardless of cookies. Reads are tolerated; writes are gated by Forter.
5. **Same Playwright session making >5 search requests in a minute.** Rate-limited.

## Curl alternatives

Reads through `curl` work for the SSR'd Google Flights-style search but **not** for kayak.com's flight search — the rendered cards are client-only on the canonical `/flights/` path. The `/trips` page also requires JS to render the cards even with valid cookies.

So: `curl` is poor for kayak. Either use Playwright, or reverse-engineer the underlying XHR endpoints (DevTools Network tab → find the JSON call → curl that directly).

## Recommended workflows

**Just want flight prices?** → Playwright with real UA + viewport + locale, warm up on homepage, then navigate to `/flights/<O>-<D>/<DATE>?sort=price_a`, wait 10–15s, scrape page text.

**Want saved trips?** → Playwright with `p1.med.sid` cookie injected, GET `/trips`, wait 5s, scrape card text. Simplest path.

**Want to *create* a trip, or attach a cheap flight to a new trip?** → Use the [⭐ End-to-end recipe](#-end-to-end-recipe--create-a-trip--attach-the-cheapest-flight) near the top of this skill. Pure Playwright + the cookie set works; CDP/stealth is NOT needed for either Create-Trip or Save-to-Trip. The recipe handles the four real gotchas (date-picker month nav, End ≥ Start+7d, ad-card skip, scoped Save selector).

**Want to monitor prices over time?** → Save a `storageState.json`, then run a cron job that re-uses it. Read-only watches are reliable; sending alerts (Slack/email) doesn't touch Kayak at all so no bot risk.

## Demo flow (the 2.x ladder)

This is the talk structure that the kayak case study supports end-to-end:

| Step | Demo | Punchline |
|---|---|---|
| 2.1 | `WebFetch` on `/flights/TPE-TYO/2026-06-15` | Sees only static HTML; truncates on size; no flight data |
| 2.2 | Playwright on same URL | Sees rendered cards: airlines, prices, durations |
| 2.3 | Playwright + `p1.med.sid` on `/trips` | Sees the user's actual saved trips (London, Moscow) |
| 2.4 | Playwright + cookies + interaction (Create Trip) | Form fills, dates set, Save succeeds, new trip appears on /trips. The DOM-debugging journey itself is the demo — chasing `<div role="button">`, the End-date-must-be-Start+7-days gotcha, and the unlabeled `.OV9e-month-nav` arrow. |
| 2.5 | Playwright finds cheapest flight + Save-to-Trip | Search `/flights/TPE-MAD/...?sort=price_a`, skip Ad cards, click heart, pick "Save to <Trip Name>" in the bottom-sheet. Trip detail page now shows the flight under Itinerary. Closes the loop: "AI booked the trip end-to-end." |
| 2.6+ | `connectOverCDP` to real Chrome (or stealth) | Useful escape hatch for sites where pure Playwright IS blocked by fingerprinting (e.g. stricter retail / banking flows). Kayak does NOT need this. |

## Common pitfalls

- **`/help/bots.html`** — your fingerprint failed; restart with real UA/viewport/locale and warm up on homepage.
- **`wrapperCount: 0`** — page loaded but rendered empty; usually rate-limited or fingerprint-suspect.
- **Save click "succeeds" but no trip appears** — End date <= Start date, or Forter dropped the POST.
- **`ssocontrol: googlelogout` after login** — misleading name; you're actually signed in. It's a UI hint, not a state.
- **Session cookies (`p1.med.sid`) die when the original browser closes.** Re-grab right before running.
- **Class names rotate** (`resultWrapper-XYZ12`). Don't match by class; match by content (`$`, `TPE`, `Nonstop`, etc.).

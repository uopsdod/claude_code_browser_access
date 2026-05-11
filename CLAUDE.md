# Kayak-probe → universal-site-probe

## What this project is

A working template for **accessing any logged-in website from Claude Code via Playwright + replayed session cookies**. Pivoted from a kayak.com case study, but the pattern generalizes to any site where:

- You can sign in manually in a browser
- Authentication is cookie-based (HttpOnly session cookies are fine — we copy them via DevTools)
- The site renders client-side (so plain `curl` / WebFetch can't see anything useful)

Currently exercised against two production sites:

- **`https://www.kayak.com/`** — flight search, `/trips` create/edit, save-to-trip
- **`https://calendar.google.com/calendar/u/2/r/month/2026/6/1`** — calendar reads, one-shot event creation

## 🚀 First-time setup

Read this section first if you just cloned the repo. The whole pipeline runs locally; no servers, no API keys.

**Prefer guided setup?** Ask Claude Code to invoke the `set-up-checklist` skill — it walks through these steps interactively and confirms each one. The skill is at `.claude/skills/set-up-checklist/SKILL.md`.

### 1. System prereqs

- **Node.js 18+** (verify with `node -v`)
- **npm** (ships with Node)
- A **Chromium-capable machine** — Playwright will download its own Chromium build in step 2; you don't need Chrome pre-installed, but you do need ~300MB of disk

### 2. Install dependencies

```bash
npm install
npx playwright install chromium
```

The first command pulls `playwright` from `package.json`. The second downloads Playwright's bundled Chromium build — **easy to forget**; scripts will fail with a cryptic "Executable doesn't exist at .../chrome-mac/Chromium.app" if you skip it.

### 3. Capture session cookies

The repo does NOT ship cookies — those are credentials. You provide your own.

For each site you want to use:

1. Open the site in your browser (Chrome/Edge/Brave/Arc) and **sign in**
2. Verify the logged-in page loads (e.g. `https://www.kayak.com/trips` shows your trip list, not "Sign in")
3. Follow the **`get-all-cookies-of-a-site`** skill in `.claude/skills/` — quick version:
   - Open DevTools (`⌘⌥I` Mac, `F12` Win/Linux)
   - Application tab → Storage → Cookies → click the site's domain row
   - Clear the filter box at the top
   - Select all rows + Cmd/Ctrl+C
4. Paste the rows to Claude Code or transcribe into the cookie file

> ⚠️ **DevTools cookie table virtualizes rows** — and that breaks Cmd+A in newer Chrome/Edge builds. If your paste is missing the cookies you can see in the table (e.g. you see `p1.med.sid` in DevTools but it's not in your paste), use the **resize + scroll trick** instead:
>
> 1. **Maximize the DevTools panel** — drag the splitter up, or undock DevTools into its own window (the three-dot menu → "Dock side" → "Undock"). The taller the panel, the more rows render at once.
> 2. **Make the cookie table as tall as possible** so as many rows as possible are visible without scrolling.
> 3. **Scroll the cookie table to the top.**
> 4. **Click the first row**, then **Shift+Click the last row** (do NOT use Cmd+A — Shift-click forces a render across the virtualized range that Cmd+A skips).
> 5. **Cmd+C** to copy, paste here.
> 6. If the table is still longer than your panel, do it in 2–3 chunks (scroll, click, shift-click last visible, copy; scroll more, repeat) and paste each chunk — Claude can dedupe across pastes.
>
> Symptom that you hit the virtualization bug: your paste has only the visible rows from the moment you clicked, and the cookies that scrolled off-screen are missing.
>
> Alternative if this keeps biting: install the open-source [Cookie-Editor](https://cookie-editor.com/) extension and use its "Export → JSON" — it bypasses the virtualization entirely.

### 4. Create the cookie files

The repo ships example placeholder files:

```bash
cp lib/kayak-cookies.example.js lib/kayak-cookies.js
cp lib/gcal-cookies.example.js  lib/gcal-cookies.js
```

Open each `.js` (NOT the `.example.js`) and replace every `REPLACE_ME` with the value from your DevTools capture. The example files document which cookies matter for which flows.

Both `kayak-cookies.js` and `gcal-cookies.js` are `.gitignore`d — they're per-user secrets. Never commit them.

### 5. Run a script

```bash
node trips/check-gcal-month.example.js     # read-only: scrape your June calendar
node trips/spain-jun21.example.js          # write: create a trip + attach cheapest flight
// (calendar writes NOT supported — see how-to-access-google-calendar skill)
```

The first run is the smoke test — `check-gcal-month.example.js` does no writes and tells you whether your gcal cookies are good. If it prints "Cookies expired or wrong page", re-capture (step 3).

### 6. Cookie rotation — re-capture often

- **Kayak `p1.med.sid`** is a Session cookie — dies when the source browser closes. Re-capture each work session.
- **Google `__Secure-1PSIDTS` / `__Secure-3PSIDTS`** rotate **~daily**. If yesterday's script redirects to `workspace.google.com/intl/en-US/products/calendar/` today, that's the symptom — re-capture.

### 7. Enable the Google Calendar MCP (for calendar writes)

Cookie replay can READ your calendar but Google's OSID defense blocks WRITES (event create/update/delete). For writes, we use Google's official remote Calendar MCP. This is a one-time setup per machine.

```bash
# The MCP server is already registered in .mcp.json for this project.
# Authenticate (opens a browser for Google OAuth consent):
```

In Claude Code, run the slash command:

```
/mcp
```

…and pick `claude.ai Google Calendar` → Authenticate. Choose the Google account whose calendar you want to write to. The OAuth token lands in `~/.claude.json` (user-level, never in this repo).

After that, Claude can call `mcp__claude_ai_Google_Calendar__create_event` and friends. Natural-language tasks like "block Jun 21–28 on my calendar for the Spain trip" now work.

Skip this step if you only want calendar reads — those run through cookie replay just fine.

### 8. Optional: add a new site

When you want to extend this to e.g. Notion or Linear:

1. Sign in to that site, capture cookies (same `get-all-cookies-of-a-site` skill)
2. Save as `lib/<site>-cookies.js` (add to `.gitignore`)
3. Write a probe script: load cookies, `goto` the target URL, dump `document.body.innerText` to verify you see logged-in data
4. Iterate on selectors; once a flow works, lift the primitives into `lib/<site>-flows.js`
5. Write a new skill at `.claude/skills/how-to-access-<site>/SKILL.md` capturing what you learned. The existing kayak and gcal skills are templates.

Both flows are end-to-end verified: search a flight, attach it to a Kayak trip, then block the same dates on Google Calendar.

## Why this is a template, not a one-off

The pipeline is the same for every site:

1. **Capture cookies** — DevTools → Application → Cookies → select-all → paste. (Skill: `get-all-cookies-of-a-site`)
2. **Identify the load-bearing subset** — usually one HttpOnly session cookie does the work; the rest are analytics or convenience. (Skill: `find-out-auth-cookie-of-a-site`)
3. **Inject + render** — Playwright `context.addCookies([...])` with a real UA, viewport, locale; `goto()` the target URL; wait for client hydration; scrape the DOM.
4. **For writes:** probe the actual DOM (Rule #0 of every skill: dump the markup, don't guess selectors), then drive carefully with single-shot clicks. Don't loop; bot-scores accumulate.

For each site you want to add, follow this same loop. The site-specific knowledge (which cookies, which selectors, which gotchas) lives in a per-site skill under `.claude/skills/how-to-access-<site>/`. The kayak and gcal skills are reference implementations.

## Adding a new site

1. Open the site in Chrome, sign in
2. Invoke `get-all-cookies-of-a-site` skill to capture the cookie table
3. Save to `lib/<site>-cookies.js` and add the path to `.gitignore`. Optionally also commit a `lib/<site>-cookies.example.js` placeholder so future users know the shape.
4. Write a one-screen probe script: load cookies, `goto` the target URL, dump `document.body.innerText` and key `aria-label`s. Verify you see logged-in content (not a sign-in page).
5. Iterate on selectors using the probe scripts as scratch paper
6. Once the flow works, lift the primitives into `lib/<site>-flows.js`, then **write a new skill** at `.claude/skills/how-to-access-<site>/SKILL.md` capturing: cookie set, gotchas, working selectors, the recipe script
7. Future runs against that site re-load the skill instead of re-deriving everything

The two existing skills (`how-to-access-kayak`, `how-to-access-google-calendar`) follow the same shape — copy one as the starting template.

## Layout

```
kayak-probe/
├── CLAUDE.md                          ← you are here
├── Prompt.md                          ← demo ladder (six progression steps)
├── .gitignore                         ← keeps cookie files + node_modules out of git
├── .mcp.json                          ← registers the google-calendar MCP for calendar writes (no secrets in this file)
├── package.json                       ← only dep: playwright
├── lib/
│   ├── playwright-chromium.js         ← launchWithCookies(cookies, opts) → { browser, context, page }
│   ├── kayak-flows.js                 ← createTrip, findCheapestFlights, saveCheapestToTrip, verifyTrip
│   ├── gcal-flows.js                  ← loadMonthView, scrapeMonthEvents (READ-ONLY; writes go through the Calendar MCP, not this)
│   ├── kayak-cookies.example.js       ← committed placeholder; copy → kayak-cookies.js and fill
│   ├── gcal-cookies.example.js        ← committed placeholder; copy → gcal-cookies.js and fill
│   ├── kayak-cookies.js               ← YOUR kayak.com cookies (gitignored) — secret, rotates
│   └── gcal-cookies.js                ← YOUR calendar.google.com cookies (gitignored) — SIDTS rotates daily
├── trips/
│   ├── spain-jun21.example.js         ← TRACKED template: Kayak end-to-end. Copy → spain-jun21.js to run.
│   └── check-gcal-month.example.js    ← TRACKED template: gcal read. Copy → check-gcal-month.js to run.
│   (trips/*.js is gitignored — your per-demo drivers stay local; only *.example.js is tracked)
└── .claude/skills/
    ├── get-all-cookies-of-a-site/SKILL.md
    ├── find-out-auth-cookie-of-a-site/SKILL.md
    ├── set-up-checklist/SKILL.md             ← run this on a fresh clone
    ├── how-to-access-kayak/SKILL.md          ← reference: kayak-specific knowledge
    └── how-to-access-google-calendar/SKILL.md ← reference: gcal reads + MCP for writes
```

**Why `.mcp.json` is tracked-in-repo:** it registers Google's official Calendar MCP server (`https://calendarmcp.googleapis.com/mcp/v1`) — just the URL, no tokens. OAuth tokens land in your user-level `~/.claude.json` after the first `/mcp` authenticate, which is per-machine and never enters this repo.

**Naming convention in `lib/`:**
- `*-flows.js` → reusable Playwright flow primitives for that site (DOM-driving code)
- `*-cookies.js` → captured session cookies for that site (secrets — should be `.gitignore`d)
- `playwright-chromium.js` → the shared launcher; named to make clear it's specifically Playwright's bundled Chromium, not Firefox/WebKit/system Chrome

Yes, the cookie files live in `lib/` alongside the flow code. That's a pragmatic choice — each site's data sits together — but it does mix code (stable) with secrets (rotating). If you'd rather isolate secrets, move them to a `secrets/` folder and add it to `.gitignore` as a whole.

Each `trips/*.js` is a 10–30 line driver: import lib, define a TRIP/EVENT config object, call the lib functions in order. Site mechanics (selectors, timeouts, gotchas) all live in `lib/`. When a site's UI changes, you fix it once in `lib/` and every driver benefits.

**Drivers are ephemeral by convention.** Only the two `*.example.js` files are tracked in git as reference templates. Per-demo drivers (`trips/tokyo-aug15.js`, etc.) are gitignored — copy an example, change the config, run, delete or keep locally. The repo doesn't accumulate one-off trip files in history.

### Adding a new trip / event

Copy one of the tracked `.example.js` files in `trips/`, change the config object, run. The new file will be gitignored by default. Example for a new Tokyo trip:

```bash
cp trips/spain-jun21.example.js trips/tokyo-aug15.js
# edit the config in your new file, then:
node trips/tokyo-aug15.js
```

The new file's body looks like:

```javascript
// trips/tokyo-aug15.js  (gitignored — local only)
const { launchWithCookies } = require('../lib/playwright-chromium');
const { createTripAndAttachCheapest, verifyTrip } = require('../lib/kayak-flows');
const cookies = require('../lib/kayak-cookies');

const TRIP = {
  origin: 'TPE', destIata: 'NRT', destLabel: 'Tokyo',
  depart: '2026-08-15',
  tripName: 'Tokyo Trip',
  startAria: 'August 15, 2026', endAria: 'August 22, 2026',
  targetMonth: 'August 2026',
};

(async () => {
  const { browser, page } = await launchWithCookies(cookies);
  await createTripAndAttachCheapest(page, TRIP);
  console.log(await verifyTrip(page, { tripName: TRIP.tripName }));
  await browser.close();
})();
```

## On the "why so many similar scripts?" question

Originally there were 5+ Kayak/gcal flow scripts at the top level, each ~95% identical (only ~8 config lines differed). Plus a pile of probe/debug/diag scratch scripts that accumulated during development.

**Resolved 2026-05-10 by:**
1. Deleting all scratch probe/debug/diag scripts (40 files → 7)
2. Extracting common mechanics into `lib/{playwright-chromium,kayak-flows,gcal-flows}.js`
3. Reducing per-flow scripts to thin drivers under `trips/` (10–30 lines each)

A new trip now means: copy a driver, change the config object, run. Site mechanics live in `lib/` and update once when the UI changes. The skill files remain the human-readable recipe; `lib/` is the machine-readable enactment.

### When NOT to extend lib/

Resist the urge to add a function to `lib/` for a one-off probe or diagnostic. Those belong inline in a throwaway script. `lib/` is for primitives that two or more drivers will call — the moment a third driver wants the same logic, lift it.

## Cookie hygiene (applies to every site)

- Cookie values are credentials. Don't commit `*-cookies.js` to git. Add to `.gitignore`.
- Session cookies die when the source browser closes. Re-capture right before running.
- Google's `__Secure-1PSIDTS` / `__Secure-3PSIDTS` rotate ~daily — if a script worked yesterday and 401s today, re-capture before debugging anything else.
- Kayak's `p1.med.sid` is a Session-scoped cookie — it dies on browser close, not on a clock.
- After testing, sign out and back in to invalidate the captured session.

## Things that bit us during the kayak + gcal work

These all turned into entries in the respective skill files; listing here so you know they exist:

- **Kayak:** the next-month arrow in the Create-Trip date picker has no `aria-label`; must select by structural position `.OV9e-month-nav > div[role="button"]:nth-of-type(2)`
- **Kayak:** End date must be ≥ Start + 7 days, or the POST silently 200's
- **Kayak:** the first flight result is often a sponsored Ad row; filter on absence of "Ad disclaimer" in card text
- **Kayak:** `aria-label="Save"` appears on every card — must scope to your chosen card, not `.first()`
- **Google Calendar:** writes via cookie replay are blocked by Google's OSID sync — the server 302s synthetic sessions to `workspace.google.com` marketing page even though reads work fine. Use the Calendar API or an MCP server for writes.
- **Both:** cookies expire mid-session; symptoms differ per site (Kayak shows "Sign in", Google redirects to `workspace.google.com` marketing page)

## Skills inventory

| Skill | Purpose | Status |
|---|---|---|
| `set-up-checklist` | One-time pre-flight: Node + Playwright install, cookie capture, smoke test. Run this first if you just cloned the repo. | Stable |
| `get-all-cookies-of-a-site` | How to capture all cookies (including HttpOnly) via DevTools. Invoked by `set-up-checklist` Section 5. | Stable |
| `find-out-auth-cookie-of-a-site` | Identify the minimum-viable auth cookie subset by probing. Optional optimization. | Stable |
| `how-to-access-kayak` | Reference impl for kayak.com — read trips, create trip, save flight | Verified end-to-end |
| `how-to-access-google-calendar` | Reference impl for calendar.google.com — **READS ONLY**. Writes blocked by Google's OSID sync defense; use Calendar API or MCP server for those. | Verified for reads |

When you add a new site (e.g. `gmail.com`, `notion.so`, `linear.app`), create a new `how-to-access-<site>` skill. Copy `how-to-access-kayak` as the template — it has the cleanest structure.

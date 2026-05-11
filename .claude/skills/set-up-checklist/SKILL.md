---
name: set-up-checklist
description: Pre-flight checklist for first-time users of the universal-site-probe repo. Walks the user through Node.js install, Playwright + Chromium install, cookie capture, creating per-site cookie files from the example placeholders, and running a smoke test. Use when the user says "how do I get started", "I just cloned this repo", "what do I need to install", "set up the project", or before running any trips/* script for the first time. Confirms each prerequisite is in place and points to the right skill for each step.
---

# Setup checklist

A guided pre-flight check before the user gives Claude Code a real task against this repo (e.g. "find a cheap flight and add to my trip list"). Run through this once per machine.

## When this skill applies

Trigger when the user:
- Just cloned the repo and asks "how do I start" / "what do I need"
- Tries to run a script and it fails with a missing-deps error
- Mentions setting up the project, installing Playwright, configuring cookies
- Asks anything that requires the project to actually work end-to-end before they've done setup

If the user has already run a `trips/*.js` script successfully today, **skip this skill** — they're past setup.

## How to use this skill

Walk the user through each section in order. After each section, ask if they hit any errors; if they did, debug that section before moving on. Don't dump all sections at once — it's overwhelming and people skip steps.

The user can also use this as a self-checklist; if they just want the bullet list, give them the **Quick checklist** at the bottom.

## Section 1 — System prerequisites

Confirm with the user:

1. **Node.js 18 or newer.** Check: `node -v`. If older or missing, install from <https://nodejs.org> (LTS is fine) or via Homebrew: `brew install node`.
2. **npm.** Ships with Node — `npm -v` should work.
3. **~300MB free disk** for Playwright's bundled Chromium build.
4. **A browser to sign in with.** Chrome, Edge, Brave, Arc, or any other Chromium-based browser. (Firefox/Safari work too but the DevTools paths in the cookie-capture skill assume Chromium.)

That's it for system deps. No Docker, no API keys, no Google Cloud project.

## Section 2 — Install dependencies

From the repo root:

```bash
npm install
npx playwright install chromium
```

**Two commands, both required.**

- `npm install` reads `package.json` and pulls the `playwright` package into `node_modules/`. ~30 seconds.
- `npx playwright install chromium` downloads Playwright's bundled Chromium build into `~/Library/Caches/ms-playwright/` (macOS) or equivalent. ~1-2 minutes, ~300MB. **Most-skipped step** — if you forget it, scripts crash with: `browserType.launch: Executable doesn't exist at .../chromium-XXXX/chrome-mac/Chromium.app/Contents/MacOS/Chromium`.

If the user is on a corporate machine that blocks the Playwright CDN, they may need to set `PLAYWRIGHT_DOWNLOAD_HOST` or use a system Chrome via `channel: 'chrome'` in `lib/playwright-chromium.js` — flag this as an advanced case.

## Section 3 — Pick which sites to enable

The repo ships flows for two sites:

- **kayak.com** — flight search + trip list (read & write)
- **calendar.google.com** — calendar reads + one-shot event creation (read & write)

Ask the user which they need. They don't have to set up both. The drivers under `trips/` are independent — `trips/check-gcal-month.js` only needs gcal cookies, `trips/spain-jun21.js` only needs kayak cookies.

## Section 4 — Sign in to each chosen site

Open the target site in a Chromium-based browser and **sign in**, then verify the logged-in page renders:

- **Kayak:** open <https://www.kayak.com/trips>. Should show "Upcoming" / "Past" trip lists, NOT a "Sign in" CTA.
- **Google Calendar:** open <https://calendar.google.com/calendar/u/2/r> (note: `/u/2/` is the 3rd account; switch the `2` if you want a different one). Should show your week view, NOT redirect to `accounts.google.com/ServiceLogin`.

If either page doesn't render the logged-in view, sign in/out and try again before moving on. **You cannot replay cookies for a session you haven't established yet.**

## Section 5 — Capture cookies

For each site the user enabled, run them through the `get-all-cookies-of-a-site` skill. **Trigger that skill explicitly** if it's not already loaded — the cookie capture is its job, not this one's.

The TL;DR version (if they don't want to load another skill):

1. With the site loaded and signed in, open DevTools (`⌘⌥I` on Mac, `F12` on Win/Linux)
2. Application tab → Storage → Cookies in the left sidebar
3. Click the row for the site's domain. For Google, capture **both** `calendar.google.com` AND `.google.com` (separate rows in the sidebar) — auth cookies live on `.google.com`, calendar-specific cookies on `calendar.google.com`.
4. Clear the filter box at the top (otherwise rows get hidden silently)
5. Select all rows → Cmd/Ctrl+C → paste to Claude

Claude can then transcribe the paste into the right cookie-file shape.

## Section 6 — Create the cookie files

The repo ships example placeholder files that show the expected shape. **The real cookie files are gitignored** — never commit them.

```bash
cp lib/kayak-cookies.example.js lib/kayak-cookies.js
cp lib/gcal-cookies.example.js  lib/gcal-cookies.js
```

Skip whichever site the user didn't enable.

Open each new `.js` file and replace every `'REPLACE_ME'` with the actual value from the DevTools capture. Each example file's header explains which cookies are load-bearing and which are optional.

Common transcription mistakes (flag these to the user):
- **Truncated values.** DevTools clips long cookie values by default. Drag the Value column wider, or click a row to see the full value, before copy-pasting. A truncated `__Secure-1PSID` or `kayak.mc` will silently 401.
- **Wrong domain.** `.google.com` and `www.google.com` are different cookie scopes. Trust the Domain column.
- **SameSite case.** Playwright wants `'None'` / `'Lax'` / `'Strict'` capitalized; DevTools shows them the same way.

## Section 7 — Smoke test

Have the user run the cheapest, most-passive driver first:

```bash
node trips/check-gcal-month.js
```

(or `trips/spain-jun21.js` if they only enabled Kayak — but that's a write flow; the gcal read is safer as a first run.)

**Expected output on success:** prints `Loaded: { ..., looksLikeCalendar: true, email: 'Google Account: ... (your@email.com)' }` followed by event titles for the month.

**Expected output on cookie failure:**
- gcal: `Cookies expired or wrong page.` (redirected to `workspace.google.com` marketing page)
- kayak: timeout on `Create Trip` button, or `/trips` page shows "Sign in" instead of trip list

If the smoke test fails on cookie issues, re-do Section 5 (re-capture). If it fails on dependency issues, re-do Section 2.

## Section 8 — Cookie rotation reminders

Set expectations so the user isn't surprised when scripts stop working:

- **Kayak `p1.med.sid`** is a Session cookie — dies when the source browser closes. Re-capture each work session.
- **Google `__Secure-1PSIDTS` / `__Secure-3PSIDTS`** rotate **~daily**. If yesterday's script redirects to `workspace.google.com/intl/en-US/products/calendar/` today, that's the symptom — re-capture.
- Other long-lived cookies (`__Secure-1PSID`, `kayak.mc`, etc.) are stable for months but can be revoked anytime by signing out.

If a script suddenly stops working, **Section 5 + Section 6 first**, before debugging anything else.

## Section 9 — Ready

At this point the user can:

- Run any of the existing drivers in `trips/`
- Give Claude Code a natural-language task like "find me a cheap flight to Spain in June and block my calendar" — it will compose the lib primitives appropriately
- Extend to a new site by following the "Adding a new site" section of `CLAUDE.md`

Point them at `Prompt.md` for the full demo ladder (six-step progression of capability).

---

## Quick checklist

For the user who skipped the prose:

- [ ] `node -v` shows 18+
- [ ] `npm install` ran clean (no errors)
- [ ] `npx playwright install chromium` ran clean
- [ ] Signed in to each target site in the browser; logged-in URL renders without redirect
- [ ] Captured cookies via DevTools → Application → Cookies (filter box cleared)
- [ ] `cp lib/<site>-cookies.example.js lib/<site>-cookies.js` for each enabled site
- [ ] Filled in every `REPLACE_ME` with the captured values
- [ ] Smoke test passed: `node trips/check-gcal-month.js` (or a Kayak equivalent) prints expected logged-in output
- [ ] Understand the cookie-rotation cadence (Kayak: per browser session; Google: ~daily for SIDTS)

If every box is checked, you're set up. Go give the agent a real task.

## What this skill is NOT

- Not the cookie-capture walkthrough itself — that's `get-all-cookies-of-a-site`
- Not the per-site usage guide — those are `how-to-access-kayak` and `how-to-access-google-calendar`
- Not for users who've already run a script successfully today — skip ahead

The relationship between skills:

```
set-up-checklist          ← run this once per machine (this skill)
    └→ get-all-cookies-of-a-site   ← invoked inside Section 5
how-to-access-kayak       ← consulted when actually using kayak.com flows
how-to-access-google-calendar ← consulted when actually using calendar.google.com flows
find-out-auth-cookie-of-a-site ← optional: trim cookie set to minimum-viable subset
```

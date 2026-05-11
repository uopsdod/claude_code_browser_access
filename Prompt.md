# Demo ladder — accessing logged-in sites from Claude Code

A 6-step progression showing how site access gets more capable as you add WebFetch → Playwright → cookies → multi-site → write actions.

Each step has a **copy-paste prompt** for the live demo. Run them in order; each one adds exactly one new capability over the previous.

> **Live-demo note:** the live destination (Tokyo, Spain, Italy, …) is intentionally rotated between runs so cached answers don't muddy the demo. Pick one your audience hasn't seen.

---
## 2.0 — Run set-up-checklist command 
Check whether required libraries are all installed 

## 2.1 — WebFetch (HTML only, no JS)

**Goal:** show that plain HTTP fetches see only the SSR'd HTML — no flight cards, no logged-in data.

**Target:** <https://www.kayak.com/flights/TPE-TYO/2026-06-15>

**Tool:** `WebFetch`

**What you'll see:** static HTML scaffolding. The flight result cards are rendered client-side, so they're missing. Truncates on size.

### Prompt to paste

```
Use WebFetch only (NOT Playwright) to fetch
https://www.kayak.com/flights/TPE-TYO/2026-06-15

After fetching, report:
  - How much HTML you got back (rough size)
  - Whether you can see actual flight prices, airline names, or departure times
  - What kind of content you DO see vs what is missing
```

**Expected punchline:** "I see the page chrome — header, footer, search form — but no flight result cards. They're rendered client-side via JavaScript that WebFetch doesn't execute."

---

## 2.2 — Playwright MCP (JS-rendered, anonymous)

**Goal:** render the same URL with Playwright so the JS-rendered content (flight cards) becomes visible.

**Target:** <https://www.kayak.com/flights/TPE-TYO/2026-06-15>

**Tool:** Playwright MCP

**What you'll see:** full rendered cards — airlines, prices, durations.

### Prompt to paste

```
Same URL as before — https://www.kayak.com/flights/TPE-TYO/2026-06-15 — but
this time use the Playwright MCP to navigate there, wait for the page to
finish hydrating (~15s), and then scrape the actual flight result cards.

Report the top 3 cheapest results: airline, price, duration, number of stops.
```

**Expected punchline:** "Now I can see real cards — $X / Airline Y / N stops / total duration. Same URL, two completely different views, because Playwright runs the JavaScript."

---

## 2.3 — Node Playwright + auth cookies (user-specific data)

**Goal:** access data only available when signed in.

**Target:** <https://www.kayak.com/trips>

**Tools:** **Node Playwright** (NOT the MCP) + replayed auth cookies in `lib/kayak-cookies.js`

**Why not the MCP?** The Playwright MCP can only set cookies via `document.cookie` from inside the page, which by browser design **cannot set HttpOnly cookies**. Kayak's auth (`p1.med.sid`, `kayak.mc`, `p1.med.stoken`, `mtoken.*`, etc.) is all HttpOnly, so MCP injection lands on the signed-out "Sign in to plan your trip" page. The Node path uses Playwright's `context.addCookies()`, which CAN set HttpOnly — that's the actual unlock from 2.2 → 2.3, not the MCP.

**What you'll see:** the user's actual saved trips (whatever's currently on /trips).

### Prompt to paste

```
I'll paste my Kayak cookies (DevTools → Application → Cookies, full table)
here. Consult the how-to-access-kayak skill — Rule #1 says do NOT use the
Playwright MCP for this, because it can't set HttpOnly cookies and Kayak's
auth cookies are all HttpOnly. Use the Node Playwright path instead:

  1. Transcribe my paste into lib/kayak-cookies.js (shape: see
     lib/kayak-cookies.example.js — name, value, domain, path, httpOnly,
     secure, sameSite). Overwrite the file.
  2. Write a driver at trips/list-trips.js that requires
     lib/playwright-chromium + lib/kayak-cookies, calls launchWithCookies()
     (which wraps context.addCookies()), navigates to
     https://www.kayak.com/trips, waits ~8s for hydration, and scrapes the
     trip cards.
  3. Run `node trips/list-trips.js` and report the trips currently saved in
     my account.
```

**Expected punchline:** "We see *your* trips by name — Peru Trip, Italy Trip, etc. — proving the session cookies authenticated us. Without cookies, this same URL shows 'Sign in to plan your trip'. The real lift here isn't Playwright vs. WebFetch — it's the Node API's `addCookies()`, the only path that can carry HttpOnly auth into a fresh browser context."

---

## 2.4 — Playwright MCP + cookies + interaction (single site, write)

**Goal:** drive the DOM to create + modify state on a logged-in site.

**Tools:** Playwright MCP + auth cookies + click/fill interactions

**What you'll see:** a new Kayak trip created from scratch + the cheapest flight attached to it.

### Prompt to paste

```
Now, help me find a cheap plane ticket from Taipei to <DESTINATION> in next
month and add it to my trip list on https://www.kayak.com/trips with the
Kayak auth cookies attached (lib/kayak-cookies.js).

STEP 0 — preflight: navigate to /trips and verify you see the "Create Trip"
button and NOT a "Sign in to plan" CTA. If signed-out, STOP and tell me to
re-capture cookies.

Then:
  1. Create an empty trip named "<DESTINATION> Trip" with arbitrary 7-day
     dates inside next month
  2. Search Kayak for the cheapest TPE → <IATA> flight on the trip's start
     date (sort=price_a)
  3. Save the cheapest organic (NOT sponsored "Ad") flight card to the trip
  4. Verify the trip page now shows "1 saved item"

Pick a real DESTINATION + IATA pair for me (e.g. Spain/MAD, Italy/FCO,
Japan/NRT) — your call, just don't repeat one we used before.
```

**Expected punchline:** "Same cookies as 2.3, but now we're driving the DOM — clicking Create Trip, filling the destination autocomplete, navigating a date picker, clicking the heart-icon on a search result, picking the trip in a bottom-sheet. End state: live mutation of the user's account."

---

## 2.5 — Two sites: Kayak + Google Calendar (reads only)

**Goal:** chain across two logged-in sites — read from one to inform actions on the other.

**Tools:** Playwright MCP + auth cookies for **both** sites (`lib/kayak-cookies.js` + `lib/gcal-cookies.js`)

**What you'll see:** Claude reads your calendar, picks dates that don't conflict with existing events, then books a flight inside that free window.

### Prompt to paste

```
Plan a Taipei → <DESTINATION> trip for me, ~7 days inside next month, that
does NOT conflict with anything on my Google Calendar. Use the auth cookies
in lib/kayak-cookies.js and lib/gcal-cookies.js.

STEP 0 — preflight (STOP on any failure):
  - Kayak: navigate to /trips, confirm signed in
  - Google Calendar: navigate to /calendar/u/2/r/month/<YEAR>/<MONTH>/1,
    confirm "My calendars" sidebar is visible (NOT the workspace.google.com
    marketing page)

Then:
  1. Scrape my Google Calendar month view for next month. Report existing
     events and free windows.
  2. Pick a 7-day window inside a free stretch. Tell me which dates and why.
  3. Create an empty "<DESTINATION> Trip" on /trips with those dates.
  4. Search TPE → <IATA> on the start date, sort by price.
  5. Save the cheapest organic flight to the trip.
  6. Verify the trip page shows "1 saved item".

Pick a fresh DESTINATION/IATA we haven't used. NO calendar write yet — that's
the next step.
```

**Expected punchline:** "Look at the chain: Claude reads gcal → sees Business in Taiwan Jun 7–20 → picks Jun 22 because it's after that block → searches Kayak on Jun 22 → saves the deal. The two sites talk to each other through Claude's working memory."

---

## 2.6 — Switch tools at the boundary (cookie replay → MCP)

**Goal:** show what to do when cookie replay hits a wall. End state: trip booked on Kayak via cookie replay AND calendar blocked on Google via an MCP server.

**Setup (one-time, before the demo):**

1. Register Google's official Calendar MCP server in this project:
   ```bash
   claude mcp add --transport http --scope project google-calendar \
     https://calendarmcp.googleapis.com/mcp/v1
   ```
   This creates `.mcp.json` in the repo (no secrets — just the URL).
2. Authenticate: type `/mcp` in Claude Code, pick `claude.ai Google Calendar`, click through Google's OAuth consent screen, pick the account that owns your `/u/2/r` calendar. Done.

**Tools used in 2.6:**
- Playwright + cookies for Kayak (read + write — cookie replay works)
- Playwright + cookies for Google Calendar (read only — cookie replay works for this)
- **Google Calendar MCP for the calendar write** (cookie replay was blocked by Google's OSID defense, see "Empirical finding" below)

**The empirical finding (the lesson behind 2.6):**

Extending step 2.5 with "Then, block my Google Calendar with this plan" via Playwright failed reproducibly. Google's server detects the synthetic session at the OSID sync endpoint and 302s to `workspace.google.com/intl/en-US/products/calendar/` (marketing page) — even though reads from the same cookies work fine. CDP-attach to a real Chrome would work but modern Chrome refuses CDP on the default user-data-dir, requiring a profile clone. Too brittle.

The Calendar MCP sidesteps all of this. It uses the official Google Calendar API with proper OAuth — no bot detection, no rotating tokens to chase. **One tool call creates the event in ~2 seconds.**

**The reusable principle:** cookie replay is the right tool for **reads** on almost any logged-in site, and for **writes** on sites with lighter bot defenses (Kayak). For sites with strict anti-bot tuned to catch DOM replays (Google products), switch to the API/MCP path at the moment cookie replay starts fighting back.

### Prompt to paste

```
Now, help me find a cheap plane ticket from Taipei to <DESTINATION> in next
month and add it to my trip list on https://www.kayak.com/trips with the
auth cookies attached.

STEP 0 — preflight (STOP on any failure, do NOT proceed):
  1. Kayak: navigate Playwright + lib/kayak-cookies.js to /trips. If the page
     shows "Sign in to plan" OR no "Create Trip" button is visible, STOP and
     tell me to re-capture Kayak cookies.
  2. Google Calendar MCP: call mcp__claude_ai_Google_Calendar__list_calendars.
     If the call errors with "needs authentication" or similar, STOP and tell
     me to run /mcp and authenticate.

Only continue when BOTH probes pass.

Then:
  1. Use the Calendar MCP (mcp__claude_ai_Google_Calendar__list_events) to
     read my events for next month. Identify free windows.
  2. Pick a 7-day window inside a free stretch.
  3. Create an empty "<DESTINATION> Trip" on /trips with those dates
     (via Playwright + Kayak cookies).
  4. Search TPE → <IATA> on the start date, sort by price.
  5. Save the cheapest organic flight to the trip (via Playwright).
  6. Block my Google Calendar with an all-day event covering the trip dates.
     Use mcp__claude_ai_Google_Calendar__create_event — NOT Playwright on
     calendar.google.com. Title: "<DESTINATION> Trip (TPE → <IATA>)".
     Description: the flight summary (airline, stops, duration, price).
  7. Verify the calendar event landed by listing June events again.

Fail-fast rule: if any step fails, STOP and report what went wrong. Do not
try clever workarounds without asking me first.

Pick a fresh DESTINATION/IATA we haven't used.
```

**Expected punchline:** "Watch the tool switch at step 6. Steps 1–5 are cookie-replay Playwright — same pattern as 2.3 and 2.4. Step 6 is the Calendar MCP, because Google's anti-bot specifically blocks DOM-driven calendar writes. Two access patterns, same conversation, used at exactly the right boundary."

# Demo ladder — accessing logged-in sites from Claude Code

A 6-step progression showing how site access gets more capable as you add WebFetch → Playwright → cookies → multi-site → write actions.

---

## 2.1 — WebFetch (HTML only, no JS)

**Goal:** show that plain HTTP fetches see only the SSR'd HTML — no flight cards, no logged-in data.

**Target:** <https://www.kayak.com/flights/TPE-TYO/2026-06-15>

**Tool:** `WebFetch`

**What you'll see:** static HTML scaffolding. The flight result cards are rendered client-side, so they're missing. Truncates on size.

---

## 2.2 — Playwright MCP (JS-rendered, anonymous)

**Goal:** render the same URL with Playwright so the JS-rendered content (flight cards) becomes visible.

**Target:** <https://www.kayak.com/flights/TPE-TYO/2026-06-15>

**Tool:** Playwright MCP

**What you'll see:** full rendered cards — airlines, prices, durations.

---

## 2.3 — Playwright MCP + auth cookies (user-specific data)

**Goal:** access data only available when signed in.

**Target:** <https://www.kayak.com/trips>

**Tools:** Playwright MCP + replayed auth cookies

**What you'll see:** the user's actual saved trips (London, Moscow, etc.).

---

## 2.4 — Playwright MCP + cookies + interaction (single site, write)

**Goal:** drive the DOM to create + modify state on a logged-in site.

**Tools:** Playwright MCP + auth cookies + click/fill interactions

**Sample prompt:**

```
Now, help me find a cheap plane ticket from Taipei to Spain in next month
and add to my trip list on https://www.kayak.com/trips with the auth cookies
attached.

First, check whether you have the auth cookie for the following sites:
  1. https://www.kayak.com/

Then, create an empty trip on https://www.kayak.com/trips
Then, find the cheap plane ticket in my available days
Then, add one plane ticket deal to the new trip
```

---

## 2.5 — Two sites: Kayak + Google Calendar (reads only)

**Goal:** chain across two logged-in sites — read from one to inform actions on the other.

**Tools:** Playwright MCP + auth cookies for **both** sites

**Sample prompt:**

```
Now, help me find a cheap plane ticket from Taipei to Spain in next month
and add to my trip list on https://www.kayak.com/trips with the auth cookies
attached.

First, check whether you have the auth cookie for the following sites:
  1. https://www.kayak.com/
  2. https://calendar.google.com/calendar/u/2

Then, create an empty trip on https://www.kayak.com/trips
Then, check my Google Calendar in next month to see what my schedule is now
Then, find the cheap plane ticket in my available days
Then, add one plane ticket deal to the new trip
```

---

## 2.6 — Switch tools at the boundary (cookie replay → MCP)

**Goal:** show what to do when cookie replay hits a wall. End state: trip booked on Kayak via cookie replay AND calendar blocked on Google via an MCP server.

**Setup (one-time):**

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

**What the demo actually does in 2.6:**

```
Now, help me find a cheap plane ticket from Taipei to Spain in next month
and add to my trip list on https://www.kayak.com/trips with the auth cookies
attached.

First, check whether you have the auth cookie for the following sites:
  1. https://www.kayak.com/
  2. https://calendar.google.com/calendar/u/2

Then, create an empty trip on https://www.kayak.com/trips
Then, check my Google Calendar in next month to see what my schedule is now
Then, find the cheap plane ticket in my available days
Then, add one plane ticket deal to the new trip
Then, block my Google Calendar with this plan
  (via the google-calendar MCP server registered in .mcp.json — NOT via cookies)
```

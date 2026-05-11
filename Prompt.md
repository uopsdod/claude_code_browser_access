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

## 2.6 — Cross-site automation hits a wall (the honest lesson)

**Goal:** show that the cookie-replay pattern has limits — and what to use when you hit them.

**Tools:** same as 2.5, plus a discussion of why writes to Google Calendar fail.

**The empirical finding:** when we tried to extend step 2.5 with "Then, block my Google Calendar with this plan," cookie-replay fell over. Google's server detects the synthetic session via the OSID sync endpoint and 302s to a marketing page (`workspace.google.com/intl/en-US/products/calendar/`) even though reads from the same cookies work fine. CDP-attach to a real Chrome works but Chrome refuses CDP on the default user-data-dir, requiring a profile clone — too brittle for a template repo.

**The right tools when this happens:**

| Need | Tool |
|---|---|
| Programmatic Calendar writes | **Google Calendar API** (OAuth + refresh token) |
| Conversational Calendar writes from Claude Code | **Calendar MCP server** like `@cocal/google-calendar-mcp` |
| One-off write | Just do it in the browser |

**The lesson:** cookie-replay is the right tool for **reads** on almost any logged-in site, and for **writes** on sites with lighter bot defenses (Kayak). Google's anti-bot is tuned to catch exactly this pattern for writes. Don't fight it — switch tools at the boundary where the cost-benefit flips.

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

(For the calendar block, switch to the Google Calendar API or an MCP server
 — DOM-driven writes hit Google's OSID sync defense.)
```

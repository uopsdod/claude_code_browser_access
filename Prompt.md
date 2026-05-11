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

## 2.6 — Two sites + write to both (closing the loop)

**Goal:** full read-and-write across both sites. End state: trip booked on Kayak AND calendar blocked on Google.

**Tools:** Playwright MCP + auth cookies for both sites + DOM write actions on Google Calendar

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
Then, block my Google Calendar with this plan
```

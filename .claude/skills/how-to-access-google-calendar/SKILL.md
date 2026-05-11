---
name: how-to-access-google-calendar
description: Practical playbook for accessing calendar.google.com via Playwright with replayed session cookies. Use when the user wants to read events, scrape a date range, or automate any calendar.google.com workflow without using the official Google Calendar API or an MCP server. Captures which cookies are load-bearing (modern __Secure-1PSID / __Secure-3PSID set, plus __Secure-OSID), how the /u/N/ multi-account routing actually works, and what to do when Google's bot detection trips.
---

# How to access calendar.google.com

A field-tested guide to scraping `calendar.google.com` via Playwright + replayed cookies — the "Plan B" when you don't want to set up a Google Calendar MCP server or wire up OAuth.

This is the same pattern as the `how-to-access-kayak` skill (export cookies from a logged-in Chrome → inject into Playwright → render), but the cookie surface is more complex because Google splits auth across multiple domains.

## Prerequisites

This skill assumes the project layout described in `CLAUDE.md` at the repo root. Specifically:

- Node.js + Playwright installed (`npm install && npx playwright install chromium`)
- A `lib/gcal-cookies.js` file with values captured from a signed-in Google session — see the `get-all-cookies-of-a-site` skill for capture steps and `lib/gcal-cookies.example.js` for the shape
- **Re-capture cookies the same day you run** — Google's `__Secure-1PSIDTS`/`__Secure-3PSIDTS` rotate ~daily. A capture older than 24h will likely redirect to `workspace.google.com` marketing page.

If you're reading this skill in isolation without that scaffolding, start with `CLAUDE.md` first.

## When this skill applies

- Reading events at `/calendar/u/<N>/r` for a specific Google account `N`
- Scraping the week/month view of a calendar without API access
- Anything that requires being signed in to a specific Google account, where setting up an MCP server or OAuth flow is overkill
- "Just check my next-week schedule" type one-shots

## When this skill does NOT apply

- **Any kind of event create / update / delete.** Empirically blocked by Google's OSID sync defense — see "Writes are NOT supported via cookie replay" below. Use the Google Calendar API or a Calendar MCP server instead.
- Production / unattended jobs — the cookies rotate (see below). API + refresh tokens are the right tool.
- Multi-user systems — never replay another user's cookies.

## ⭐ Read-recipe — render a logged-in calendar week

This is the minimum that worked, verified end-to-end. Today (2026-05-10) it landed on the correct account and rendered the week view in ~10 seconds, no bot challenges.

```javascript
// probe-gcal.js
const { chromium } = require('playwright');
const cookies = require('./gcal-cookies.js'); // see "Cookie set" below

(async () => {
  const browser = await chromium.launch({ channel: 'chromium', headless: false });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
  });
  await context.addCookies(cookies);
  const page = await context.newPage();

  await page.goto('https://calendar.google.com/calendar/u/2/r', {
    waitUntil: 'domcontentloaded', timeout: 30_000,
  });
  await page.waitForTimeout(10_000); // calendar app shell hydrates via XHR

  // Verify: title should look like "Google Calendar - Week of <Month Day, Year>"
  // and the body text should contain "My calendars" / "Other calendars".
  const diag = await page.evaluate(() => ({
    title: document.title,
    url: location.href,
    onSignIn: /accounts\.google\.com|ServiceLogin|signin/i.test(location.href),
    looksLikeCalendar: /My calendars|Other calendars|Create|Today|Week|Month/i.test(document.body.innerText),
    // Avatar tooltip leaks the active account email
    emails: Array.from(document.querySelectorAll('[aria-label*="@"], [title*="@"]'))
      .map(el => el.getAttribute('aria-label') || el.getAttribute('title'))
      .filter(s => s && /\S+@\S+\.\S+/.test(s))
      .slice(0, 5),
  }));
  console.log(diag);

  await browser.close();
})();
```

Expected output on success:
```
{
  title: 'Google Calendar - Week of May 10, 2026',
  url: 'https://calendar.google.com/calendar/u/2/r',
  onSignIn: false,
  looksLikeCalendar: true,
  emails: [ 'Google Account: Sam Tsai  \n(<your-email>@gmail.com)' ]
}
```

## Writes are NOT supported via cookie replay

**Writes (event create/update/delete) are intentionally out of scope for this skill.** Earlier attempts to drive the Create-event flow via Playwright + replayed cookies briefly succeeded, but reproducibly fail today: Google's server responds with a 302 to `accounts.google.com/ServiceLogin?service=cl&passive=1209600&osid=1&continue=...` which then bounces to `workspace.google.com/intl/en-US/products/calendar/` (marketing page). The cookies render the calendar fine for reads but the OSID sync rejects writes from the synthetic context.

What works for reads doesn't work for writes here. Don't waste time chasing this — use the right tool:

| Need | Tool |
|---|---|
| One-off event create | Do it manually in the browser, or use the Google Calendar API one-shot |
| Programmatic event create / update / delete | **Google Calendar API** (`@googleapis/calendar`) with OAuth, or a **Calendar MCP server** like `@cocal/google-calendar-mcp` |
| Recurring automation | Calendar API + refresh token, or MCP server |
| Bulk operations | Calendar API `events.batchInsert` etc. |

CDP-attach to a real Chrome (`chromium.connectOverCDP`) does work, but modern Chrome refuses CDP on the default user-data-dir for security reasons — you'd need to clone your profile into `/tmp/chrome-cdp-profile` first. Not worth the per-machine fragility for a template repo.

## Cookie set — which ones are load-bearing

Cookies come from THREE domain tables in DevTools → Application → Cookies. You need to capture all three, although in our test only `.google.com` and `calendar.google.com` ended up contributing the load-bearing values.

### Verified-working minimum set

These 14 cookies were sufficient to render `/calendar/u/2/r` with no sign-in redirect:

| Cookie | Domain | Role | Notes |
|---|---|---|---|
| **`__Secure-1PSID`** | `.google.com` | Modern 1st-party session ID (HttpOnly, Secure) | Primary auth |
| **`__Secure-3PSID`** | `.google.com` | Modern 3rd-party session ID (HttpOnly, Secure, SameSite=None) | Required alongside 1PSID — Google's web client mixes both |
| **`__Secure-1PSIDTS`** | `.google.com` | Short-lived session token-set | **Rotates ~daily** — re-capture before each run |
| **`__Secure-3PSIDTS`** | `.google.com` | Same as above, 3P variant | Rotates with 1PSIDTS |
| **`__Secure-1PSIDCC`** | `.google.com` | Session continuity check | Short-lived, paired with SIDTS |
| **`__Secure-3PSIDCC`** | `.google.com` | Same, 3P variant | Short-lived |
| **`__Secure-1PAPISID`** | `.google.com` | API auth (1P) | Long-lived (~1 year) |
| **`__Secure-3PAPISID`** | `.google.com` | API auth (3P) | Long-lived |
| **`APISID`** | `.google.com` | Legacy API auth | Long-lived |
| **`__Secure-OSID`** | `calendar.google.com` | Calendar-scoped session (HttpOnly, Secure, SameSite=None) | **Probably how `/u/2/` routing locks onto the right account** |
| **`COMPASS`** | `calendar.google.com` | Calendar UI state blob | Includes user/account hint |
| `__Secure-BUCKET` | `.google.com` | Routing bucket | Stable |
| `__Secure-STRP` | `.google.com` | Strict-cookie marker | Stable |
| `AEC` | `.google.com` | Anti-CSRF marker | Stable |

### Cookies you DON'T necessarily need

In the verified run, the user's session had **no** legacy `SID`/`HSID`/`SSID`/`LSID` cookies — Google has migrated many accounts entirely to the `__Secure-1PSID` / `__Secure-3PSID` modern set. If the user's DevTools table doesn't show `SID`/`HSID`/`SSID`, that's expected; don't go hunting for them.

Same for `__Host-GAPS`, `NID`, `CONSENT`, `SOCS` — these are convenience/preference cookies, not auth. They're nice to grab for completeness but not required for the calendar render.

### Cookie file format (Playwright `addCookies` shape)

Save them as a CommonJS module so the probe script just `require`s it:

```javascript
// gcal-cookies.js
module.exports = [
  { name: '__Secure-1PSID',  value: 'g.a000...0076', domain: '.google.com',      path: '/', httpOnly: true,  secure: true,  sameSite: 'Lax'  },
  { name: '__Secure-3PSID',  value: 'g.a000...0076', domain: '.google.com',      path: '/', httpOnly: true,  secure: true,  sameSite: 'None' },
  { name: '__Secure-1PSIDTS', value: 'sidts-...EAA', domain: '.google.com',      path: '/', httpOnly: true,  secure: true,  sameSite: 'Lax'  },
  { name: '__Secure-3PSIDTS', value: 'sidts-...EAA', domain: '.google.com',      path: '/', httpOnly: true,  secure: true,  sameSite: 'None' },
  { name: '__Secure-1PSIDCC', value: 'AKEy...',      domain: '.google.com',      path: '/', httpOnly: true,  secure: true,  sameSite: 'Lax'  },
  { name: '__Secure-3PSIDCC', value: 'AKEy...',      domain: '.google.com',      path: '/', httpOnly: true,  secure: true,  sameSite: 'None' },
  { name: '__Secure-1PAPISID', value: '...',         domain: '.google.com',      path: '/', httpOnly: false, secure: true,  sameSite: 'Lax'  },
  { name: '__Secure-3PAPISID', value: '...',         domain: '.google.com',      path: '/', httpOnly: false, secure: true,  sameSite: 'None' },
  { name: 'APISID',          value: '...',           domain: '.google.com',      path: '/', httpOnly: false, secure: false, sameSite: 'Lax'  },
  { name: '__Secure-OSID',   value: 'g.a000...0076', domain: 'calendar.google.com', path: '/', httpOnly: true,  secure: true, sameSite: 'None' },
  { name: 'COMPASS',         value: 'calendar=...',  domain: 'calendar.google.com', path: '/', httpOnly: true,  secure: true, sameSite: 'None' },
  { name: '__Secure-BUCKET', value: 'CJMF',          domain: '.google.com',      path: '/', httpOnly: true,  secure: true,  sameSite: 'Lax'  },
  { name: '__Secure-STRP',   value: '...',           domain: '.google.com',      path: '/', httpOnly: false, secure: true,  sameSite: 'Strict' },
  { name: 'AEC',             value: '...',           domain: '.google.com',      path: '/', httpOnly: true,  secure: true,  sameSite: 'Lax'  },
];
```

**Watch the SameSite values when copy-pasting from a tab-separated DevTools dump.** The "1P" variants are typically `Lax`, the "3P" variants `None`. Get this wrong and Playwright drops the cookie silently on cross-site fetches the calendar app makes during hydration.

## Multi-account routing — `/u/<N>/r`

Google Calendar uses `/u/N/` to index into the account chooser, where `N` is the zero-based position. Empirically:

- `/u/0/r` → default (top) account
- `/u/2/r` → 3rd account in the chooser

In the verified run, the captured cookie set was for the account that owns `/u/2/`, and the page rendered correctly without any extra account-disambiguation cookies. Most likely the `calendar.google.com`-scoped `__Secure-OSID` already encodes which account this session belongs to.

If you replay these cookies and land on `/u/0/r` instead, your capture session was signed in to multiple accounts and the `__Secure-OSID` was bound to a different one. Fix: in your real browser, switch the calendar tab to the target account, **then** re-capture cookies. Don't capture from `/u/0/` and hope to hit `/u/2/`.

## What the rendered page looks like (for verification scrapes)

After 10s of waiting on `/calendar/u/<N>/r`, the body text contains a stable skeleton you can grep:

```
Skip to main content … Calendar Today <weekday>, <month day> Previous week Next week
<month year> … Week arrow_drop_down Switch to Calendar Switch to Tasks
add Create … Calendar list My calendars … Sam Tsai Birthdays Tasks Other calendars
… Holidays in United States … Week of <month day>, <year>, <N> event GMT-NN
SUN <d> MON <d+1> … <event titles, all-day blocks, time slots>
```

So a reliable existence check is:
```javascript
const ok = /My calendars|Other calendars/.test(document.body.innerText)
        && !/accounts\.google\.com|ServiceLogin/.test(location.href);
```

The avatar tooltip reliably leaks the active account email:
```javascript
const email = Array.from(document.querySelectorAll('[aria-label*="@"]'))
  .map(el => el.getAttribute('aria-label'))
  .find(s => /\S+@\S+\.\S+/.test(s));
// → "Google Account: Sam Tsai  \n(uopsfof@gmail.com)"
```

## Cookie lifetime — re-capture before each session

This is the BIG difference from kayak.com:

| Cookie | TTL after capture | Practical re-capture cadence |
|---|---|---|
| `__Secure-1PSID` / `__Secure-3PSID` | ~1 year, but Google can invalidate at will | Per-week is safe |
| `__Secure-1PSIDTS` / `__Secure-3PSIDTS` | **~24 hours** | **Every run** |
| `__Secure-1PSIDCC` / `__Secure-3PSIDCC` | **~24 hours** | **Every run** |
| `__Secure-OSID` | ~1 year, but binds to a Calendar session | Per-week |
| `__Secure-1PAPISID` / `__Secure-3PAPISID` / `APISID` | ~1 year | Rarely |
| `COMPASS` | ~10 days | Per-week |

Don't capture once and reuse for days — the SIDTS pair will rot and the next request will redirect to `accounts.google.com`. Re-capture right before the run, the same way the kayak workflow recommends.

## Bot defense — what we observed and what to watch for

Google's bot defense is **stricter** than Kayak's but is heavily tuned to the no-cookies / new-session case. With a freshly-captured valid cookie set, the verified run completed with:

- Real UA, viewport, locale (don't skip these)
- `headless: false`
- A single direct `goto('/calendar/u/2/r')` — no homepage warm-up needed
- 10 second wait for hydration
- No interaction beyond reading the DOM

Things that will likely break it:

1. **Stale `SIDTS`** — most common failure mode. You'll land on `accounts.google.com/ServiceLogin?...`. Re-capture.
2. **Wrong `SameSite`** on the 3P variants — they MUST be `None`. Playwright silently drops cookies that violate SameSite on the requests Calendar makes during hydration.
3. **Mismatched UA / IP geo** — replaying cookies captured in one country, from an IP in a different country, triggers "unusual activity." Mitigation: capture and replay from the same machine, or accept that the session may be invalidated and re-auth in the browser.
4. **`headless: true` with default flags** — Google's fingerprinting catches headless Chromium reliably. Use `headless: false` or full stealth flags.
5. **Frequent automated hits** — even with valid cookies, hammering the URL will get the session flagged. Cache results; don't poll faster than once every few minutes.
6. **Any write action via DOM driving** — Google's OSID sync redirects synthetic sessions to `workspace.google.com` marketing page. Even single-shot create reproducibly fails. Use the Calendar API instead.

## What this skill is NOT for — and what to use instead

| Goal | Wrong tool | Right tool |
|---|---|---|
| Any create / update / delete event | Cookie replay + DOM | Google Calendar API (OAuth) or a Calendar MCP server |
| Poll the calendar every minute | This skill | Google Calendar API with `events.watch` push channels |
| Multi-user backend service | Cookie replay | OAuth per-user with refresh tokens |
| One-shot "what's on my schedule next week" | — | This skill ✓ |
| Quick read of a friend's shared calendar via the web URL | — | This skill ✓ |
| Mirror events to Notion / Linear / etc. | This skill (fragile) | Calendar API + webhook |

## Recipe pairing — works well with

- **`get-all-cookies-of-a-site`** — the prerequisite skill for capturing the cookie table. Trigger that first.
- **`find-out-auth-cookie-of-a-site`** — only useful if you want to narrow the 14-cookie list down to the minimum-viable subset. Google is touchier than kayak about this; probably not worth optimizing.

## Common pitfalls

- **Pasted DevTools TSV with truncated Values.** DevTools clips long cookie values by default. Drag the Value column wider, or click a row to see the full value, before copy-pasting. A truncated `__Secure-1PSID` will silently 401.
- **Cookies on `https://www.google.com` are NOT the same as `.google.com`.** The `.` prefix means "this and all subdomains." If your DevTools shows two rows for the same cookie name on different domains, prefer the `.google.com` one for replay.
- **Pasting cookie values into chat = leaking your session.** After testing, sign out of `accounts.google.com` and sign back in to rotate the SID set. Don't commit `gcal-cookies.js` to git.
- **`calendar.google.com/calendar/u/2/r` ≠ `calendar.google.com/u/2/r`** — note the duplicate `/calendar` segment. Use the full path.
- **Hyperlinks in the rendered page point at `calendar.google.com/calendar/event?eid=...`** — these need the same cookies; you can navigate to them within the same Playwright context to read event detail.

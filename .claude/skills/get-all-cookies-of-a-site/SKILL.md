---
name: get-all-cookies-of-a-site
description: Walk the user through capturing ALL cookies for a website (including HttpOnly ones) using browser DevTools. Use when the user asks "how do I export cookies from Chrome", "how do I see all cookies on this site", "grab my session cookies", "dump cookies from kayak.com", or any prep step before replaying a logged-in session in Playwright/curl. Emphasizes that document.cookie cannot see HttpOnly cookies and that the Application panel is the authoritative source.
---

# Get all cookies of a site

This skill gives the user a clean, repeatable way to capture **every cookie** the browser holds for a site — including the `HttpOnly` ones that JavaScript cannot see. It's the prep step before any cookie-replay workflow (Playwright session injection, curl auth replay, auth-cookie identification, etc.).

## When this skill applies

Trigger when the user asks:
- "How do I see all cookies on `<site>`?"
- "How do I export my cookies from Chrome / Edge / Firefox?"
- "Dump the cookies for `<site>`."
- "I need to grab my session cookies before signing in / after signing in."
- "How do I copy a cookie value to use in Playwright / curl?"

This skill is **prep, not analysis**. It hands off to other skills (like `find-out-auth-cookie-of-a-site`) once the cookies are captured.

## Critical concept to convey first

> `document.cookie` in the Console **cannot see `HttpOnly` cookies**. That's the entire point of the `HttpOnly` flag — it hides cookies from page JavaScript to defend against XSS. The real authentication cookie is almost always `HttpOnly`. So Console-only dumps will miss it.
>
> The authoritative view is **DevTools → Application → Storage → Cookies**. Use that.

State this up front so the user doesn't waste time on Console-only methods.

## Security guardrails

1. **Cookie values are credentials.** Treat them like passwords.
2. **Don't paste cookie values into public chats, logs, screenshots, or version control.** When sharing with Claude in a private session, that's fine for the duration of the task — but encourage the user to invalidate the session (sign out, sign back in) when done.
3. **Only capture cookies for sites the user owns / has an account on.** Not for sessions belonging to others.

## The capture workflow

### Method 1 — DevTools Application panel (best, sees HttpOnly)

This is the default. It works in Chrome, Edge, Brave, Arc, and other Chromium browsers; Firefox and Safari have equivalent panels.

**1. Open the target site (e.g. `https://www.example.com`) in the browser tab.**

**2. Open DevTools.**
- macOS: `⌘⌥I` (Cmd+Option+I), or right-click → "Inspect"
- Windows/Linux: `F12`, or `Ctrl+Shift+I`

**3. Go to the Application tab.**
- Chromium: **Application** tab in the top bar. If the tab isn't visible, click the `»` overflow menu.
- Firefox: **Storage** tab (same idea, different name).
- Safari: enable **Develop** menu first (Settings → Advanced), then **Storage** tab.

**4. In the left sidebar, expand "Storage" → "Cookies" → click the row for `<site domain>`.**
- You'll see a table with columns: Name, Value, Domain, Path, Expires/Max-Age, Size, HttpOnly, Secure, SameSite, etc.
- **Make sure the filter box at the top is empty.** A leftover filter is a common reason users see only 2–3 cookies instead of 20+.

**5. Copy the data.** Three options, depending on what the user needs:
- **Screenshot the table** — simplest, captures all flags visually.
- **Select all rows + Cmd/Ctrl+C** — pastes as tab-separated rows.
- **Right-click a row → "Copy as cURL"** (Network tab, on any request) — gives a curl command with the Cookie header pre-filled. Useful for one-off API calls.

**6. Sanity-check.** Confirm the table shows:
- The full count of cookies (typically 10–30 for a logged-in user, much fewer for anonymous).
- A `✓` in the HttpOnly column for at least one cookie (proves the panel IS showing HttpOnly entries).
- The site's primary domain in the Domain column, not just third-party trackers like `.bing.com` / `.tiktok.com` / `.doubleclick.net`.

### Method 2 — Console snippet (JS-visible cookies only)

**Only use this as a supplement** — it cannot see `HttpOnly` cookies, so it will miss most auth tokens.

Paste in DevTools Console:

```javascript
(() => {
  const rows = document.cookie.split('; ').filter(Boolean).map(p => {
    const i = p.indexOf('=');
    return { name: p.slice(0, i), value: p.slice(i + 1) };
  }).sort((a, b) => a.name.localeCompare(b.name));
  console.table(rows);
  console.log(`Total: ${rows.length} JS-visible cookies, ${document.cookie.length} bytes`);
  console.warn('⚠️  HttpOnly cookies are NOT in this list. Cross-check with Application → Cookies.');
  return rows;
})();
```

Useful for: capturing a quick baseline, diffing before/after a login by name (since `document.cookie` exposes names of non-HttpOnly entries).
Not useful for: capturing auth cookies.

### Method 3 — Chrome's `chrome.cookies` extension API

If the user is comfortable writing a small extension or already has one (e.g., "EditThisCookie", "Cookie-Editor"), those tools expose all cookies via the privileged extension API. They can also export to JSON / Netscape format.

Caveats:
- Requires installing a third-party extension. Vet it — cookie-export extensions are a known malware vector.
- Recommend reputable open-source options if the user wants this route. **Cookie-Editor** (open source, audited) is the typical pick. **Avoid** "EditThisCookie 3" which was sold and flagged.

### Method 4 — Playwright captures its own session

If the user is already willing to drive a login through Playwright, they can dump everything in one call:

```javascript
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chromium', headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('https://www.example.com/login');
  console.log('Sign in manually in the window. Press Enter in this terminal when done.');
  await new Promise(r => process.stdin.once('data', r));
  await context.storageState({ path: 'auth.json' });
  console.log('Saved cookies + localStorage to auth.json');
  await browser.close();
})();
```

`auth.json` contains everything — HttpOnly cookies, localStorage, sessionStorage — in Playwright's native format, ready for `newContext({ storageState: 'auth.json' })` later.

## What to do with the captured cookies

After capture, the user typically wants to:

- **Identify which cookie authenticates them** → hand off to `find-out-auth-cookie-of-a-site` skill.
- **Replay the session in Playwright** → use `context.addCookies([...])` with the captured rows.
- **Replay the session in curl** → copy as `-H "Cookie: name1=value1; name2=value2; ..."` or use the "Copy as cURL" right-click in DevTools Network tab.
- **Compare before/after sign-in** → capture twice and diff by cookie name.

## Common pitfalls to surface to the user

- **Filter box hides cookies.** A stale text filter in the DevTools cookie panel is the #1 reason users say "I only see 3 cookies." Tell them to clear it.
- **Wrong domain selected.** Cookies are scoped to domains. `www.example.com` and `.example.com` and `example.com` are three different rows in the sidebar. Pick the one matching the URL bar; check all three if unsure.
- **Session cookies die on browser close.** A cookie with `Expires = Session` is gone once the original tab/window closes. Capture them right before you need them.
- **Some cookies don't appear until a page action triggers them.** E.g., visiting `/trips` for the first time may set a `trips_*` cookie that wasn't there on the homepage. Capture on the page that actually matters.
- **Browser sync can interfere.** If the user is signed into Chrome with sync, cookies copied off one machine may not match what the same site sets on another. Capture and replay on the same machine when possible.
- **Don't post cookies to GitHub issues, public Slack, screenshots in tweets, etc.** Sounds obvious; happens constantly.

## Quick-reference: how to ask the user

When this skill triggers, lead with this short instruction (one screen of guidance, not the whole document):

> To capture all cookies for `<site>`, open the page in your browser, then:
>
> 1. Open DevTools (`⌘⌥I` on Mac, `F12` on Windows/Linux).
> 2. Go to the **Application** tab (Firefox: **Storage** tab).
> 3. In the left sidebar, expand **Storage → Cookies** and click the entry for `<site>`.
> 4. Clear any filter at the top of the cookie table.
> 5. Select all rows and copy them (or screenshot the table). Make sure the HttpOnly and Secure columns are visible.
> 6. Paste here.
>
> **Important:** don't use the Console's `document.cookie` for this — it can't see `HttpOnly` cookies, which is where session credentials live.

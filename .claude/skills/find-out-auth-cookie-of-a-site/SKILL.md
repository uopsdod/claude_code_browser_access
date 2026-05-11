---
name: find-out-auth-cookie-of-a-site
description: Identify which subset of cookies actually authenticates a user on a given website. Use when the user asks "which cookie is the auth cookie for site X", "how do I replay my session for Y in Playwright", "what HttpOnly cookie logs me in", or wants to figure out the minimum cookie set to access logged-in-only data on a site. The skill walks through grabbing all cookies, diffing pre/post sign-in, and running a Playwright probe script to test which subsets keep the user logged in.
---

# Find out the auth cookie of a site

This skill helps the user discover **which cookie (or small set of cookies) is sufficient to authenticate** against a target website — so they can replay their logged-in session in Playwright, curl, or another automation tool.

The approach is empirical: capture cookies before and after sign-in, then run a Playwright probe that tries every interesting subset and reports which ones actually unlock signed-in content.

## When this skill applies

Trigger when the user says things like:
- "Which cookie is the auth cookie on `<site>`?"
- "How do I log in to `<site>` from Playwright using my existing session?"
- "I want to scrape logged-in data from `<site>` — what cookies do I need?"
- "Help me figure out the minimum cookie set to authenticate against `<site>`."

Do **not** apply when the user just wants to log in via Playwright form-filling (that's a different workflow).

## Security guardrails

Before doing anything:

1. **Only investigate sites the user owns an account on.** This skill is about replaying *the user's own* session — not session hijacking, credential theft, or scraping someone else's account.
2. **Cookie values are credentials.** Treat them like passwords. Don't paste them into shared chats, public logs, or version control. Mask values in transcripts when you don't need to inspect them.
3. **HttpOnly cookies cannot be read by `document.cookie`.** That's the whole point of the flag. The user must use DevTools → Application → Cookies (or `chrome.cookies` API) to see them, not JavaScript.
4. **Site terms of service may forbid automation.** Inform the user; let them decide.

## The workflow

### Phase 1 — Tell the user how to grab all cookies

Ask the user to do this in their normal browser (Chrome/Edge/Firefox/Safari with DevTools):

**1. Open the target site (e.g., `https://www.example.com`) signed out (or fresh incognito).**

**2. Run this in DevTools Console to capture the JS-visible baseline cookies:**

```javascript
(() => {
  const rows = document.cookie.split('; ').filter(Boolean).map(p => {
    const i = p.indexOf('=');
    return { name: p.slice(0, i), value: p.slice(i + 1) };
  }).sort((a, b) => a.name.localeCompare(b.name));
  console.table(rows);
  console.log(`Total: ${rows.length} JS-visible cookies, ${document.cookie.length} bytes`);
  window.__cookiesBefore = new Set(rows.map(r => r.name));
  return rows;
})();
```

**3. Open DevTools → Application → Cookies → `<site domain>`** and screenshot or paste the full table — including `HttpOnly` and `Secure` columns. (The console snippet above CANNOT see HttpOnly cookies; the Application panel can.)

**4. Sign in normally through the site's UI.**

**5. Repeat step 2 and step 3** after sign-in. Two outputs again.

**6. Send all four outputs to Claude.** Console diff + DevTools Application panel screenshot/dump, both before and after sign-in.

### Phase 2 — Identify auth-candidate cookies

Compare the two sets. The candidates for the actual auth cookie are cookies that:

- Appear **only** after sign-in (or whose value changed at sign-in), **AND**
- Are marked `HttpOnly` (real auth cookies almost always are — to defend against XSS), **AND**
- Are `Secure` (sent over HTTPS only), **AND**
- Live on the site's primary domain (not a third-party tracker domain like `.tiktok.com` or `.bing.com`).

Common patterns by naming convention (heuristic, not guaranteed):

| Suffix / name pattern | Likely role |
|---|---|
| `*.sid`, `*sessionid*`, `JSESSIONID`, `connect.sid` | Active session ID — **most likely the auth credential** |
| `*.token`, `csrf*`, `_csrf` | CSRF token, NOT auth on its own |
| `*.stoken`, `*refresh*`, `rtoken` | Refresh / persistent token |
| `*uid*`, `*member*`, `*userid*` | User identifier — usually not the credential itself |
| `mst_*`, `_abck`, `bm_*`, `_forter*` | Anti-bot / fingerprinting — not auth |
| `_ga*`, `_fbp`, `_uet*`, `__gads` | Analytics / ad attribution — not auth |

Filter out the third-party tracker noise. Build a shortlist of 1–6 candidates.

### Phase 3 — Probe subsets with Playwright

Use the template at `scripts/cookie-probe-template.js` in this skill's folder. Steps:

1. Set up a clean workspace:
   ```bash
   mkdir -p ~/Downloads/auth-cookie-probe && cd ~/Downloads/auth-cookie-probe
   npm init -y
   npm i playwright
   npx playwright install chromium
   ```
2. Copy the template script there (path below).
3. Edit it to fill in:
   - **Target URL** — a logged-in-only page on the site (e.g. `/trips`, `/account`, `/inbox`)
   - **All candidate cookies** with full attributes (name, value, domain, path, httpOnly, secure, sameSite, expires)
   - **Trial subsets** — combinations to test
   - **Probe function** — what to look for in the rendered page that proves the user is signed in (their name, an email, trip names, account email, etc.)
4. Run: `node cookie-probe-template.js`
5. Read the table.

**The script template lives at:** `${SKILL_DIR}/scripts/cookie-probe-template.js`

When the user is ready, copy that file to their workspace and walk them through editing the `allCookies` and `tripContentMarkers` arrays.

### Phase 4 — Interpret the results

The truth table reveals which cookies are load-bearing:

- A subset works ⇒ those cookies are *sufficient*.
- A subset including X works AND the same subset minus X fails ⇒ X is *necessary*.
- The smallest sufficient subset is your minimum auth set.

**Example result pattern from the Kayak.com case study:**

| Trial | Result |
|---|---|
| no cookies (control) | ❌ logged-out |
| `p1.med.token` only | ❌ logged-out |
| `p1.med.sid` only | ✅ logged in |
| `p1.med.stoken` only | ❌ logged-out |
| `sid + token` | ✅ logged in |
| `stoken + token` | ❌ logged-out |
| all three | ✅ logged in |

Conclusion: **`p1.med.sid` alone is necessary and sufficient** for read access. The "token" and "stoken" cookies didn't matter for the `/trips` read path. Naming was misleading: `*.stoken` was *not* a refresh token in the OAuth sense — the server did not auto-mint a new session from it.

This tells the user the **minimum cookie set** for replay, and surfaces useful security insight (e.g., "one HttpOnly cookie is the entire lock on the read API").

### Phase 5 — Reproducible Playwright login

Once the minimum set is known, give the user a small launcher:

```javascript
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chromium', headless: false });
  const context = await browser.newContext();
  await context.addCookies([
    { name: '<MIN_COOKIE_NAME>', value: '<VALUE>',
      domain: '<.site.com or www.site.com>', path: '/',
      httpOnly: true, secure: true, sameSite: 'None' },
  ]);
  const page = await context.newPage();
  await page.goto('<logged-in-only URL>');
  // Drop into REPL-style scraping or save storageState for later runs:
  await context.storageState({ path: 'auth.json' });
  // ...
})();
```

For future runs, `await chromium.launchPersistentContext('./userdata', {...})` or `await browser.newContext({ storageState: 'auth.json' })` makes login persistent.

## Common pitfalls to surface to the user

- **Session cookies (no `expires`) die when the original browser closes.** Re-grab them right before running the probe.
- **Some sites bind cookies to IP / TLS fingerprint / User-Agent.** If a freshly copied cookie still fails, the issue may be fingerprint mismatch (Forter, Akamai Bot Manager, Cloudflare Bot Fight). Try `playwright-extra` + stealth, or a persistent user-data-dir to look less synthetic.
- **The URL not redirecting is NOT proof of authentication.** Many SPAs render the same skeleton URL whether you're logged in or not — the actual gate is on an API request that fetches user data. Always probe **rendered content**, not just the final URL. (This was a real surprise in the kayak case study; we had to switch from URL-based detection to content-based detection.)
- **`p1.med.token`-style CSRF cookies are still needed for state-changing requests** (POST/PUT/DELETE) even if not required for reads. If the user wants to *modify* data (not just read), test those operations too.
- **Browser auto-deletes Session-scoped cookies on close**, even with Playwright. Use `--profile-directory` / `launchPersistentContext` if you need them to survive across runs.

## Quick-reference: how to ask the user for cookies

Use this exact wording when starting Phase 1 with a user:

> To find your auth cookie I need to see **all** cookies on `<site>` both **before and after sign-in**. Please:
>
> 1. Open `<site>` in a fresh incognito window (signed out).
> 2. Open DevTools (F12) → **Application** tab → **Storage** → **Cookies** → click the entry for `<site>`. Screenshot or copy the full table.
> 3. Sign in to the site normally.
> 4. Repeat step 2 — take a second screenshot/copy of the cookie table.
> 5. Paste both here.
>
> Two notes:
> - I need the Application panel view, not just `document.cookie` from the Console — the auth cookie is almost always `HttpOnly`, which JS can't see.
> - Cookie values are credentials. Don't share them anywhere public after we're done.

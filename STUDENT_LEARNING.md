# Student learning notes

Things worth understanding from working through this repo, organized for someone who's seen "Playwright" mentioned in three different contexts and isn't sure which is which.

---

## Playwright MCP vs. Playwright library vs. Playwright CLI

The word "Playwright" gets reused for three different things. They are not interchangeable, and choosing the wrong one is the source of most of the confusion in this project.

### The three things

| Name | What it is | How you invoke it |
|---|---|---|
| **Playwright library** | A Node.js package (`npm install playwright`) that exposes the full browser-automation API: launch a browser, build a context, set cookies, click, fill, evaluate, intercept requests, attach to CDP, etc. | `require('playwright')` inside a `.js` file, then run with `node yourscript.js`. |
| **Playwright CLI** | A command-line tool, `npx playwright`, that *manages* Playwright. Used for setup, codegen, the test runner — not for driving a browser at runtime. | `npx playwright install chromium`, `npx playwright codegen`, `npx playwright test`. |
| **Playwright MCP** | A Model Context Protocol server that wraps a curated *subset* of the Playwright library and exposes each piece as a tool an AI assistant can call. | The assistant calls tools like `mcp__playwright__browser_navigate`, `mcp__playwright__browser_click`, `mcp__playwright__browser_evaluate`. No file required. |

### Feature comparison

| Capability | Playwright library (Node) | Playwright CLI | Playwright MCP |
|---|---|---|---|
| Launch a browser | ✅ `chromium.launch()` | ❌ (not its job) | ✅ implicit on first tool call |
| Navigate to a URL | ✅ `page.goto()` | ❌ | ✅ `browser_navigate` |
| Click / fill / evaluate JS in page | ✅ | ❌ | ✅ `browser_click`, `browser_fill`, `browser_evaluate` |
| Take screenshot / DOM snapshot | ✅ | ❌ | ✅ `browser_take_screenshot`, `browser_snapshot` |
| **Set HttpOnly cookies** | ✅ `context.addCookies()` (via CDP) | ❌ | ❌ only `document.cookie` via `browser_evaluate`, which the browser blocks for HttpOnly |
| Load `storageState` (cookies + localStorage) | ✅ `newContext({ storageState })` | ❌ | ❌ |
| Attach to a real Chrome via CDP | ✅ `chromium.connectOverCDP()` | ❌ | ❌ |
| Persistent profile | ✅ `launchPersistentContext()` | ❌ | ❌ |
| Request interception / route handlers | ✅ `page.route()` | ❌ | ❌ |
| Install Chromium binary | ❌ (assumes it's already there) | ✅ `npx playwright install chromium` | ❌ |
| Record a script by hand-driving the browser | ❌ | ✅ `npx playwright codegen` | ❌ |
| Test runner (assertions, parallel, retries) | ❌ (not the library's job) | ✅ `npx playwright test` | ❌ |
| **Repeatability** — commit a file, run on cron | ✅ it IS a file | n/a | ❌ each run is a fresh conversation |
| **Conversational, no-file iteration** | ❌ you'd write/edit/run a script per try | ❌ | ✅ that's the whole point |

### When to reach for which

- **Playwright CLI** — only for **setup and tooling**: installing the browser binary the first time (`npx playwright install chromium`), or recording selectors interactively with `codegen`. Not used at runtime.

- **Playwright MCP** — for **anonymous, exploratory, single-shot** browser work. "Open this URL and tell me what's on it." Great for the 2.2 step of this repo's demo ladder (scrape flight cards from an anonymous page) and for poking at unfamiliar sites. Loses its appeal the moment authentication or repetition enters the picture.

- **Playwright library (Node)** — for **anything that touches HttpOnly auth, needs to run again later, or has more than ~10 interaction steps**. This is what `lib/playwright-chromium.js` wraps and what every `trips/*.js` driver in this repo uses.

### The decision rule for this repo

> **Anything that touches HttpOnly auth or is worth keeping → Node + Playwright library.**
> **Anything anonymous and exploratory → Playwright MCP.**
> **Setup only → Playwright CLI.**

That rule alone resolves which tool to use for every step in the 2.x demo ladder.

### Why the HttpOnly distinction is the whole game

The Playwright **library** can call `context.addCookies(...)`, which under the hood drives Chromium over CDP (the Chrome DevTools Protocol). It writes cookies directly into the browser's cookie store, including the `HttpOnly` flag — the same path DevTools itself uses when you right-click a cookie row and edit the value.

The Playwright **MCP** does not expose `addCookies` as a tool. The only way it can touch cookies is `browser_evaluate("() => { document.cookie = '...' }")`, which runs inside the page. The web platform deliberately blocks `document.cookie` from setting or reading HttpOnly cookies — that's an XSS defense baked into the cookie spec.

Kayak's auth cookies (`p1.med.sid`, `kayak.mc`, `p1.med.stoken`, `mtoken.*`, `Apache`, `kmkid`) are all marked HttpOnly. So:

- MCP injection → navigation succeeds, but `/trips` renders the signed-out landing page.
- Node `addCookies` → `/trips` renders the real trip list.

This single fact is the reason `lib/playwright-chromium.js` and the `trips/*.js` drivers exist at all. If MCP could set HttpOnly cookies, the whole Node layer would be optional.

### How the call stack actually looks when you run a Node driver

```
$ node trips/list-trips.js
       │
       ▼
trips/list-trips.js                                  ← your driver (10–30 lines)
       │  require('../lib/playwright-chromium')
       ▼
lib/playwright-chromium.js                           ← repo helper: launchWithCookies()
       │  require('playwright')
       ▼
node_modules/playwright/                             ← Playwright the library
       │  speaks CDP
       ▼
Chromium browser process                             ← Network.setCookies (with HttpOnly)
       │
       ▼
Cookie store now has p1.med.sid — next page.goto() sends it, server recognizes the session.
```

The Playwright CLI does not appear in this chain at runtime. It only existed before the first run, to put the Chromium binary on disk via `npx playwright install chromium`.

### Mental model summary

- **MCP** = REPL for the browser. Great when you're talking to the browser.
- **Library** = saved program. Great when you've figured the flow out and want to run it — especially with auth, repeatedly, or as part of a larger pipeline.
- **CLI** = `apt-get install` for browsers and a couple of dev-time helpers. Use once, then forget.

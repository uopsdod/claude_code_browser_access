// cookie-probe-template.js
//
// Goal: figure out which subset of cookies is sufficient to keep the user
// authenticated on a given website. Try every interesting combination and
// see which ones render real signed-in content.
//
// Setup:
//   mkdir -p ~/Downloads/auth-cookie-probe && cd ~/Downloads/auth-cookie-probe
//   npm init -y
//   npm i playwright
//   npx playwright install chromium
//
// Edit the four ████ EDIT ████ sections below, then:
//   node cookie-probe-template.js
//
// Output: a verdict table — which cookie subsets pass / fail / are ambiguous,
// plus a short text snippet from each rendered page so you can sanity-check.

const { chromium } = require('playwright');

// ████ EDIT 1 ████ — target page that is ONLY accessible when signed in.
// Pick something that shows real user data (saved items, inbox, trips, profile).
const TARGET_URL = 'https://www.example.com/account';

// ████ EDIT 2 ████ — all candidate cookies, with full attributes.
// Copy values fresh from DevTools → Application → Cookies right before running.
// Match domain / path / httpOnly / secure / sameSite to what the site set.
// For Session-lived cookies, omit `expires`; otherwise pass a Unix seconds value.
const allCookies = [
  // {
  //   name: 'auth_session',
  //   value: 'PASTE_VALUE_HERE',
  //   domain: 'www.example.com',
  //   path: '/',
  //   httpOnly: true,
  //   secure: true,
  //   sameSite: 'Lax', // 'Strict' | 'Lax' | 'None'
  //   // expires: Math.floor(new Date('2027-01-01Z').getTime() / 1000),
  // },
  // ...add more candidates
];

// ████ EDIT 3 ████ — subsets to test.
// Start with the control (no cookies) and each candidate alone, then mixes.
// Cookie name strings here must match `allCookies[i].name`.
const trials = [
  { name: 'no cookies (control)', cookies: [] },
  // { name: 'auth_session only',  cookies: ['auth_session'] },
  // { name: 'csrf only',          cookies: ['csrf'] },
  // { name: 'session + csrf',     cookies: ['auth_session', 'csrf'] },
  // { name: 'all candidates',     cookies: allCookies.map(c => c.name) },
];

// ████ EDIT 4 ████ — what counts as "logged in" on this page?
// The probe runs inside the page (browser context). Return signals you can use
// to classify the trial. Common ideas:
//   - Look for the user's email / name in the DOM
//   - Look for a "Sign out" button (and the absence of "Sign in")
//   - Count user-data cards (saved items, trip cards, inbox messages)
//   - Look for a logged-in-only API call's response shape in the DOM
const probePage = async (page) => {
  return await page.evaluate(() => {
    const text = document.body.innerText;

    // Tweak these regexes for the target site.
    const loggedOutMarkers = [
      /sign in to (see|manage|view)/i,
      /please sign in/i,
      /log in to continue/i,
    ];
    const loggedInMarkers = [
      // e.g. user's email, "Sign out", "My account", a known trip name
      /sign\s*out/i,
      /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/, // any email
    ];

    const userDataSelectors = [
      // tweak: containers that only render with real user data
      '[data-testid*="user" i]',
      '[class*="trip" i][class*="card" i]',
      'article',
    ];
    let userDataCount = 0;
    for (const sel of userDataSelectors) {
      userDataCount = Math.max(userDataCount, document.querySelectorAll(sel).length);
    }

    return {
      bodyLen: text.length,
      snippet: text.replace(/\s+/g, ' ').slice(0, 240),
      loggedOutHits: loggedOutMarkers.filter(r => r.test(text)).map(r => r.source),
      loggedInHits:  loggedInMarkers.filter(r => r.test(text)).map(r => r.source),
      userDataCount,
    };
  }).catch(e => ({ error: e.message }));
};

const classify = (probe) => {
  if (probe.error) return `⚠️  ${probe.error}`;
  if (probe.userDataCount > 2 || probe.loggedInHits.length > 0) {
    return `✅ LOGGED IN  (markers=${probe.loggedInHits.length}, userDataCount=${probe.userDataCount})`;
  }
  if (probe.loggedOutHits.length > 0) {
    return `❌ LOGGED OUT (${probe.loggedOutHits[0]})`;
  }
  return `❓ ambiguous  (bodyLen=${probe.bodyLen})`;
};

(async () => {
  if (allCookies.length === 0) {
    console.error('No cookies defined. Edit ████ EDIT 2 ████ in this script.');
    process.exit(1);
  }
  if (trials.length === 1) {
    console.warn('Only the control trial is defined. Add more in ████ EDIT 3 ████.');
  }

  // channel: 'chromium' uses the full Chromium build (avoids needing the
  // chromium-headless-shell binary, which is a separate download).
  const browser = await chromium.launch({ channel: 'chromium', headless: true });

  console.log(`\nProbing ${TARGET_URL}\n${'='.repeat(72)}`);
  for (const t of trials) {
    const context = await browser.newContext();
    const subset = allCookies.filter(c => t.cookies.includes(c.name));
    if (subset.length) await context.addCookies(subset);

    const page = await context.newPage();
    try {
      await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForTimeout(5000); // let client-side XHRs settle
    } catch (e) {
      console.log(`${t.name.padEnd(28)} → ⚠️  navigation: ${e.message}`);
      await context.close();
      continue;
    }

    const probe = await probePage(page);
    const verdict = classify(probe);
    console.log(`${t.name.padEnd(28)} → ${verdict}`);
    console.log(`    url: ${page.url()}`);
    console.log(`    snippet: ${probe.snippet || '(none)'}`);

    await context.close();
  }

  console.log(`${'='.repeat(72)}`);
  console.log('Interpretation:');
  console.log('  - Subset works ⇒ those cookies are SUFFICIENT.');
  console.log('  - Subset X works AND subset X minus cookie C fails ⇒ C is NECESSARY.');
  console.log('  - The smallest sufficient subset = your minimum auth set.');

  await browser.close();
})();

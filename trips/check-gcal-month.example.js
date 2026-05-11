// trips/check-gcal-month.js — read events for a month on calendar.google.com.
// Replaces: read-gcal-june.js
const { launchWithCookies } = require('../lib/playwright-chromium');
const { loadMonthView, scrapeMonthEvents } = require('../lib/gcal-flows');
const cookies = require('../lib/gcal-cookies');

const CFG = { account: 2, year: 2026, month: 6 };

(async () => {
  const { browser, page } = await launchWithCookies(cookies);

  const diag = await loadMonthView(page, CFG);
  console.log('Loaded:', diag);
  if (!diag.looksLikeCalendar) { console.log('Cookies expired or wrong page.'); await browser.close(); return; }

  const { events, cells } = await scrapeMonthEvents(page);
  console.log('\n=== Events on month view ===');
  for (const e of events) console.log(`  ${e.text || e.aria}`);

  console.log('\n=== Per-day gridcell text (first 15) ===');
  for (const c of cells.slice(0, 15)) console.log(`  ${c}`);

  await browser.close();
})();

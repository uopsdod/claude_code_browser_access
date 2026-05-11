// trips/block-gcal-spain.js — create an all-day "Spain Trip" event Jun 21–28, 2026.
// Replaces: block-spain-trip-final.js
const { launchWithCookies } = require('../lib/playwright-chromium');
const { loadMonthView, createAllDayEvent, verifyEvent } = require('../lib/gcal-flows');
const cookies = require('../lib/gcal-cookies');

const EVENT = {
  account: 2,
  year: 2026,
  month: 6,
  title: 'Spain Trip (TPE → MAD)',
  startText: 'Jun 21, 2026',
  endText:   'Jun 28, 2026',
  description: 'Flight: TPE 5:15 pm Tue Jun 23 → MAD 8:40 am+1 (China Eastern, 1 stop SHA-PVG, 21h 25m, $443, Kiwi.com)',
};

(async () => {
  const { browser, page } = await launchWithCookies(cookies);

  const diag = await loadMonthView(page, EVENT);
  if (!diag.looksLikeCalendar) { console.log('Cookies expired.'); await browser.close(); return; }
  console.log('On calendar as:', diag.email);

  const pre = await createAllDayEvent(page, EVENT);
  console.log('Saved event:', pre);

  const v = await verifyEvent(page, EVENT);
  console.log('Event present on month view:', v.present);

  await browser.close();
})();

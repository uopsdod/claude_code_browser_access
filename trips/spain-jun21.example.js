// trips/spain-jun21.js — Spain Trip Jun 21–28 + cheapest TPE→MAD on Jun 23 attached.
// Replaces: add-spain-trip-jun21.js + save-cheapest-jun23.js
const { launchWithCookies } = require('../lib/playwright-chromium');
const { createTrip, findCheapestFlights, saveCheapestToTrip, verifyTrip } = require('../lib/kayak-flows');
const cookies = require('../lib/kayak-cookies');

const TRIP = {
  origin: 'TPE',
  destIata: 'MAD',
  destLabel: 'Madrid',
  depart: '2026-06-23',
  tripName: 'Spain Trip',
  startAria: 'June 21, 2026',
  endAria:   'June 28, 2026',
  targetMonth: 'June 2026',
};

(async () => {
  const { browser, page } = await launchWithCookies(cookies);

  console.log('Creating empty trip...');
  await createTrip(page, TRIP);

  console.log('Searching cheapest flights...');
  const top = await findCheapestFlights(page, { origin: TRIP.origin, dest: TRIP.destIata, date: TRIP.depart });
  for (const [i, c] of top.entries()) console.log(`  [${i + 1}] ${c.slice(0, 200)}`);

  console.log('Saving cheapest to trip...');
  const saved = await saveCheapestToTrip(page, { tripName: TRIP.tripName });
  console.log('Saved:', saved.slice(0, 200));

  const state = await verifyTrip(page, { tripName: TRIP.tripName });
  console.log('Trip attached:', state.attached, 'URL:', state.url);

  await browser.close();
})();

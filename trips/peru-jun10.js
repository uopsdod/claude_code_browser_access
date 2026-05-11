// trips/peru-jun10.js — Peru Trip Jun 10–17 + cheapest TPE→LIM attached.
// Replaces: add-peru-trip.js
const { launchWithCookies } = require('../lib/playwright-chromium');
const { createTripAndAttachCheapest, verifyTrip } = require('../lib/kayak-flows');
const cookies = require('../lib/kayak-cookies');

const TRIP = {
  origin: 'TPE',
  destIata: 'LIM',
  destLabel: 'Lima',
  depart: '2026-06-10',
  tripName: 'Peru Trip',
  startAria: 'June 10, 2026',
  endAria:   'June 17, 2026',
  targetMonth: 'June 2026',
};

(async () => {
  const { browser, page } = await launchWithCookies(cookies);
  const saved = await createTripAndAttachCheapest(page, TRIP);
  console.log('Saved cheapest:', saved.slice(0, 250));
  const state = await verifyTrip(page, { tripName: TRIP.tripName });
  console.log('Trip attached:', state.attached);
  await browser.close();
})();

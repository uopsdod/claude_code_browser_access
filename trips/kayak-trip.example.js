// trips/kayak-trip.example.js — TEMPLATE for Kayak end-to-end flow.
// Copy this to trips/<your-dest>-<your-date>.js, edit the TRIP config block,
// and run with `node trips/<your-dest>-<your-date>.js`.
//
// What this does:
//   1. Creates an empty trip on /trips
//   2. Searches TPE → <destIata> on `depart` date, sort=price_a
//   3. Saves the cheapest organic flight card to the trip
//   4. Verifies the trip page shows "1 saved item"
//
// The current config values (Spain, Madrid, Jun 21-28) are just an example;
// change them to whatever destination/dates you want.
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

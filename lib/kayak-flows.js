// lib/kayak-flows.js — Kayak Create-Trip, flight search, and Save-to-Trip primitives.
// Selectors derived from .claude/skills/how-to-access-kayak/SKILL.md.

/**
 * Navigate the Create-Trip date picker to a target month and click a target day.
 * The next-month arrow has no aria-label; it's the 2nd icon-only div[role=button]
 * inside .OV9e-month-nav.
 */
async function pickDate(page, targetMonthYear, targetAriaLabel) {
  const captionNow = () => page.evaluate(() =>
    document.querySelector('[role="grid"] caption')?.textContent.trim() || '');
  let safety = 12;
  while ((await captionNow()) !== targetMonthYear && safety-- > 0) {
    await page.locator('.OV9e-month-nav > div[role="button"]').nth(1).click();
    await page.waitForTimeout(700);
  }
  if ((await captionNow()) !== targetMonthYear) {
    throw new Error(`Calendar did not reach ${targetMonthYear}`);
  }
  await page.locator(`[aria-label="${targetAriaLabel}"]`).first().click();
}

/**
 * Create an empty trip on /trips.
 *
 * @param {Page}   page
 * @param {Object} cfg
 * @param {string} cfg.destLabel    — typed into the Destination autocomplete (e.g. "Madrid")
 * @param {string} cfg.tripName     — the trip name (e.g. "Spain Trip")
 * @param {string} cfg.startAria    — aria-label of the start date cell (e.g. "June 21, 2026")
 * @param {string} cfg.endAria      — aria-label of the end date cell; must be ≥ start + 7 days
 * @param {string} cfg.targetMonth  — caption string of the calendar grid (e.g. "June 2026")
 */
async function createTrip(page, cfg) {
  const { destLabel, tripName, startAria, endAria, targetMonth } = cfg;

  await page.goto('https://www.kayak.com/trips', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await page.getByRole('button', { name: 'Create Trip' }).first().click();
  await page.waitForTimeout(2500);

  // Destination
  const destInput = page.locator('input[type="text"]').nth(0);
  await destInput.click();
  await destInput.fill(destLabel);
  await page.waitForTimeout(2000);
  const opt = page.locator(`[role="option"]:has-text("${destLabel}"), li:has-text("${destLabel}")`).first();
  if (await opt.count() > 0) await opt.click(); else await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);

  // Trip name
  await page.getByLabel(/^Trip name$/i).fill(tripName);

  // Start date — first "Change date" trigger, prefix-match independent of weekday
  await page.locator('div[role="button"][aria-label^="Change date,"]').first().click();
  await page.waitForTimeout(1500);
  await pickDate(page, targetMonth, startAria);
  await page.waitForTimeout(1500);

  // End date — second trigger after Start is set
  await page.locator('div[role="button"][aria-label^="Change date,"]').nth(1).click();
  await page.waitForTimeout(1500);
  await pickDate(page, targetMonth, endAria);
  await page.waitForTimeout(1500);

  await page.getByRole('button', { name: 'Save' }).first().click();
  await page.waitForTimeout(6000);
}

/**
 * Search /flights/<origin>-<dest>/<YYYY-MM-DD>?sort=price_a and return the
 * top N organic flight cards (skips sponsored "Ad disclaimer" rows).
 *
 * @returns {Array<string>} card text excerpts, cheapest first
 */
async function findCheapestFlights(page, { origin, dest, date, top = 5 }) {
  // Warm up on homepage so the search request looks human
  await page.goto('https://www.kayak.com/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  const url = `https://www.kayak.com/flights/${origin}-${dest}/${date}?sort=price_a`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(20000);

  if (page.url().includes('/help/bots.html')) {
    throw new Error('Kayak bot-detection redirected to /help/bots.html');
  }

  return page.evaluate((top) => {
    const seen = new Set(); const out = [];
    for (const el of document.querySelectorAll('div')) {
      const t = el.innerText || '';
      if (!/\$\d{2,4}\b/.test(t)) continue;
      if (!/\d{1,2}:\d{2}/.test(t)) continue;
      if (!/(stop|nonstop)/i.test(t)) continue;
      if (t.length > 1000) continue;
      if (/Ad disclaimer/.test(t)) continue;
      const key = t.slice(0, 60).replace(/\s+/g, ' ');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(t.replace(/\s+/g, ' ').slice(0, 400));
      if (out.length >= top) break;
    }
    return out;
  }, top);
}

/**
 * On a flight search results page, click Save on the cheapest organic card
 * and pick the named trip in the bottom-sheet picker.
 * Assumes page is already on a results URL.
 */
async function saveCheapestToTrip(page, { tripName }) {
  // Tag the cheapest organic card's Save heart
  const tagged = await page.evaluate(() => {
    for (const el of document.querySelectorAll('div')) {
      const t = el.innerText || '';
      if (!/\$\d{2,4}\b/.test(t)) continue;
      if (!/\d{1,2}:\d{2}/.test(t)) continue;
      if (!/(stop|nonstop)/i.test(t)) continue;
      if (t.length > 1000) continue;
      if (/Ad disclaimer/.test(t)) continue;
      const save = el.querySelector('[aria-label="Save"]');
      if (save) {
        save.setAttribute('data-cheap', '1');
        return t.slice(0, 250).replace(/\s+/g, ' ');
      }
    }
    return null;
  });
  if (!tagged) throw new Error('No organic flight card found');

  await page.locator('[data-cheap="1"]').first().click();
  await page.waitForTimeout(3500);
  await page.locator(`[role="button"][aria-label^="Save to ${tripName}"]`).first().click();
  await page.waitForTimeout(5000);

  return tagged;
}

/**
 * End-to-end: create an empty trip + search + save cheapest. Convenience wrapper
 * that composes the three primitives above.
 */
async function createTripAndAttachCheapest(page, cfg) {
  await createTrip(page, cfg);
  await findCheapestFlights(page, { origin: cfg.origin, dest: cfg.destIata, date: cfg.depart, top: 5 });
  return saveCheapestToTrip(page, { tripName: cfg.tripName });
}

/**
 * Verify a trip exists and reports how many items are attached. Navigates to /trips.
 */
async function verifyTrip(page, { tripName }) {
  await page.goto('https://www.kayak.com/trips', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await page.locator(`a:has-text("${tripName}")`).first().click();
  await page.waitForTimeout(5000);
  return page.evaluate(() => {
    const body = document.body.innerText.replace(/\s+/g, ' ');
    return {
      url: location.href,
      attached: /1 saved item|1 flight/i.test(body),
      excerpt: body.slice(0, 1200),
    };
  });
}

module.exports = {
  pickDate,
  createTrip,
  findCheapestFlights,
  saveCheapestToTrip,
  createTripAndAttachCheapest,
  verifyTrip,
};

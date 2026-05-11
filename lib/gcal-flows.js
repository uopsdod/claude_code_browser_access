// lib/gcal-flows.js — Google Calendar read + write primitives.
// Selectors derived from .claude/skills/how-to-access-google-calendar/SKILL.md.

/**
 * Load a month view for the given account and YYYY-M (month is 1-indexed).
 * Returns { url, looksLikeCalendar, email } — verify .looksLikeCalendar before scraping.
 */
async function loadMonthView(page, { account = 2, year, month, day = 1 } = {}) {
  const url = `https://calendar.google.com/calendar/u/${account}/r/month/${year}/${month}/${day}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(10_000);
  return page.evaluate(() => ({
    url: location.href,
    title: document.title,
    onSignIn: /accounts\.google\.com|ServiceLogin/i.test(location.href),
    looksLikeCalendar: /My calendars|Other calendars/.test(document.body.innerText),
    email: (Array.from(document.querySelectorAll('[aria-label*="@"]'))
      .map(el => el.getAttribute('aria-label'))
      .find(s => s && /\S+@\S+\.\S+/.test(s))) || null,
  }));
}

/**
 * Scrape event titles from the current month view. Pulls both event chips and
 * the per-day gridcell text (the latter is useful for multi-day events).
 *
 * Call AFTER loadMonthView returns looksLikeCalendar: true.
 */
async function scrapeMonthEvents(page) {
  const events = await page.evaluate(() => {
    const out = [];
    const seen = new Set();
    for (const el of document.querySelectorAll('[role="button"], button, [data-eventid], [data-eventchip], a')) {
      const aria = el.getAttribute('aria-label') || '';
      const text = (el.innerText || '').trim().replace(/\s+/g, ' ');
      const blob = aria || text;
      if (!blob || blob.length < 5 || blob.length > 400) continue;
      // Skip UI chrome
      if (/^(Today|Previous|Next|Switch|Search|Settings|Create|Calendar list|Add|Skip|Keyboard|Accessibility|Feedback|Support|Menu|My calendars|Other calendars|Drawer Navigation|Side panel)/i.test(blob)) continue;
      const hasDate = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}/i.test(blob);
      const hasTime = /\b\d{1,2}(:\d{2})?\s*(AM|PM)/i.test(blob);
      const hasCalLabel = /Calendar:/i.test(blob);
      const hasAllDay = /all day/i.test(blob);
      if (!(hasDate || hasTime || hasCalLabel || hasAllDay)) continue;
      const key = blob.slice(0, 120);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ aria, text: text.slice(0, 200) });
      if (out.length >= 60) break;
    }
    return out;
  });

  const cells = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('[role="gridcell"]'))
      .map(td => (td.innerText || '').trim().replace(/\s+/g, ' '))
      .filter(t => t.length > 0)
      .slice(0, 40);
  });

  return { events, cells };
}

/**
 * Create an all-day event by driving the full editor. Uses the keyboard
 * shortcut "c" to bypass the flaky quick-create popup.
 *
 * Must be called from a month view (loadMonthView returned looksLikeCalendar=true).
 *
 * @param {Object} cfg
 * @param {string} cfg.title       — event title (e.g. "Spain Trip (TPE → MAD)")
 * @param {string} cfg.startText   — start date in "Mmm D, YYYY" form (e.g. "Jun 21, 2026")
 * @param {string} cfg.endText     — end date in "Mmm D, YYYY"
 * @param {string} [cfg.description] — optional description
 */
async function createAllDayEvent(page, cfg) {
  const { title, startText, endText, description } = cfg;

  // Press "c" → opens /eventedit?overrides=...
  await page.keyboard.press('c');
  await page.waitForTimeout(6000);
  if (!/eventedit/.test(page.url())) {
    throw new Error('Keyboard "c" did not open event editor');
  }

  // Title
  await page.locator('input[aria-label="Title"]').first().fill(title);
  await page.waitForTimeout(600);

  // All-day
  const allDay = page.locator('input[type="checkbox"][aria-label="All day"]').first();
  if (!(await allDay.isChecked())) {
    await allDay.click();
    await page.waitForTimeout(1500);
  }

  // Dates
  for (const [label, value] of [['Start date', startText], ['End date', endText]]) {
    const inp = page.locator(`input[aria-label="${label}"]`).first();
    await inp.click({ clickCount: 3 });
    await page.waitForTimeout(200);
    await page.keyboard.type(value, { delay: 60 });
    await page.keyboard.press('Tab');
    await page.waitForTimeout(1500);
  }

  // Description (optional)
  if (description) {
    const desc = page.locator('[aria-label="Description"]').first();
    if (await desc.count() > 0) {
      await desc.click();
      await page.keyboard.type(description, { delay: 20 });
      await page.waitForTimeout(600);
    }
  }

  // Sanity check before save
  const pre = await page.evaluate(() => ({
    title: document.querySelector('input[aria-label="Title"]')?.value,
    start: document.querySelector('input[aria-label="Start date"]')?.value,
    end: document.querySelector('input[aria-label="End date"]')?.value,
    allDay: document.querySelector('input[type="checkbox"][aria-label="All day"]')?.checked,
  }));
  if (!pre.title || !pre.start || !pre.end || !pre.allDay) {
    throw new Error(`Pre-save check failed: ${JSON.stringify(pre)}`);
  }

  await page.locator('button[aria-label="Save"]').first().click();
  await page.waitForTimeout(8000);

  // Dismiss "Send invitation emails?" if it appears (no guests = no prompt usually)
  const dontSend = page.locator('button:has-text("Don\'t send"), button:has-text("Don’t send")').first();
  if (await dontSend.count() > 0) {
    await dontSend.click();
    await page.waitForTimeout(3000);
  }

  return pre;
}

/**
 * Verify an event with the given title appears on a month view.
 */
async function verifyEvent(page, { account = 2, year, month, title }) {
  await page.goto(`https://calendar.google.com/calendar/u/${account}/r/month/${year}/${month}/1`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(10_000);
  return page.evaluate((t) => ({
    url: location.href,
    present: document.body.innerText.includes(t),
  }), title);
}

module.exports = {
  loadMonthView,
  scrapeMonthEvents,
  createAllDayEvent,
  verifyEvent,
};

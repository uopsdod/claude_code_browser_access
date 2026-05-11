// lib/gcal-flows.js — Google Calendar READ primitives.
//
// Writes (event create/update/delete) are intentionally NOT supported here.
// Cookie-replay attempts trigger Google's OSID sync defense (302 to
// accounts.google.com/ServiceLogin → workspace.google.com marketing page),
// blocking writes even when reads succeed. CDP-attach to a real Chrome works
// but requires per-machine setup we don't want to bake into this template.
// For writes, use the official Google Calendar API or a Calendar MCP server
// such as @cocal/google-calendar-mcp.
//
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

module.exports = {
  loadMonthView,
  scrapeMonthEvents,
};

// lib/playwright-chromium.js — shared Playwright bootstrapping (Chromium only).
//
// This file specifically launches Playwright's bundled Chromium build (the one
// installed by `npm i playwright`). It does NOT support Firefox/WebKit/system
// Chrome — those would need different launch args and have not been verified
// against the kayak / Google session-cookie replays.
//
// One opinionated default that's worked for kayak.com + calendar.google.com reads.
const { chromium } = require('playwright');

const DEFAULT_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * Launch a Chromium context with the given cookies injected.
 * Returns { browser, context, page } — caller is responsible for closing browser.
 *
 * @param {Array} cookies   Playwright cookie shape: { name, value, domain, path, httpOnly, secure, sameSite }
 * @param {Object} opts     { headless, userAgent, viewport, locale }
 */
async function launchWithCookies(cookies, opts = {}) {
  const browser = await chromium.launch({
    channel: 'chromium',
    headless: opts.headless ?? false,
  });
  const context = await browser.newContext({
    userAgent: opts.userAgent ?? DEFAULT_UA,
    viewport: opts.viewport ?? { width: 1440, height: 900 },
    locale: opts.locale ?? 'en-US',
  });
  await context.addCookies(cookies);
  const page = await context.newPage();
  return { browser, context, page };
}

module.exports = { launchWithCookies, DEFAULT_UA };

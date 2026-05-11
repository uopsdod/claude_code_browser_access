// lib/gcal-cookies.example.js — placeholder shape only. Copy to gcal-cookies.js
// and fill with values from DevTools (signed in to calendar.google.com).
//
// IMPORTANT: capture from BOTH cookie tables:
//   - https://calendar.google.com  → __Secure-OSID, COMPASS
//   - .google.com                  → everything else
//
// __Secure-1PSIDTS / __Secure-3PSIDTS rotate ~daily. Re-capture before each run
// if a script worked yesterday but redirects to workspace.google.com today.
//
// See `.claude/skills/how-to-access-google-calendar/SKILL.md` for full details.

module.exports = [
  { name: '__Secure-1PAPISID', value: 'REPLACE_ME', domain: '.google.com',          path: '/', httpOnly: false, secure: true,  sameSite: 'Lax'  },
  { name: '__Secure-1PSID',    value: 'REPLACE_ME', domain: '.google.com',          path: '/', httpOnly: true,  secure: true,  sameSite: 'Lax'  },
  { name: '__Secure-1PSIDCC',  value: 'REPLACE_ME', domain: '.google.com',          path: '/', httpOnly: true,  secure: true,  sameSite: 'Lax'  },
  { name: '__Secure-1PSIDTS',  value: 'REPLACE_ME', domain: '.google.com',          path: '/', httpOnly: true,  secure: true,  sameSite: 'Lax'  },
  { name: '__Secure-3PAPISID', value: 'REPLACE_ME', domain: '.google.com',          path: '/', httpOnly: false, secure: true,  sameSite: 'None' },
  { name: '__Secure-3PSID',    value: 'REPLACE_ME', domain: '.google.com',          path: '/', httpOnly: true,  secure: true,  sameSite: 'None' },
  { name: '__Secure-3PSIDCC',  value: 'REPLACE_ME', domain: '.google.com',          path: '/', httpOnly: true,  secure: true,  sameSite: 'None' },
  { name: '__Secure-3PSIDTS',  value: 'REPLACE_ME', domain: '.google.com',          path: '/', httpOnly: true,  secure: true,  sameSite: 'None' },
  { name: '__Secure-BUCKET',   value: 'REPLACE_ME', domain: '.google.com',          path: '/', httpOnly: true,  secure: true,  sameSite: 'Lax'  },
  { name: '__Secure-OSID',     value: 'REPLACE_ME', domain: 'calendar.google.com',  path: '/', httpOnly: true,  secure: true,  sameSite: 'None' },
  { name: 'AEC',               value: 'REPLACE_ME', domain: '.google.com',          path: '/', httpOnly: true,  secure: true,  sameSite: 'Lax'  },
  { name: 'APISID',            value: 'REPLACE_ME', domain: '.google.com',          path: '/', httpOnly: false, secure: false, sameSite: 'Lax'  },
  { name: 'COMPASS',           value: 'REPLACE_ME', domain: 'calendar.google.com',  path: '/', httpOnly: true,  secure: true,  sameSite: 'None' },
  { name: 'HSID',              value: 'REPLACE_ME', domain: '.google.com',          path: '/', httpOnly: true,  secure: false, sameSite: 'Lax'  },
];

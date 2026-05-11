// lib/kayak-cookies.example.js — placeholder shape only. Copy to kayak-cookies.js
// and fill with values captured from DevTools → Application → Cookies →
// https://www.kayak.com (while signed in).
//
// See the skill `.claude/skills/get-all-cookies-of-a-site/SKILL.md` for capture steps,
// and `.claude/skills/how-to-access-kayak/SKILL.md` for which cookies matter.
//
// Minimum viable: p1.med.sid alone is sufficient for /trips reads. For writes
// (Create Trip, Save to Trip), include the full set below.

module.exports = [
  { name: 'kayak.mc',          value: 'REPLACE_ME', domain: 'www.kayak.com', path: '/', httpOnly: true, secure: true,  sameSite: 'None' },
  { name: 'kmkid',             value: 'REPLACE_ME', domain: 'www.kayak.com', path: '/', httpOnly: true, secure: true,  sameSite: 'None' },
  { name: 'mst_AAGsIw',        value: 'REPLACE_ME', domain: 'www.kayak.com', path: '/', httpOnly: true, secure: false, sameSite: 'Lax'  },
  { name: 'mst_ADIrkw',        value: 'REPLACE_ME', domain: 'www.kayak.com', path: '/', httpOnly: true, secure: false, sameSite: 'Lax'  },
  { name: 'mst_client',        value: 'REPLACE_ME', domain: 'www.kayak.com', path: '/', httpOnly: true, secure: false, sameSite: 'Lax'  },
  { name: 'mst_iBfK2g',        value: 'REPLACE_ME', domain: 'www.kayak.com', path: '/', httpOnly: true, secure: false, sameSite: 'Lax'  },
  { name: 'mtoken.MLR99PXhVgA', value: 'REPLACE_ME', domain: 'www.kayak.com', path: '/', httpOnly: true, secure: true, sameSite: 'None' },
  { name: 'p1.med.sid',        value: 'REPLACE_ME', domain: 'www.kayak.com', path: '/', httpOnly: true, secure: true,  sameSite: 'None' },
  { name: 'p1.med.stoken',     value: 'REPLACE_ME', domain: 'www.kayak.com', path: '/', httpOnly: true, secure: true,  sameSite: 'None' },
  { name: 'p1.med.token',      value: 'REPLACE_ME', domain: 'www.kayak.com', path: '/', httpOnly: true, secure: true,  sameSite: 'None' },
];

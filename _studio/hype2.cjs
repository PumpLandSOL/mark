// MARK hype video — 10s tech cut, self-contained animated scenes (_studio/hype2.html) recorded via screencast.
'use strict';
const path = require('path');
const { record } = require('./rec.cjs');
const site = 'file:///' + path.join(__dirname, 'hype2.html').replace(/\\/g, '/');
record({ site, out: path.join(__dirname, '..', 'brand', 'mark-tech-10s.mp4'), port: 9457, script: async ({ ev }) => { await ev('window.__go()', true); } })
  .catch((e) => { console.error(e); process.exit(1); });

// MARK hype video — 15s, self-contained animated scenes (_studio/hype.html) recorded via screencast.
'use strict';
const path = require('path');
const { record } = require('./rec.cjs');
const site = 'file:///' + path.join(__dirname, 'hype.html').replace(/\\/g, '/');
record({ site, out: path.join(__dirname, '..', 'brand', 'mark-hype-15s.mp4'), port: 9456, script: async ({ ev }) => { await ev('window.__go()', true); } })
  .catch((e) => { console.error(e); process.exit(1); });

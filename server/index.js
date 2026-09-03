// MARK ($MARK) — the 24/7 fair-value oracle for tokenized stocks on Robinhood Chain.
// Wall Street's tape stops at 4pm. The tokenized stocks don't. MARK keeps marking.
// Dependency-free Node: engine (server/engine.js) + real sources (server/sources.js) + SSE board.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const E = require('./engine');
const EVM = require('./evm');

const PORT = process.env.PORT || 8194;
const DATA_PATH = process.env.DATA_PATH || path.join(__dirname, '..', 'data.json');
const MARK_MINT = process.env.MARK_MINT || '';                  // $MARK contract on Robinhood Chain — set at launch
const ORACLE_ADDR = process.env.MARK_ORACLE || '';              // deployed MarkOracle.sol — set after deploy
const LIVE = !!MARK_MINT;
const CLIENT = path.join(__dirname, '..', 'client');
const CHAIN = { id: 4663, hex: '0x1237', name: 'Robinhood Chain', rpc: 'https://rpc.mainnet.chain.robinhood.com' };

// ── persistence ───────────────────────────────────────────────────────────────
let DB = { signer: null, hist: null, desk: {}, startedAt: Date.now() };
try { if (fs.existsSync(DATA_PATH)) DB = Object.assign(DB, JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'))); } catch (e) { console.error('data load failed', e.message); }
DB.signer = E.initSigner(DB.signer);
DB.evm = EVM.init(DB.evm);
E.importHist(DB.hist);
let dirty = false;
function save() { try { DB.hist = E.exportHist(); fs.writeFileSync(DATA_PATH, JSON.stringify(DB)); dirty = false; } catch (e) { console.error('save failed', e.message); } }
setInterval(() => { if (dirty) save(); }, 15e3);
setInterval(save, 120e3);

// ── the desk: paper leverage on the MARK (no custody, no funding — a showcase for the feed) ──
const DESK_START = 10000, DESK_MAX_LEV = 10, DESK_MAINT = 0.05, DESK_FEE_BPS = 5;
function acct(w) {
  w = String(w || '').toLowerCase();
  if (!/^0x[a-f0-9]{40}$|^desk_[a-f0-9]{16}$/.test(w)) return null;
  if (!DB.desk[w]) { DB.desk[w] = { cash: DESK_START, positions: [], closed: [], openedAt: Date.now() }; dirty = true; }
  return DB.desk[w];
}
function pnlOf(p, m) { return (m.mark - p.entry) * p.qty * (p.side === 'long' ? 1 : -1); }
function markDesk() {
  const t = Date.now();
  for (const w of Object.keys(DB.desk)) {
    const a = DB.desk[w];
    for (const p of a.positions.slice()) {
      const m = E.feed(p.sym); if (!m) continue;
      const eq = p.margin + pnlOf(p, m);
      if (eq <= p.notional * DESK_MAINT) {
        a.positions.splice(a.positions.indexOf(p), 1);
        a.closed.unshift(Object.assign({}, p, { exit: m.mark, pnl: -p.margin, closedAt: t, reason: 'liquidated' }));
        a.closed = a.closed.slice(0, 50); dirty = true;
      }
    }
  }
}
function deskView(w) {
  const a = acct(w); if (!a) return null;
  const positions = a.positions.map((p) => { const m = E.feed(p.sym); const pnl = m ? pnlOf(p, m) : 0; return Object.assign({}, p, { mark: m ? m.mark : null, pnl, equity: p.margin + pnl, liqPx: p.side === 'long' ? p.entry * (1 - (1 / p.lev) + DESK_MAINT) : p.entry * (1 + (1 / p.lev) - DESK_MAINT) }); });
  const equity = a.cash + positions.reduce((s, p) => s + p.equity, 0);
  return { cash: a.cash, equity, positions, closed: a.closed.slice(0, 20), start: DESK_START, maxLev: DESK_MAX_LEV, maint: DESK_MAINT, feeBps: DESK_FEE_BPS };
}
function deskOpen(w, sym, side, lev, margin) {
  const a = acct(w); if (!a) return { error: 'connect a wallet first' };
  const m = E.feed(sym); if (!m) return { error: 'no mark for ' + sym };
  lev = Math.max(1, Math.min(DESK_MAX_LEV, Math.floor(+lev || 1))); margin = +margin;
  if (!(margin >= 10)) return { error: 'minimum margin is 10 USDG' };
  if (margin > a.cash) return { error: 'insufficient paper cash' };
  if (side !== 'long' && side !== 'short') return { error: 'side must be long or short' };
  const notional = margin * lev, fee = notional * DESK_FEE_BPS / 1e4;
  // fills at MARK ± half the confidence band: you pay the band when the tape is closed. That is the point.
  const entry = m.mark * (1 + (side === 'long' ? 1 : -1) * (m.confBps / 2) / 1e4);
  const p = { id: crypto.randomBytes(6).toString('hex'), sym, side, lev, margin: margin - fee, notional, entry, qty: notional / entry, fee, openedAt: Date.now(), session: m.session, confBps: m.confBps };
  a.cash -= margin; a.positions.push(p); dirty = true;
  return { ok: true, position: p };
}
function deskClose(w, id) {
  const a = acct(w); if (!a) return { error: 'no account' };
  const i = a.positions.findIndex((p) => p.id === id); if (i < 0) return { error: 'no such position' };
  const p = a.positions[i], m = E.feed(p.sym); if (!m) return { error: 'no mark' };
  const exit = m.mark * (1 - (p.side === 'long' ? 1 : -1) * (m.confBps / 2) / 1e4);
  const pnl = (exit - p.entry) * p.qty * (p.side === 'long' ? 1 : -1);
  a.positions.splice(i, 1);
  a.cash += Math.max(0, p.margin + pnl);
  a.closed.unshift(Object.assign({}, p, { exit, pnl, closedAt: Date.now(), reason: 'closed' })); a.closed = a.closed.slice(0, 50); dirty = true;
  return { ok: true, pnl, exit };
}
function deskReset(w) { const a = acct(w); if (!a) return { error: 'no account' }; DB.desk[w] = { cash: DESK_START, positions: [], closed: [], openedAt: Date.now() }; dirty = true; return { ok: true }; }
function leaderboard() {
  return Object.entries(DB.desk).map(([w, a]) => { const v = deskView(w); return { w, equity: v.equity, trades: a.closed.length + a.positions.length }; }).filter((x) => x.trades > 0).sort((a, b) => b.equity - a.equity).slice(0, 12);
}

// ── SSE ───────────────────────────────────────────────────────────────────────
const clients = new Set();
function broadcast(obj) {
  const s = 'data: ' + JSON.stringify(obj) + '\n\n';
  for (const c of clients) { try { c.write(s); } catch (e) { clients.delete(c); } }
}
function boardView() {
  const t = Date.now();
  const sess = E.session(t);
  return {
    t, session: sess, nextOpen: E.nextOpen(t),
    feeds: E.snapshot().map((m) => ({ sym: m.sym, name: m.name, mark: m.mark, conf: m.conf, confBps: m.confBps, session: m.session, official: m.official, prevClose: m.prevClose, basis: m.basis, poolLiq: m.poolLiq, poolCount: m.poolCount, seq: m.seq, ts: m.ts, dir: m.dir, nSrc: m.sources.length, nRej: m.rejected.length })),
    status: E.STATUS, signer: E.pubkeyHex(), live: LIVE, mint: MARK_MINT || null, perps: EVM.PERPS || null,
  };
}
// liquidation scanner: lists on-chain positions that are under maintenance at the current mark, so anyone can call liquidate()
let LIQ = [];
async function scanLiq() {
  if (!EVM.PERPS) return;
  try {
    const ps = await EVM.openPositions();
    const st = await EVM.state('');
    LIQ = ps.filter((p) => { const m = E.feed(p.sym); if (!m) return false; const d = (m.mark - p.entry) / p.entry * (p.isLong ? 1 : -1); return p.margin + p.size * d <= p.size * (st.maintBps || 500) / 1e4; }).map((p) => p.id);
  } catch (e) { /* rpc hiccup */ }
}
setInterval(scanLiq, 30e3);

let lastBoard = null;
function loop() {
  const t = Date.now();
  E.tick(t);
  markDesk();
  lastBoard = boardView();
  broadcast(lastBoard);
  dirty = true;
}

// ── http ──────────────────────────────────────────────────────────────────────
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.sol': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.json': 'application/json' };
function json(res, code, obj) { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); }
function file(res, p) {
  fs.readFile(p, (err, buf) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-cache' }); res.end(buf);
  });
}
function body(req) { return new Promise((r) => { let s = ''; req.on('data', (d) => { s += d; if (s.length > 1e5) req.destroy(); }); req.on('end', () => { try { r(JSON.parse(s || '{}')); } catch (e) { r({}); } }); }); }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const u = url.pathname;
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST' }); return res.end(); }

  if (u === '/api/board') return json(res, 200, lastBoard || boardView());
  if (u === '/api/stream') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'access-control-allow-origin': '*' });
    res.write('data: ' + JSON.stringify(lastBoard || boardView()) + '\n\n');
    clients.add(res); req.on('close', () => clients.delete(res)); return;
  }
  let m;
  if ((m = u.match(/^\/api\/feed\/([A-Za-z]+)$/))) {
    const f = E.feed(m[1].toUpperCase()); if (!f) return json(res, 404, { error: 'unknown feed' });
    return json(res, 200, Object.assign({}, f, { xstock: E.xsOf(f.sym), rh: E.BOARD.find((b) => b.sym === f.sym).rh, history: E.history(f.sym), daily: E.daily(f.sym), futures: E.FUT[E.BOARD.find((b) => b.sym === f.sym).fut] ? { sym: E.BOARD.find((b) => b.sym === f.sym).fut, price: E.FUT[E.BOARD.find((b) => b.sym === f.sym).fut].price, ts: E.FUT[E.BOARD.find((b) => b.sym === f.sym).fut].ts } : null }));
  }
  if ((m = u.match(/^\/api\/feed\/([A-Za-z]+)\/signed$/))) {
    const f = E.feed(m[1].toUpperCase()); if (!f) return json(res, 404, { error: 'unknown feed' });
    return json(res, 200, Object.assign({ sym: f.sym, mark: f.mark, conf: f.conf, ts: f.ts, session: f.session, seq: f.seq }, f.signed));
  }
  if ((m = u.match(/^\/api\/feed\/([A-Za-z]+)\/evm$/))) {
    const f = E.feed(m[1].toUpperCase()); if (!f) return json(res, 404, { error: 'unknown feed' });
    return json(res, 200, Object.assign({ mark: f.mark, confUsd: f.conf, confBps: f.confBps }, EVM.signPrice(f)));
  }
  if (u === '/api/perps/state') {
    try { return json(res, 200, Object.assign(await EVM.state(url.searchParams.get('w') || ''), { chain: CHAIN, liquidatable: LIQ })); }
    catch (e) { return json(res, 502, { error: 'rpc: ' + e.message }); }
  }
  if ((m = u.match(/^\/api\/history\/([A-Za-z]+)$/))) return json(res, 200, { sym: m[1].toUpperCase(), history: E.history(m[1].toUpperCase()) });
  if (u === '/api/verify') {
    const payload = url.searchParams.get('payload') || '', sig = url.searchParams.get('sig') || '', pub = url.searchParams.get('pub') || '';
    return json(res, 200, { valid: E.verify(payload, sig, pub || null), payload, signer: pub || E.pubkeyHex() });
  }
  if (u === '/api/signer') return json(res, 200, { alg: 'ed25519', pub: E.pubkeyHex(), payload: 'MARK|<SYM>|<mark·1e8>|<conf·1e8>|<unix s>|<SESSION>|<seq>', example: (E.snapshot()[0] || {}).signed || null });
  if (u === '/api/config') return json(res, 200, { token: '$MARK', mint: MARK_MINT || null, live: LIVE, oracle: ORACLE_ADDR || null, perps: EVM.PERPS || null, usdg: EVM.USDG, evmSigner: EVM.address(), chain: CHAIN, signer: E.pubkeyHex(), board: E.BOARD.map((b) => ({ sym: b.sym, name: b.name, rh: b.rh })), params: { weights: E.W, floorBps: E.FLOOR_BPS, outlierBps: E.OUTLIER_BPS }, pyth: E.STATUS.pyth >= 0 ? 'configured' : 'not configured (public Hermes is key-gated)', startedAt: DB.startedAt });
  if (u === '/api/leaderboard') return json(res, 200, { rows: leaderboard() });

  if (u === '/api/desk' && req.method === 'GET') { const v = deskView(url.searchParams.get('w')); return v ? json(res, 200, v) : json(res, 400, { error: 'bad wallet' }); }
  if (u === '/api/desk/open' && req.method === 'POST') { const b = await body(req); const r = deskOpen(b.w, String(b.sym || '').toUpperCase(), b.side, b.lev, b.margin); return json(res, r.error ? 400 : 200, r.error ? r : Object.assign(r, { account: deskView(b.w) })); }
  if (u === '/api/desk/close' && req.method === 'POST') { const b = await body(req); const r = deskClose(b.w, b.id); return json(res, r.error ? 400 : 200, r.error ? r : Object.assign(r, { account: deskView(b.w) })); }
  if (u === '/api/desk/reset' && req.method === 'POST') { const b = await body(req); const r = deskReset(b.w); return json(res, r.error ? 400 : 200, r.error ? r : Object.assign(r, { account: deskView(b.w) })); }

  if (u === '/' || u === '/index.html') return file(res, path.join(CLIENT, 'index.html'));
  if (u === '/desk') return file(res, path.join(CLIENT, 'desk.html'));
  if (u === '/trade') return file(res, path.join(CLIENT, 'trade.html'));
  if (u === '/keccak.js') return file(res, path.join(__dirname, '..', 'shared', 'keccak.js'));
  if (u === '/contracts/MarkPerps.sol') return file(res, path.join(__dirname, '..', 'contracts', 'MarkPerps.sol'));
  if (u === '/docs') return file(res, path.join(CLIENT, 'docs.html'));
  if ((m = u.match(/^\/feed\/([A-Za-z]+)$/))) return file(res, path.join(CLIENT, 'feed.html'));
  if (u === '/contracts/MarkOracle.sol') return file(res, path.join(__dirname, '..', 'contracts', 'MarkOracle.sol'));
  const safe = path.normalize(u).replace(/^(\.\.[\/\\])+/, '');
  const p = path.join(CLIENT, safe);
  if (p.startsWith(CLIENT) && fs.existsSync(p) && fs.statSync(p).isFile()) return file(res, p);
  res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found');
});

E.start().then(() => {
  loop();
  setInterval(loop, 4000);
  server.listen(PORT, () => console.log('MARK on :' + PORT + ' — ' + E.BOARD.length + ' feeds · session ' + E.session(Date.now()) + ' · signer ' + E.pubkeyHex().slice(0, 12) + '… · live=' + LIVE));
});

// MARK — the fair-value engine. Marks every tokenized stock to market, 24/7.
//
// Regimes (NYSE calendar, America/New_York):
//   OPEN   09:30–16:00 weekdays      → mark = official tape (pools/xStocks only tighten confidence)
//   PRE    04:00–09:30 / POST 16:00–20:00 → extended print + pools + xStocks + futures proxy
//   CLOSED overnight, weekends, holidays → pools + xStocks + futures proxy, official close decays
//
// Blend = weighted MEDIAN of the surviving sources (outliers > OUTLIER_BPS from the
// pre-median are rejected and reported). Confidence = max(floor, k·dispersion) + staleness.
// Every published mark is signed (ed25519) with a persistent signer key.
'use strict';
const crypto = require('crypto');
const S = require('./sources');

// ── the board ─────────────────────────────────────────────────────────────────
// rh = the tokenized-stock contract on Robinhood Chain (base token of the pools)
// pyth = { eq: Equity.US feed, x: Crypto.<SYM>X/USD xStock feed } — used only if PYTH_HERMES_URL is set
const BOARD = [
  { sym: 'SPY',   name: 'S&P 500 ETF',   rh: '0x117cc2133c37B721F49dE2A7a74833232B3B4C0C', fut: 'ES=F', pyth: { eq: '19e09bb805456ada3979a7d1cbb4b6d63babc3a0f8e8a9509f68afa5c4c11cd5', x: '2817b78438c769357182c04346fddaad1178c82f4048828fe0997c3c64624e14' } },
  { sym: 'QQQ',   name: 'Nasdaq-100 ETF', rh: '0xD5f3879160bc7c32ebb4dC785F8a4F505888de68', fut: 'NQ=F', pyth: { eq: '9695e2b96ea7b3859da9ed25b7a46a920a776e2fdae19a7bcfdf2b219230452d', x: '178a6f73a5aede9d0d682e86b0047c9f333ed0efe5c6537ca937565219c4054d' } },
  { sym: 'NVDA',  name: 'NVIDIA',         rh: '0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC', fut: 'NQ=F', pyth: { eq: 'b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593', x: '4244d07890e4610f46bbde67de8f43a4bf8b569eebe904f136b469f148503b7f' } },
  { sym: 'AAPL',  name: 'Apple',          rh: '0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9', fut: 'NQ=F', pyth: { eq: '49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688', x: '978e6cc68a119ce066aa830017318563a9ed04ec3a0a6439010fc11296a58675' } },
  { sym: 'TSLA',  name: 'Tesla',          rh: '0x322F0929c4625eD5bAd873c95208D54E1c003b2d', fut: 'NQ=F', pyth: { eq: '16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1', x: '47a156470288850a440df3a6ce85a55917b813a19bb5b31128a33a986566a362' } },
  { sym: 'MSFT',  name: 'Microsoft',      rh: '0xe93237C50D904957Cf27E7B1133b510C669c2e74', fut: 'NQ=F', pyth: { eq: 'd0ca23c1cc005e004ccf1db5bf76aeb6a49218f43dac3d4b275e92de12ded4d1', x: 'bb723a70af731ab56b9a650eb7e8ac22b7bc07ea77f8670bd1fa9a37bf6df3f5' } },
  { sym: 'AMZN',  name: 'Amazon',         rh: '0x12f190a9F9d7D37a250758b26824B97CE941bF54', fut: 'NQ=F', pyth: { eq: 'b5d0e0fa58a1f8b81498ae670ce93c872d14434b72c364885d4fa1b257cbb07a', x: '7148fbe6e493ff2580305c92a8d7f8628c9943b11b9b253aebc24863fec290e8' } },
  { sym: 'META',  name: 'Meta',           rh: '0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35', fut: 'NQ=F', pyth: { eq: '78a3e3b8e676a8f73c439f5d749737034b139bbbe899ba5775216fba596607fe', x: 'bf3e5871be3f80ab7a4d1f1fd039145179fb58569e159aee1ccd472868ea5900' } },
  { sym: 'GOOGL', name: 'Alphabet',       rh: '0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3', fut: 'NQ=F', pyth: { eq: '5a48c03e9b9cb337801073ed9d166817473697efff0d138874e0f6a33d6d5aa6', x: 'b911b0329028cd0283e4259c33809d62942bd2716a58084e5f31d64c00b5424e' } },
  { sym: 'HOOD',  name: 'Robinhood',      rh: '0x32aC8C1D7672667D5EbdEa22935F7B06fC8D496f', fut: 'ES=F', pyth: { eq: '306736a4035846ba15a3496eed57225b64cc19230a50d14f3ed20fd7219b7849', x: 'dd49a9ac6df5cbfa9d8fc6371f7ae927a74d5c6763c1c01b4220d70314c647f9' } },
  { sym: 'COIN',  name: 'Coinbase',       rh: '0x6330D8C3178a418788dF01a47479c0ce7CCF450b', fut: 'ES=F', pyth: { eq: 'fee33f2a978bf32dd6b662b65ba8083c6773b494f8401194ec1870c640860245', x: '641435d5dffb5311140b480517c79986d8488d5cf08a11eec53b83ad02cab33f' } },
  { sym: 'MSTR',  name: 'Strategy',       rh: '0xec262a75e413fAfD0dF80480274532C79D42da09', fut: 'ES=F', pyth: { eq: 'e1e80251e5f5184f2195008382538e847fafc36f751896889dd3d1b1f6111f09', x: '53f95ba4e23ed15ea56083e2ee9a5eec48055d6f59033d4bb95f1ca2a2349c28' } },
  { sym: 'PLTR',  name: 'Palantir',       rh: '0x894E1EC2D74FFE5AEF8Dc8A9e84686acCB964F2A', fut: 'NQ=F', pyth: { eq: '11a70634863ddffb71f2b11f2cff29f73f3db8f6d0b78c49f2b5f4ad36e885f0' } },
  { sym: 'GME',   name: 'GameStop',       rh: '0x1b0E319c6A659F002271B69dB8A7df2F911c153E', fut: 'ES=F', pyth: { eq: '6f9cd89ef1b7fd39f667101a91ad578b6c6ace4579d5f7f285a4b06aa4504be6' } },
  { sym: 'AMD',   name: 'AMD',            rh: '0x86923f96303D656E4aa86D9d42D1e57ad2023fdC', fut: 'NQ=F', pyth: { eq: '3622e381dbca2efd1859253763b1adc63f7f9abb8e76da1aa8e638a57ccde93e' } },
  { sym: 'CRCL',  name: 'Circle',         rh: '0xdF0992E440dD0be65BD8439b609d6D4366bf1CB5', fut: 'ES=F', pyth: { eq: '92b8527aabe59ea2b12230f7b532769b133ffb118dfbd48ff676f14b273f1365', x: 'c13184461c0c80d98ffcd89be627c2220b94a96c7c67f0c4b16bc12fd3b17758' } },
];

// ── NYSE calendar ─────────────────────────────────────────────────────────────
// full closures + early (13:00) closes, MMDD, from the exchange calendar (matches Pyth's equity schedule)
const HOLIDAYS = new Set(['0101', '0119', '0216', '0403', '0525', '0619', '0703', '0907', '1126', '1225']);
const HALF_DAYS = new Set(['1127', '1224']);
const NY = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
function nyParts(t) {
  const o = {};
  for (const p of NY.formatToParts(new Date(t))) o[p.type] = p.value;
  return { wd: o.weekday, mmdd: o.month + o.day, ymd: o.year + '-' + o.month + '-' + o.day, mins: (+o.hour % 24) * 60 + +o.minute };
}
// session for an instant: 'open' | 'pre' | 'post' | 'closed'
function session(t) {
  const p = nyParts(t);
  if (p.wd === 'Sat' || p.wd === 'Sun' || HOLIDAYS.has(p.mmdd)) return 'closed';
  const close = HALF_DAYS.has(p.mmdd) ? 13 * 60 : 16 * 60;
  if (p.mins >= 9 * 60 + 30 && p.mins < close) return 'open';
  if (p.mins >= 4 * 60 && p.mins < 9 * 60 + 30) return 'pre';
  if (p.mins >= close && p.mins < 20 * 60) return 'post';
  return 'closed';
}
// next NYSE open (ms) — for the "Wall Street reopens in" line
function nextOpen(t) {
  let d = new Date(t);
  for (let i = 0; i < 14; i++) {
    const p = nyParts(d.getTime());
    const tradable = !(p.wd === 'Sat' || p.wd === 'Sun' || HOLIDAYS.has(p.mmdd));
    if (tradable && p.mins < 9 * 60 + 30) return d.getTime() + (9 * 60 + 30 - p.mins) * 60000 - (d.getTime() % 60000);
    d = new Date(d.getTime() + (24 * 60 - p.mins) * 60000 - (d.getTime() % 60000) + 1000);
  }
  return null;
}

// ── parameters ────────────────────────────────────────────────────────────────
const OUTLIER_BPS = 800;            // a source more than 8% from the pre-median is rejected
const FLOOR_BPS = { open: 5, pre: 15, post: 15, closed: 25 };
const K_DISP = 1.5;                 // confidence multiplier on source dispersion
const STALE_BPS_PER_H = 3, STALE_CAP = 150;
const W = {                         // base weights by regime
  open:   { tape: 1.00, ext: 0,    pools: 0.15, xstock: 0.10, proxy: 0 },
  pre:    { tape: 0.20, ext: 0.45, pools: 0.30, xstock: 0.20, proxy: 0.10 },
  post:   { tape: 0.20, ext: 0.45, pools: 0.30, xstock: 0.20, proxy: 0.10 },
  closed: { tape: 0.15, ext: 0.10, pools: 0.35, xstock: 0.30, proxy: 0.20 },
};

// ── state ─────────────────────────────────────────────────────────────────────
const F = {};                       // sym → feed state
for (const b of BOARD) F[b.sym] = { cfg: b, tape: null, pools: [], xs: null, xsPx: null, pyth: null, beta: 1, mark: null, seq: 0, hist: [], daily: [] };
const FUT = { 'ES=F': null, 'NQ=F': null };
const STATUS = { tape: 0, pools: 0, xstock: 0, futures: 0, pyth: S.PYTH_URL ? 0 : -1, errors: {} };
let signer = null;                  // { priv, pub } PEM
let seqGlobal = 0;

function weightedMedian(items) {   // items: [{price, w}]
  const a = items.filter((i) => i.w > 0 && i.price > 0).sort((x, y) => x.price - y.price);
  const tot = a.reduce((s, i) => s + i.w, 0);
  if (!tot) return null;
  let c = 0;
  for (const i of a) { c += i.w; if (c >= tot / 2) return i.price; }
  return a[a.length - 1].price;
}
const bps = (a, b) => (a / b - 1) * 1e4;

// build the source list for one symbol, then blend
function compute(sym, t) {
  const f = F[sym];
  const sess = session(t);
  const w = W[sess];
  const src = [];
  const tp = f.tape;
  if (tp && tp.official && tp.official.price > 0) {
    const ageH = (t - tp.official.ts) / 3.6e6;
    const decay = sess === 'open' ? 1 : Math.max(0.25, 1 - ageH / 72);            // an official print fades over 3 days
    src.push({ src: 'tape', label: 'Official tape', venue: 'NYSE / Nasdaq', price: tp.official.price, ts: tp.official.ts, w: w.tape * decay });
    if (tp.ext && w.ext > 0) src.push({ src: 'ext', label: 'Extended-hours print', venue: 'US extended session', price: tp.ext.price, ts: tp.ext.ts, w: w.ext * Math.max(0.3, 1 - (t - tp.ext.ts) / 3.6e6 / 12) });
  }
  // Robinhood Chain pools — each deep pool is its own vote; weight ∝ liquidity, halved if no trades in the last hour
  const liqTot = f.pools.reduce((s, p) => s + p.liq, 0);
  if (liqTot > 0 && w.pools > 0) {
    for (const p of f.pools.slice(0, 6)) {
      const share = p.liq / liqTot, act = p.txns1h > 0 ? 1 : 0.5;
      src.push({ src: 'pool', label: 'RH pool ' + p.quote, venue: p.dex, pair: p.pair, price: p.price, ts: t, liq: p.liq, txns1h: p.txns1h, w: w.pools * Math.min(1, liqTot / 1.5e6) * share * act });
    }
  }
  if (f.xsPx && w.xstock > 0) src.push({ src: 'xstock', label: sym + 'x (xStocks)', venue: 'Solana · Jupiter', mint: f.xs.mint, price: f.xsPx.price, ts: f.xsPx.ts, liq: f.xsPx.liq, w: w.xstock * Math.min(1, f.xsPx.liq / 8e5) });
  // futures proxy: official close × (1 + β · futures move since that close)
  const fut = FUT[f.cfg.fut];
  if (tp && fut && w.proxy > 0) {
    const b0 = S.barAt(fut, tp.official.ts);
    if (b0 && fut.price > 0 && b0[1] > 0 && t - fut.ts < 3 * 3.6e6) {
      const move = fut.price / b0[1] - 1;
      const px = tp.official.price * (1 + f.beta * move);
      src.push({ src: 'proxy', label: f.cfg.fut.replace('=F', '') + ' futures × β ' + f.beta.toFixed(2), venue: 'CME (via cash close)', price: px, ts: fut.ts, move, beta: f.beta, w: w.proxy });
    }
  }
  if (f.pyth) {
    if (f.pyth.eq && t - f.pyth.eq.ts < 60e3) src.push({ src: 'pyth', label: 'Pyth equity', venue: 'Pyth Hermes', price: f.pyth.eq.price, ts: f.pyth.eq.ts, w: sess === 'open' ? 0.6 : 0.1 });
    if (f.pyth.x) src.push({ src: 'pyth', label: 'Pyth xStock', venue: 'Pyth Hermes', price: f.pyth.x.price, ts: f.pyth.x.ts, w: 0.2 });
  }
  if (!src.length) return null;
  // outlier rejection against the preliminary median
  const pre = weightedMedian(src);
  const rejected = [];
  const kept = src.filter((s) => { const ok = Math.abs(bps(s.price, pre)) <= OUTLIER_BPS; if (!ok) rejected.push(Object.assign({}, s, { devBps: bps(s.price, pre) })); return ok; });
  const mark = weightedMedian(kept);
  if (!mark) return null;
  const tot = kept.reduce((s, i) => s + i.w, 0);
  const disp = kept.reduce((s, i) => s + i.w * Math.abs(bps(i.price, mark)), 0) / tot;   // weighted mean abs dev, bps
  let confBps = Math.max(FLOOR_BPS[sess], K_DISP * disp);
  let staleH = 0;
  if (sess !== 'open' && tp) { staleH = (t - tp.official.ts) / 3.6e6; confBps += Math.min(STALE_CAP, STALE_BPS_PER_H * staleH); }
  const poolPx = weightedMedian(kept.filter((s) => s.src === 'pool').map((s) => ({ price: s.price, w: s.liq || 1 })));
  const xsPx = f.xsPx ? f.xsPx.price : null;
  const official = tp ? tp.official : null;
  return {
    sym, name: f.cfg.name, mark, conf: mark * confBps / 1e4, confBps, session: sess, ts: t,
    official: official ? { price: official.price, ts: official.ts, ageH: (t - official.ts) / 3.6e6 } : null,
    ext: tp && tp.ext ? tp.ext : null,
    prevClose: tp ? tp.prevClose : null,
    basis: {
      vsOfficial: official ? bps(mark, official.price) : null,       // where MARK sits vs the last official print
      pool: poolPx ? bps(poolPx, mark) : null,                        // RH pools rich(+)/cheap(−) vs MARK
      xstock: xsPx ? bps(xsPx, mark) : null,
    },
    poolLiq: liqTot, poolCount: f.pools.length,
    sources: kept.map((s) => Object.assign({}, s, { w: +(s.w / tot).toFixed(4), devBps: +bps(s.price, mark).toFixed(1) })),
    rejected,
    beta: f.beta,
  };
}

// ── signing ───────────────────────────────────────────────────────────────────
function initSigner(saved) {
  if (process.env.MARK_SIGNER_PRIV) {
    const priv = crypto.createPrivateKey({ key: Buffer.from(process.env.MARK_SIGNER_PRIV, 'base64'), format: 'der', type: 'pkcs8' });
    signer = { priv, pub: crypto.createPublicKey(priv) };
  } else if (saved && saved.priv) {
    const priv = crypto.createPrivateKey({ key: Buffer.from(saved.priv, 'base64'), format: 'der', type: 'pkcs8' });
    signer = { priv, pub: crypto.createPublicKey(priv) };
  } else {
    const kp = crypto.generateKeyPairSync('ed25519');
    signer = { priv: kp.privateKey, pub: kp.publicKey };
  }
  return { priv: signer.priv.export({ format: 'der', type: 'pkcs8' }).toString('base64') };
}
function pubkeyHex() { return signer.pub.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex'); }
// canonical payload: fixed-point 1e8 integers so any consumer (Solidity, Rust, JS) rebuilds the exact bytes
function payloadOf(m) {
  return ['MARK', m.sym, Math.round(m.mark * 1e8), Math.round(m.conf * 1e8), Math.round(m.ts / 1000), m.session.toUpperCase(), m.seq].join('|');
}
function sign(m) {
  const payload = payloadOf(m);
  const sig = crypto.sign(null, Buffer.from(payload), signer.priv).toString('hex');
  return { payload, sig, pub: pubkeyHex(), alg: 'ed25519' };
}
function verify(payload, sigHex, pubHex) {
  try {
    const pub = pubHex ? crypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(pubHex, 'hex')]), format: 'der', type: 'spki' }) : signer.pub;
    return crypto.verify(null, Buffer.from(payload), pub, Buffer.from(sigHex, 'hex'));
  } catch (e) { return false; }
}

// ── pollers ───────────────────────────────────────────────────────────────────
async function pollTape() {
  for (const b of BOARD) {
    try { const t = await S.tape(b.sym); if (t) { F[b.sym].tape = t; STATUS.tape = Date.now(); } }
    catch (e) { STATUS.errors.tape = e.message; }
    await new Promise((r) => setTimeout(r, 250));
  }
}
async function pollFutures() {
  for (const k of Object.keys(FUT)) {
    try { const f = await S.futures(k); if (f) { FUT[k] = f; STATUS.futures = Date.now(); } } catch (e) { STATUS.errors.futures = e.message; }
  }
}
async function pollPools() {
  for (const b of BOARD) {
    try { F[b.sym].pools = await S.pools(b.rh); STATUS.pools = Date.now(); } catch (e) { STATUS.errors.pools = e.message; }
    await new Promise((r) => setTimeout(r, 120));
  }
}
async function resolveXStocks() {
  for (const b of BOARD) {
    if (F[b.sym].xs) continue;
    try { F[b.sym].xs = await S.resolveXStock(b.sym); } catch (e) { STATUS.errors.xstock = e.message; }
    await new Promise((r) => setTimeout(r, 150));
  }
}
async function pollXStocks() {
  const mints = BOARD.filter((b) => F[b.sym].xs).map((b) => F[b.sym].xs.mint);
  try {
    const px = await S.xstockPrices(mints);
    for (const b of BOARD) if (F[b.sym].xs && px[F[b.sym].xs.mint]) F[b.sym].xsPx = px[F[b.sym].xs.mint];
    STATUS.xstock = Date.now();
  } catch (e) { STATUS.errors.xstock = e.message; }
}
async function pollPyth() {
  if (!S.PYTH_URL) return;
  const ids = [];
  for (const b of BOARD) { if (b.pyth.eq) ids.push(b.pyth.eq); if (b.pyth.x) ids.push(b.pyth.x); }
  try {
    const px = await S.pyth(ids);
    if (!px) return;
    for (const b of BOARD) F[b.sym].pyth = { eq: b.pyth.eq ? px[b.pyth.eq] : null, x: b.pyth.x ? px[b.pyth.x] : null };
    STATUS.pyth = Date.now();
  } catch (e) { STATUS.errors.pyth = e.message; }
}
// β to the index that proxies the name (ES for SPY-beta names, NQ for tech) from 3 months of daily returns
async function computeBetas() {
  const idx = {};
  try { idx['ES=F'] = await S.dailyCloses('SPY'); idx['NQ=F'] = await S.dailyCloses('QQQ'); } catch (e) { STATUS.errors.beta = e.message; return; }
  const rets = (c) => { const r = []; for (let i = 1; i < c.close.length; i++) if (c.close[i] && c.close[i - 1]) r.push([c.ts[i], c.close[i] / c.close[i - 1] - 1]); return r; };
  for (const b of BOARD) {
    try {
      const d = await S.dailyCloses(b.sym);
      if (!d || !idx[b.fut]) continue;
      F[b.sym].daily = d.close.map((c, i) => [d.ts[i] * 1000, c]).filter((x) => x[1]);
      const rs = rets(d), ri = new Map(rets(idx[b.fut]).map((x) => [Math.floor(x[0] / 86400), x[1]]));
      let sxy = 0, sxx = 0, n = 0, mx = 0, my = 0;
      const pairs = rs.map((x) => [ri.get(Math.floor(x[0] / 86400)), x[1]]).filter((p) => p[0] != null);
      for (const p of pairs) { mx += p[0]; my += p[1]; n++; }
      if (n < 20) continue;
      mx /= n; my /= n;
      for (const p of pairs) { sxy += (p[0] - mx) * (p[1] - my); sxx += (p[0] - mx) * (p[0] - mx); }
      const beta = sxx > 0 ? sxy / sxx : 1;
      F[b.sym].beta = Math.max(0.2, Math.min(3.5, beta));
    } catch (e) { STATUS.errors.beta = e.message; }
    await new Promise((r) => setTimeout(r, 200));
  }
}

// ── publish tick ──────────────────────────────────────────────────────────────
function tick(t) {
  const out = [];
  for (const b of BOARD) {
    const f = F[b.sym];
    const m = compute(b.sym, t);
    if (!m) { if (f.mark) out.push(f.mark); continue; }
    m.seq = ++seqGlobal; f.seq = m.seq;
    m.dir = f.mark ? Math.sign(m.mark - f.mark.mark) : 0;
    m.signed = sign(m);
    f.mark = m;
    // history: 20s cadence → keep 6h fine + hourly for 7d
    const last = f.hist[f.hist.length - 1];
    if (!last || t - last[0] >= 20e3) f.hist.push([t, +m.mark.toFixed(4), +m.conf.toFixed(4), m.session[0]]);
    if (f.hist.length > 1100) f.hist.splice(0, f.hist.length - 1100);
    out.push(m);
  }
  return out;
}

function snapshot() { return BOARD.map((b) => F[b.sym].mark).filter(Boolean); }
function feed(sym) { return F[sym] ? F[sym].mark : null; }
function history(sym) { return F[sym] ? F[sym].hist : []; }
function daily(sym) { return F[sym] ? F[sym].daily : []; }
function xsOf(sym) { return F[sym] ? F[sym].xs : null; }
function exportHist() { const o = {}; for (const b of BOARD) o[b.sym] = F[b.sym].hist.slice(-400); return o; }
function importHist(h) { if (!h) return; for (const b of BOARD) if (Array.isArray(h[b.sym])) F[b.sym].hist = h[b.sym]; }

async function start() {
  await Promise.all([pollTape(), pollFutures(), pollPools(), resolveXStocks().then(pollXStocks), pollPyth()]);
  computeBetas();
  setInterval(pollTape, 45e3);
  setInterval(pollFutures, 60e3);
  setInterval(pollPools, 20e3);
  setInterval(pollXStocks, 15e3);
  setInterval(pollPyth, 10e3);
  setInterval(computeBetas, 6 * 3.6e6);
  setInterval(resolveXStocks, 3.6e6);
}

module.exports = { BOARD, start, tick, snapshot, feed, history, daily, xsOf, session, nextOpen, initSigner, pubkeyHex, sign, verify, payloadOf, STATUS, FUT, exportHist, importHist, W, FLOOR_BPS, OUTLIER_BPS };

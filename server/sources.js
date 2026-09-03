// MARK — source adapters. Every adapter returns plain {price, ts, ...} objects or null.
// All of these are REAL public endpoints, no API keys:
//   tape    — Yahoo Finance chart API: official regular-session print + extended-hours prints
//   futures — Yahoo Finance: ES=F / NQ=F index futures (trade ~23h/day, 5 days/week)
//   pools   — DexScreener: every Robinhood Chain pool for the tokenized stock (USDG / WETH quotes)
//   xstock  — Jupiter: xStocks (Backed) tokenized stock on Solana, trades 24/7
//   pyth    — Pyth Hermes, OPTIONAL (public Hermes now returns 401; set PYTH_HERMES_URL with your gateway)
'use strict';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const YF = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const DS_TOKENS = 'https://api.dexscreener.com/latest/dex/tokens/';
const JUP_PRICE = 'https://lite-api.jup.ag/price/v3?ids=';
const JUP_SEARCH = 'https://lite-api.jup.ag/tokens/v2/search?query=';
const PYTH_URL = process.env.PYTH_HERMES_URL || ''; // e.g. https://hermes.pyth.network (needs a key now) or your own gateway

async function getJSON(url, headers, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms || 9000);
  try {
    const r = await fetch(url, { headers: Object.assign({ accept: 'application/json', 'user-agent': UA }, headers || {}), signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

// ── tape: official + extended-hours prints ────────────────────────────────────
// Returns { official:{price,ts}, ext:{price,ts}|null, prevClose, periods:{pre,regular,post} }
async function yahooChart(sym, range, interval, prepost) {
  return getJSON(YF + encodeURIComponent(sym) + '?range=' + (range || '1d') + '&interval=' + (interval || '1m') + (prepost ? '&includePrePost=true' : ''));
}
async function tape(sym) {
  const j = await yahooChart(sym, '1d', '1m', true);
  const r = j && j.chart && j.chart.result && j.chart.result[0];
  if (!r || !r.meta) return null;
  const m = r.meta;
  const ts = r.timestamp || [], cl = (r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close) || [];
  let ext = null;
  for (let i = cl.length - 1; i >= 0; i--) {
    if (cl[i] != null && ts[i] > m.regularMarketTime) { ext = { price: +cl[i], ts: ts[i] * 1000 }; break; }
  }
  const p = m.currentTradingPeriod || {};
  return {
    official: { price: +m.regularMarketPrice, ts: m.regularMarketTime * 1000 },
    ext,
    prevClose: +(m.previousClose || m.chartPreviousClose || 0),
    periods: { pre: p.pre ? [p.pre.start * 1000, p.pre.end * 1000] : null, regular: p.regular ? [p.regular.start * 1000, p.regular.end * 1000] : null, post: p.post ? [p.post.start * 1000, p.post.end * 1000] : null },
    name: m.longName || m.shortName || sym,
  };
}

// daily closes for beta: 3 months of adjusted closes
async function dailyCloses(sym) {
  const j = await yahooChart(sym, '3mo', '1d', false);
  const r = j && j.chart && j.chart.result && j.chart.result[0];
  if (!r) return null;
  const adj = r.indicators && r.indicators.adjclose && r.indicators.adjclose[0] && r.indicators.adjclose[0].adjclose;
  const cl = adj || (r.indicators.quote[0] && r.indicators.quote[0].close) || [];
  return { ts: r.timestamp || [], close: cl.map((x) => (x == null ? null : +x)) };
}

// ── futures: ES=F / NQ=F, with the print at a given instant (the cash close) ──
async function futures(sym) {
  const j = await yahooChart(sym, '5d', '5m', false);
  const r = j && j.chart && j.chart.result && j.chart.result[0];
  if (!r || !r.meta) return null;
  const ts = r.timestamp || [], cl = (r.indicators.quote[0] && r.indicators.quote[0].close) || [];
  const bars = [];
  for (let i = 0; i < ts.length; i++) if (cl[i] != null) bars.push([ts[i] * 1000, +cl[i]]);
  return { price: +r.meta.regularMarketPrice, ts: r.meta.regularMarketTime * 1000, bars };
}
// last futures bar at or before t (ms)
function barAt(f, t) {
  if (!f || !f.bars || !f.bars.length) return null;
  let best = null;
  for (const b of f.bars) { if (b[0] <= t) best = b; else break; }
  return best;
}

// ── pools: Robinhood Chain tokenized-stock pools (DexScreener) ────────────────
const QUOTES = new Set(['USDG', 'USDC', 'USDT', 'USDC.E', 'WETH', 'ETH']);
async function pools(addr) {
  const j = await getJSON(DS_TOKENS + addr);
  const a = addr.toLowerCase();
  const out = [];
  for (const p of (j && j.pairs) || []) {
    if (p.chainId !== 'robinhood') continue;
    if (!p.baseToken || p.baseToken.address.toLowerCase() !== a) continue; // token must be the BASE (else priceUsd is the other leg)
    const q = String(p.quoteToken && p.quoteToken.symbol || '').toUpperCase();
    if (!QUOTES.has(q)) continue;
    const liq = (p.liquidity && p.liquidity.usd) || 0, px = +p.priceUsd;
    if (!(px > 0) || liq < 25000) continue;
    const h1 = (p.txns && p.txns.h1) ? (p.txns.h1.buys || 0) + (p.txns.h1.sells || 0) : 0;
    out.push({ dex: p.dexId + (p.labels && p.labels[0] ? ' ' + p.labels[0] : ''), pair: p.pairAddress, quote: q, price: px, liq, vol24: (p.volume && p.volume.h24) || 0, txns1h: h1 });
  }
  out.sort((x, y) => y.liq - x.liq);
  return out;
}

// ── xstock: Backed xStocks on Solana via Jupiter ──────────────────────────────
async function resolveXStock(sym) {
  const a = await getJSON(JUP_SEARCH + encodeURIComponent(sym + 'x'));
  const want = (sym + 'X').toUpperCase();
  const c = (Array.isArray(a) ? a : []).filter((t) => String(t.symbol || '').toUpperCase() === want && (t.tags || []).includes('xstocks')).sort((x, y) => (y.liquidity || 0) - (x.liquidity || 0))[0];
  return c ? { mint: c.id, liq: c.liquidity || 0 } : null;
}
async function xstockPrices(mints) {
  if (!mints.length) return {};
  const j = await getJSON(JUP_PRICE + mints.join(','));
  const out = {};
  for (const m of mints) {
    const v = j && j[m];
    if (v && +v.usdPrice > 0) out[m] = { price: +v.usdPrice, liq: +v.liquidity || 0, ref: v.stockData && +v.stockData.price || null, ts: Date.now() };
  }
  return out;
}

// ── pyth (optional) ───────────────────────────────────────────────────────────
async function pyth(ids) {
  if (!PYTH_URL || !ids.length) return null;
  const q = ids.map((i) => 'ids[]=' + i).join('&') + '&parsed=true&ignore_invalid_price_ids=true';
  const j = await getJSON(PYTH_URL.replace(/\/$/, '') + '/v2/updates/price/latest?' + q);
  const out = {};
  for (const p of (j && j.parsed) || []) {
    const e = p.price.expo;
    out[p.id] = { price: +p.price.price * Math.pow(10, e), conf: +p.price.conf * Math.pow(10, e), ts: p.price.publish_time * 1000 };
  }
  return out;
}

module.exports = { tape, dailyCloses, futures, barAt, pools, resolveXStock, xstockPrices, pyth, PYTH_URL };

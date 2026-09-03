// MARK brand kit: self-contained HTML per asset → headless Chrome (ABSOLUTE file:// URL) → PNG in brand/.
'use strict';
const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');
const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = path.join(__dirname, '..', 'brand'); const TMP = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(TMP, { recursive: true });
const FONTS = `<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">`;
const BASE = `*{margin:0;padding:0;box-sizing:border-box}body{font-family:'IBM Plex Sans',sans-serif;color:#17150f;background:#ebe4d6;overflow:hidden}
.cond{font-family:'Barlow Condensed',Impact,sans-serif}.wall{background:#ebe4d6;background-image:radial-gradient(ellipse at 50% -10%,rgba(255,255,255,.55),transparent 60%)}
.ink{background:#17150f;color:#f3ecd9}.am{color:#f0a51f}
.fl{display:inline-flex;gap:3px}.fc{position:relative;width:.62em;height:1.06em;line-height:1.06em;text-align:center;font-family:'Barlow Condensed',Impact,sans-serif;font-weight:600;background:#2a2a31;color:#f3ecd9;border-radius:3px;overflow:hidden}
.fc::before{content:"";position:absolute;left:0;right:0;top:50%;height:1.5px;background:rgba(0,0,0,.7);z-index:2}.fc.am{color:#f0a51f}.fc.gr{color:#5ec87a}.fc.dim{color:#a39d8c}
.board{background:#141418;border:8px solid #0d0d10;border-radius:8px;box-shadow:0 30px 60px -20px rgba(0,0,0,.6)}
.plaque{background:#f3ecd9;border:1px solid #d5cbb6;padding:20px 24px;border-radius:2px;box-shadow:0 10px 30px -18px rgba(0,0,0,.35)}
.lab{font-family:'Barlow Condensed',Impact,sans-serif;font-size:13px;letter-spacing:.26em;text-transform:uppercase;color:#8a8476}`;
const flaps = (s, cls) => `<span class="fl">${[...s].map((c) => `<span class="fc ${cls || ''}">${c === ' ' ? '' : c}</span>`).join('')}</span>`;
const wordmark = (size) => `<span class="cond" style="font-weight:700;font-size:${size}px;letter-spacing:.06em;line-height:1">MAR<span class="am">K</span></span>`;
const K = (t) => `<span class="cond" style="font-weight:700;font-size:1em;letter-spacing:.04em;line-height:1">${t}</span>`;

const assets = {
  'mark-pfp': [400, 400, `<div class="ink" style="width:400px;height:400px;display:flex;align-items:center;justify-content:center;border-bottom:14px solid #f0a51f"><div class="cond" style="font-weight:700;font-size:210px;letter-spacing:.02em;line-height:1"><span style="color:#f3ecd9">M</span><span class="am">K</span></div></div>`],
  'mark-wordmark': [1200, 400, `<div class="ink" style="width:1200px;height:400px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;border-bottom:14px solid #f0a51f">${wordmark(190)}<div class="cond" style="font-size:26px;letter-spacing:.4em;color:#bdb5a1;text-transform:uppercase">mark to market · 24/7</div></div>`],
  'mark-banner': [1500, 500, `<div class="wall" style="width:1500px;height:500px;position:relative;display:flex;align-items:center;padding:0 70px;gap:60px">
    <div style="flex:1"><div class="cond" style="font-weight:700;font-size:92px;line-height:.92;text-transform:uppercase">The tape stops.<br><span class="am" style="-webkit-text-stroke:1.5px #17150f">The mark doesn't.</span></div>
    <div style="font-size:22px;color:#4a463c;margin-top:22px;max-width:640px">The 24/7 fair-value oracle for tokenized stocks on Robinhood Chain. Signed marks with a confidence band, and a venue to trade them.</div>
    <div class="cond" style="font-size:20px;letter-spacing:.3em;margin-top:24px;text-transform:uppercase">markonrh.xyz · $MARK</div></div>
    <div class="board" style="padding:22px 28px;font-size:44px"><div class="lab" style="margin-bottom:10px">TSLA · Sunday 03:12 ET</div>
      <div style="display:flex;align-items:center;gap:18px;margin:8px 0"><span class="lab" style="width:110px">Official</span>${flaps('357.01', 'dim')}${flaps('65H', 'am')}</div>
      <div style="display:flex;align-items:center;gap:18px;margin:8px 0"><span class="lab" style="width:110px">Mark</span>${flaps('358.38')}${flaps('±71BP', 'am')}</div>
      <div style="display:flex;align-items:center;gap:18px;margin:8px 0"><span class="lab" style="width:110px">Session</span>${flaps('CLOSED', 'am')}${flaps('10', 'gr')}</div></div></div>`],
  'mark-og': [1200, 630, `<div class="wall" style="width:1200px;height:630px;display:flex;flex-direction:column;justify-content:center;padding:0 80px;position:relative">
    <div class="ink" style="position:absolute;top:0;left:0;right:0;height:64px;display:flex;align-items:center;padding:0 80px;gap:22px;border-bottom:6px solid #f0a51f">${wordmark(34)}<span class="cond" style="font-size:14px;letter-spacing:.24em;color:#bdb5a1;text-transform:uppercase">Fair value · 24/7 · Robinhood Chain</span></div>
    <div class="cond" style="font-weight:700;font-size:110px;line-height:.92;text-transform:uppercase;margin-top:30px">Mark to<br>market. <span class="am" style="-webkit-text-stroke:1.5px #17150f">24/7.</span></div>
    <div style="font-size:24px;color:#4a463c;margin-top:24px;max-width:900px">Tokenized stocks trade all weekend. The official price doesn't. MARK blends pools, xStocks, futures and the tape into a signed fair value, and lets you trade it.</div>
    <div class="cond" style="font-size:22px;letter-spacing:.3em;margin-top:26px;text-transform:uppercase">markonrh.xyz · $MARK</div></div>`],
  'mark-how': [1200, 675, `<div class="wall" style="width:1200px;height:675px;padding:44px 56px"><div class="lab">How the mark is made</div><div class="cond" style="font-weight:700;font-size:54px;text-transform:uppercase;line-height:1;margin:6px 0 26px">Five opinions. One <span class="am">weighted median.</span></div>
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:14px">
      ${[['Official tape', 'NYSE / Nasdaq', '357.01', 'fades over 72h'], ['Extended print', 'US ext. session', '356.85', 'fades over 12h'], ['RH pools', 'Uniswap v3/v4 · 8 pools', '358.82', 'by liquidity'], ['xStock', 'Solana · 24/7', '358.38', 'by liquidity'], ['Futures × β', 'NQ since close', '356.68', 'β from 3mo']].map((r) => `<div class="plaque" style="padding:16px 18px"><div class="lab">${r[0]}</div><div style="font-size:13px;color:#8a8476;margin:2px 0 10px">${r[1]}</div><div class="cond" style="font-weight:700;font-size:38px">${r[2]}</div><div style="font-size:13px;color:#4a463c">${r[3]}</div></div>`).join('')}
    </div>
    <div style="display:flex;align-items:center;gap:26px;margin-top:26px"><div class="board" style="padding:16px 24px;font-size:52px;display:flex;align-items:center;gap:20px"><span class="lab">MARK</span>${flaps('358.38')}${flaps('±71BP', 'am')}</div>
      <div style="font-size:17px;color:#4a463c;max-width:520px">Outliers more than 8% from the preliminary median are rejected and reported. The band widens with disagreement and with hours since the close. Every mark is signed; the contract verifies the same integers on-chain.</div></div></div>`],
  'mark-vs': [1200, 675, `<div class="wall" style="width:1200px;height:675px;padding:44px 56px"><div class="lab">Sunday, 03:12 ET · TSLA on Robinhood Chain</div><div class="cond" style="font-weight:700;font-size:54px;text-transform:uppercase;line-height:1;margin:6px 0 26px">A 65-hour-old number is <span class="am">not a price.</span></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:22px">
      <div class="plaque" style="padding:26px 28px"><div class="lab">Every other oracle</div><div class="cond" style="font-weight:700;font-size:34px;margin:6px 0 14px">Last close, frozen</div>
        <div class="board" style="padding:14px 20px;font-size:48px;display:inline-flex;gap:16px;align-items:center">${flaps('357.01', 'dim')}${flaps('65H', 'am')}</div>
        <ul style="margin:18px 0 0 18px;font-size:16px;color:#4a463c;line-height:1.7"><li>Perps freeze or mark to a stale print</li><li>Lending markets can't liquidate honestly</li><li>Prediction markets settle on a memory</li><li>No confidence band, no signal of doubt</li></ul></div>
      <div class="plaque" style="padding:26px 28px;border:2px solid #17150f"><div class="lab">MARK</div><div class="cond" style="font-weight:700;font-size:34px;margin:6px 0 14px">Fair value, right now</div>
        <div class="board" style="padding:14px 20px;font-size:48px;display:inline-flex;gap:16px;align-items:center">${flaps('358.38')}${flaps('±71BP', 'am')}</div>
        <ul style="margin:18px 0 0 18px;font-size:16px;color:#4a463c;line-height:1.7"><li>Reads every pool, the xStock, the futures</li><li>Weighted median, outliers rejected</li><li>Band that says how sure it is</li><li>Signed off-chain, verified on-chain, tradeable</li></ul></div>
    </div><div class="cond" style="font-size:20px;letter-spacing:.3em;margin-top:24px;text-transform:uppercase">markonrh.xyz · $MARK</div></div>`],
};
for (const [name, [w, h, body]] of Object.entries(assets)) {
  const html = `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${BASE}html,body{width:${w}px;height:${h}px}</style></head><body>${body}</body></html>`;
  const f = path.join(TMP, name + '.html'); fs.writeFileSync(f, html);
  const url = 'file:///' + f.replace(/\\/g, '/');
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--force-device-scale-factor=1', `--window-size=${w},${h}`, '--virtual-time-budget=6000', `--screenshot=${path.join(OUT, name + '.png')}`, url], { stdio: 'ignore' });
  console.log('✓', name + '.png');
}

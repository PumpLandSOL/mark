// MARK promo graphics (4) — 1200×675, headless Chrome → brand/promo-*.png
'use strict';
const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(__dirname, '..', 'brand'); const TMP = path.join(__dirname, 'out'); fs.mkdirSync(TMP, { recursive: true });
const FONTS = `<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">`;
const BASE = `*{margin:0;padding:0;box-sizing:border-box}html,body{width:1200px;height:675px;overflow:hidden}body{font-family:'IBM Plex Sans',sans-serif;color:#17150f;background:#ebe4d6;background-image:radial-gradient(ellipse at 50% -10%,rgba(255,255,255,.55),transparent 60%)}
.cond{font-family:'Barlow Condensed',Impact,sans-serif}.am{color:#f0a51f}.ink{background:#17150f;color:#f3ecd9}
.fl{display:inline-flex;gap:3px}.fc{position:relative;width:.62em;height:1.06em;line-height:1.06em;text-align:center;font-family:'Barlow Condensed',Impact,sans-serif;font-weight:600;background:#2a2a31;color:#f3ecd9;border-radius:3px;overflow:hidden}
.fc::before{content:"";position:absolute;left:0;right:0;top:50%;height:1.5px;background:rgba(0,0,0,.7);z-index:2}.fc.am{color:#f0a51f}.fc.gr{color:#5ec87a}.fc.dim{color:#a39d8c}.fc.rd{color:#e8604f}
.board{background:#141418;border:8px solid #0d0d10;border-radius:8px;box-shadow:0 30px 60px -20px rgba(0,0,0,.6)}
.plaque{background:#f3ecd9;border:1px solid #d5cbb6;padding:18px 22px;border-radius:2px;box-shadow:0 10px 30px -18px rgba(0,0,0,.35)}
.lab{font-family:'Barlow Condensed',Impact,sans-serif;font-size:13px;letter-spacing:.26em;text-transform:uppercase;color:#8a8476}
.h{font-family:'Barlow Condensed',Impact,sans-serif;font-weight:700;text-transform:uppercase;line-height:.92}
.url{font-family:'Barlow Condensed',Impact,sans-serif;font-size:20px;letter-spacing:.3em;text-transform:uppercase;position:absolute;left:56px;bottom:40px}
.wrap{position:relative;width:1200px;height:675px;padding:44px 56px}`;
const flaps = (s, cls) => `<span class="fl">${[...s].map((c) => `<span class="fc ${cls || ''}">${c === ' ' ? '' : c}</span>`).join('')}</span>`;
const row = (sym, off, age, mark, conf, sess) => `<div style="display:flex;align-items:center;gap:16px;font-size:30px;margin:6px 0"><span style="width:96px">${flaps(sym.padEnd(5))}</span>${flaps(off.padStart(7), 'dim')}${flaps(age.padStart(7), 'am')}${flaps(mark.padStart(7))}${flaps(conf.padStart(6), 'am')}${flaps(sess.padEnd(6), sess === 'OPEN' ? 'gr' : 'am')}</div>`;

const G = {
  'promo-65h': `<div class="wrap ink" style="background:#17150f;color:#f3ecd9">
    <div class="lab" style="color:#f0a51f">Every single weekend</div>
    <div class="h" style="font-size:250px;margin-top:6px"><span class="am">65</span> hours</div>
    <div class="h" style="font-size:64px;margin-top:-6px">of tokenized stocks trading<br>with <span class="am">no honest price.</span></div>
    <div style="font-size:22px;color:#bdb5a1;margin-top:26px;max-width:820px">Friday 16:00 to Monday 09:30. Every equity oracle freezes at the close. TSLA on Robinhood Chain prints every block the whole time. MARK is the only feed still marking.</div>
    <div class="url" style="color:#f0a51f">markonrh.xyz · $MARK</div>
    <div class="board" style="position:absolute;right:56px;bottom:40px;padding:14px 20px;font-size:40px;display:flex;flex-direction:column;gap:8px"><div style="display:flex;gap:14px;align-items:center"><span class="lab">Others</span>${flaps('FROZEN', 'rd')}</div><div style="display:flex;gap:14px;align-items:center"><span class="lab">MARK&nbsp;&nbsp;</span>${flaps('LIVE', 'gr')}${flaps('24/7', 'am')}</div></div></div>`,

  'promo-board': `<div class="wrap">
    <div class="lab">Day one</div>
    <div class="h" style="font-size:62px;margin:4px 0 18px">16 names. Every one <span class="am">marked 24/7.</span></div>
    <div class="board" style="padding:16px 22px;width:1088px">
      <div style="display:flex;gap:16px;font-size:30px;margin-bottom:6px"><span class="lab" style="width:96px">Ticker</span><span class="lab" style="width:157px;text-align:right">Official</span><span class="lab" style="width:157px;text-align:right">Age</span><span class="lab" style="width:157px;text-align:right">Mark</span><span class="lab" style="width:135px;text-align:right">± Conf</span><span class="lab" style="width:135px">Session</span></div>
      <div style="columns:1">${[['SPY', '765.16', '13H 17M', '766.07', '±55BP', 'CLOSED'], ['NVDA', '224.41', '13H 17M', '225.60', '±72BP', 'CLOSED'], ['TSLA', '357.01', '13H 17M', '358.38', '±71BP', 'CLOSED'], ['AAPL', '324.96', '13H 17M', '324.92', '±55BP', 'CLOSED'], ['HOOD', '106.99', '13H 17M', '108.11', '±98BP', 'CLOSED'], ['MSTR', '123.19', '13H 17M', '123.27', '±87BP', 'CLOSED'], ['COIN', '174.96', '13H 17M', '175.31', '±80BP', 'CLOSED']].map((r) => row(...r)).join('')}</div>
      <div class="lab" style="margin-top:10px;color:#8f887a">+ QQQ · MSFT · AMZN · META · GOOGL · PLTR · GME · AMD · CRCL</div>
    </div>
    <div class="url">markonrh.xyz · $MARK</div><div class="cond" style="position:absolute;right:56px;bottom:40px;font-size:20px;letter-spacing:.3em;text-transform:uppercase;color:#4a463c">Real Robinhood Chain pools · real xStocks · real futures</div></div>`,

  'promo-stack': `<div class="wrap">
    <div class="lab">Infrastructure</div>
    <div class="h" style="font-size:62px;margin:4px 0 22px">Everything on Robinhood Chain<br>that needs a price <span class="am">needs MARK.</span></div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px">
      ${[['Perps', 'Mark, fund and liquidate at 3am Sunday without a stale print.'], ['Lending', 'Tokenized-stock collateral priced honestly, with a band to haircut.'], ['Prediction', 'Settle weekend markets on a fair value, not a memory.'], ['Vaults', 'NAV every block. Options, baskets, structured products.']].map((c) => `<div class="plaque"><div class="lab">${c[0]}</div><div class="cond" style="font-weight:700;font-size:30px;margin:4px 0 8px">reads MARK</div><div style="font-size:15px;color:#4a463c">${c[1]}</div></div>`).join('')}
    </div>
    <div style="display:flex;align-items:center;gap:22px;margin-top:22px">
      <div class="board" style="padding:12px 20px;font-size:44px;display:flex;gap:16px;align-items:center"><span class="lab">One feed</span>${flaps('SIGNED', 'gr')}${flaps('24/7', 'am')}${flaps('ON-CHAIN')}</div>
      <div style="font-size:17px;color:#4a463c;max-width:420px">One GET off-chain, one call on-chain. Same fixed-point integers, same signature. Every venue built on it reads the same truth.</div>
    </div>
    <div class="url">markonrh.xyz · $MARK</div></div>`,

  'promo-token': `<div class="wrap ink" style="background:#17150f;color:#f3ecd9">
    <div class="lab" style="color:#f0a51f">$MARK</div>
    <div class="h" style="font-size:78px;margin:4px 0 22px">The token that<br><span class="am">pays for the truth.</span></div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">
      ${[['Reads pay', 'Every paid on-chain pull is charged in $MARK and streamed to the publishers whose reports were used.'], ['Publishers stake', 'No stake, no post. The oracle set is bonded in $MARK and grows with every venue that plugs in.'], ['Bad prices burn', 'A report outside the band is slashed 20% and the bounty goes to whoever caught it. Honesty is the yield.']].map((c) => `<div style="background:#1d1d23;border:1px solid #2a2a32;border-top:5px solid #f0a51f;padding:20px 22px;border-radius:2px"><div class="cond" style="font-weight:700;font-size:32px;margin-bottom:8px">${c[0]}</div><div style="font-size:16px;color:#bdb5a1;line-height:1.45">${c[1]}</div></div>`).join('')}
    </div>
    <div style="display:flex;align-items:center;gap:18px;margin-top:26px;font-size:44px"><span class="lab" style="color:#8f887a">Demand</span>${flaps('EVERY READ', 'am')}<span class="lab" style="color:#8f887a">Supply</span>${flaps('STAKED', 'gr')}</div>
    <div class="url" style="color:#f0a51f">markonrh.xyz · $MARK · Robinhood Chain</div></div>`,
};
for (const [name, body] of Object.entries(G)) {
  const f = path.join(TMP, name + '.html'); fs.writeFileSync(f, `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${BASE}</style></head><body>${body}</body></html>`);
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--window-size=1200,675', '--virtual-time-budget=6000', '--screenshot=' + path.join(OUT, name + '.png'), 'file:///' + f.split(String.fromCharCode(92)).join('/')], { stdio: 'ignore' });
  console.log('✓', name);
}

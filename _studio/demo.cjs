// MARK product demo — 15s. Drives the REAL site: board → TSLA feed (sources + verify) → trade page.
//   node _studio/demo.cjs            # http://localhost:8194
//   SITE=https://markonrh.xyz node _studio/demo.cjs
'use strict';
const path = require('path');
const { record, OVERLAY } = require('./rec.cjs');
const SITE = process.env.SITE || 'http://localhost:8194';

record({
  site: SITE + '/', out: path.join(__dirname, '..', 'brand', 'mark-demo-15s.mp4'), port: 9455,
  script: async ({ ev, sleep }) => {
    await ev(OVERLAY, true);
    await ev("window.__title('The tape stops.<br><em>The mark doesn\\'t.</em>','markonrh.xyz · the 24/7 oracle for tokenized stocks')"); await sleep(1400);
    await ev('window.__titleHide()'); await sleep(200);
    await ev("window.__scrollToSel('.boardwrap',900)", true);
    await ev("window.__cap('the board','16 tokenized stocks. Official print, its age, and the <b>MARK</b> with a confidence band. Flipping 24/7.')"); await sleep(1900);
    await ev("window.__capHide()"); await sleep(150);
    await ev("location.href='" + SITE + "/feed/TSLA'"); await sleep(1500);
    await ev(OVERLAY, true);
    await ev("window.__cap('one stock, every source','Official tape, extended print, each Robinhood Chain pool by liquidity, the xStock on Solana, futures × β. <b>Weighted median.</b>')"); await sleep(1900);
    await ev("window.__capHide()"); await sleep(120);
    await ev("window.__scrollToSel('#verify',800)", true); await sleep(200);
    await ev("window.__cursorToSel('#verify')"); await sleep(450);
    await ev("window.__clickSel('#verify')"); await sleep(600);
    await ev("window.__cap('signed','Every mark is signed. <b>Verify it yourself</b> with one GET, or on-chain.')"); await sleep(1200);
    await ev("window.__capHide()"); await sleep(120);
    await ev("location.href='" + SITE + "/trade'"); await sleep(1400);
    await ev(OVERLAY, true);
    await ev("window.__cap('trade it','USDG perps on Robinhood Chain, up to 10×, filled at mark ± half the band. <b>All weekend.</b>')"); await sleep(1500);
    await ev("window.__capHide()"); await sleep(120);
    await ev("window.__title('MARK<br><em>mark to market. 24/7.</em>','markonrh.xyz · $MARK')"); await sleep(1300);
  },
}).catch((e) => { console.error(e); process.exit(1); });

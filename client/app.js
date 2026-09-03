// MARK board — SSE-driven split-flap departures board.
'use strict';
(function () {
  const rows = document.getElementById('rows');
  const R = {};   // sym → { tr, flaps }
  const fmtPx = (p) => p >= 1000 ? p.toFixed(1) : p >= 100 ? p.toFixed(2) : p.toFixed(2);
  const fmtBps = (b) => (b == null ? '—' : (b >= 0 ? '+' : '') + Math.round(b) + 'BP');
  const ageStr = (h) => { if (h == null) return '—'; if (h < 1) return Math.round(h * 60) + 'M'; const H = Math.floor(h), M = Math.round((h - H) * 60); return H + 'H ' + String(M).padStart(2, '0') + 'M'; };
  const sessCls = { open: 'green', pre: '', post: '', closed: 'amber' };
  const sessTxt = { open: 'OPEN', pre: 'PRE', post: 'POST', closed: 'CLOSED' };

  function row(f) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td><span class="fl" data-w="5"></span></td><td class="name"><a href="/feed/' + f.sym + '">' + f.name + '</a></td><td class="r"><span class="fl" data-w="8" data-a="right"></span></td><td class="r"><span class="fl" data-w="7" data-a="right"></span></td><td class="r"><span class="fl" data-w="8" data-a="right"></span></td><td class="r"><span class="fl" data-w="6" data-a="right"></span></td><td class="r"><span class="fl" data-w="6" data-a="right"></span></td><td><span class="fl" data-w="6"></span></td>';
    rows.appendChild(tr);
    const flaps = Array.from(tr.querySelectorAll('.fl')).map((el) => new Flap(el, +el.dataset.w, { align: el.dataset.a }));
    tr.style.cursor = 'pointer'; tr.addEventListener('click', () => location.href = '/feed/' + f.sym);
    return { tr, flaps };
  }
  function render(b) {
    for (const f of b.feeds) {
      const r = R[f.sym] || (R[f.sym] = row(f));
      const [sym, off, age, mark, conf, basis, sess] = r.flaps;
      sym.set(f.sym);
      off.set(f.official ? fmtPx(f.official.price) : '—', 'dim');
      age.set(f.session === 'open' ? 'LIVE' : ageStr(f.official && f.official.ageH), f.session === 'open' ? 'green' : f.official && f.official.ageH > 20 ? 'amber' : 'dim');
      mark.set(fmtPx(f.mark), f.dir > 0 ? 'green' : f.dir < 0 ? 'red' : '');
      conf.set('±' + Math.round(f.confBps) + 'BP', f.confBps > 150 ? 'amber' : '');
      basis.set(fmtBps(f.basis.pool), f.basis.pool == null ? 'dim' : Math.abs(f.basis.pool) > 100 ? 'amber' : '');
      sess.set(sessTxt[f.session], sessCls[f.session]);
    }
    document.getElementById('sig').textContent = 'Signer ' + b.signer.slice(0, 8) + '… · ' + b.feeds.length + ' feeds · seq ' + Math.max.apply(null, b.feeds.map((f) => f.seq));
    NEXT = b.nextOpen; SESS = b.session;
    if (b.live && b.mint) { document.getElementById('cabar').hidden = false; document.getElementById('ca').textContent = b.mint; }
  }
  let NEXT = null, SESS = 'closed';
  const clk = new Flap(document.getElementById('clk'), 8), reopen = new Flap(document.getElementById('reopen'), 7, { align: 'right' });
  const NYF = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  setInterval(() => {
    clk.set(NYF.format(new Date()).replace(/^24/, '00'));
    if (SESS === 'open') { reopen.set('OPEN', 'green'); document.getElementById('reopenL').firstChild.textContent = 'Wall St is '; }
    else if (NEXT) { const s = Math.max(0, NEXT - Date.now()) / 1000; const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); reopen.set(h + 'H ' + String(m).padStart(2, '0') + 'M', 'amber'); }
  }, 1000);

  function connect() {
    try {
      const es = new EventSource('/api/stream');
      es.onmessage = (e) => render(JSON.parse(e.data));
      es.onerror = () => { es.close(); setTimeout(connect, 3000); };
    } catch (e) { fetch('/api/board').then((r) => r.json()).then(render); setTimeout(connect, 5000); }
  }
  connect();

  // live proof panel
  const PROOF = 'TSLA';
  async function proof() {
    const f = await fetch('/api/feed/' + PROOF).then((r) => r.json());
    const tb = document.querySelector('#proofTbl tbody');
    tb.innerHTML = f.sources.map((s) => '<tr><td>' + s.label + '</td><td>' + s.venue + '</td><td class="r">' + fmtPx(s.price) + '</td><td class="r">' + (s.w * 100).toFixed(1) + '%</td><td class="r ' + (s.devBps > 0 ? 'up' : s.devBps < 0 ? 'dn' : '') + '">' + fmtBps(s.devBps) + '</td></tr>').join('')
      + f.rejected.map((s) => '<tr class="rej"><td>' + s.label + '</td><td>' + s.venue + '</td><td class="r">' + fmtPx(s.price) + '</td><td class="r">rejected</td><td class="r">' + fmtBps(s.devBps) + '</td></tr>').join('')
      + '<tr><td colspan="2"><b>MARK</b> · weighted median</td><td class="r"><b>' + fmtPx(f.mark) + '</b></td><td class="r">±' + Math.round(f.confBps) + 'bp</td><td class="r"><span class="pill ' + (sessCls[f.session] || '') + '">' + sessTxt[f.session] + '</span></td></tr>';
    const o = f.official;
    document.getElementById('proofH').textContent = f.sym + ' marks ' + fmtPx(f.mark) + ' ± ' + f.conf.toFixed(2);
    document.getElementById('proofP').innerHTML = o ? 'Wall Street\'s last official print is <b>' + fmtPx(o.price) + '</b>, ' + ageStr(o.ageH) + ' old. Robinhood Chain pools sit <b>' + fmtBps(f.basis.pool) + '</b> from the mark across $' + Math.round(f.poolLiq / 1e3).toLocaleString() + 'k of liquidity in ' + f.poolCount + ' pools' + (f.basis.xstock != null ? '; the xStock on Solana is ' + fmtBps(f.basis.xstock) + '.' : '.') + ' Session: ' + sessTxt[f.session] + '.' : '';
  }
  proof(); setInterval(proof, 20000);

  const copy = document.getElementById('copyca'); if (copy) copy.onclick = () => navigator.clipboard.writeText(document.getElementById('ca').textContent);
})();

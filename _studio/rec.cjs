// Shared screencast recorder: headless Chrome over CDP → jpeg frames → ffmpeg 30fps mp4. Zero deps.
'use strict';
const { spawn, execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const pexec = promisify(execFile);
const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function record({ site, out, W = 1280, H = 720, port = 9455, script }) {
  const FRAMES = path.join(__dirname, 'rec-frames-' + port);
  fs.rmSync(FRAMES, { recursive: true, force: true }); fs.mkdirSync(FRAMES, { recursive: true });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--force-device-scale-factor=1', `--window-size=${W},${H}`, `--remote-debugging-port=${port}`, '--remote-allow-origins=*', `--user-data-dir=${path.join(__dirname, 'rec-profile-' + port)}`, '--autoplay-policy=no-user-gesture-required', site], { stdio: 'ignore' });
  const frames = [];
  try {
    for (let i = 0; i < 80; i++) { try { const r = await fetch(`http://127.0.0.1:${port}/json/version`); if (r.ok) break; } catch {} await sleep(200); }
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    const p = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    const ws = new WebSocket(p.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
    let id = 0; const pending = new Map(); const listeners = [];
    ws.addEventListener('message', (evt) => { const m = JSON.parse(evt.data); if (m.id && pending.has(m.id)) { const { resolve, reject } = pending.get(m.id); pending.delete(m.id); m.error ? reject(new Error(m.error.message)) : resolve(m.result); } else if (m.method) listeners.forEach((fn) => fn(m)); });
    const send = (method, params = {}) => new Promise((resolve, reject) => { const mid = ++id; pending.set(mid, { resolve, reject }); ws.send(JSON.stringify({ id: mid, method, params })); });
    await send('Page.enable'); await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    const ev = (expr, awaitPromise = false) => send('Runtime.evaluate', { expression: expr, awaitPromise, returnByValue: true });
    await sleep(2500);
    await ev('document.fonts && document.fonts.ready.then(()=>1)', true).catch(() => {});
    listeners.push((m) => { if (m.method === 'Page.screencastFrame') { frames.push({ buf: Buffer.from(m.params.data, 'base64'), t: Date.now() }); send('Page.screencastFrameAck', { sessionId: m.params.sessionId }).catch(() => {}); } });
    await send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
    await script({ ev, sleep, send });
    await send('Page.stopScreencast'); await sleep(300); ws.close();
  } finally { chrome.kill(); }
  if (frames.length < 5) throw new Error('too few frames: ' + frames.length);
  const lines = [];
  for (let i = 0; i < frames.length; i++) {
    const name = `f_${String(i).padStart(5, '0')}.jpg`;
    fs.writeFileSync(path.join(FRAMES, name), frames[i].buf);
    const dur = i < frames.length - 1 ? Math.max(0.016, (frames[i + 1].t - frames[i].t) / 1000) : 0.5;
    lines.push(`file '${name}'`, `duration ${dur.toFixed(3)}`);
  }
  lines.push(`file 'f_${String(frames.length - 1).padStart(5, '0')}.jpg'`);
  fs.writeFileSync(path.join(FRAMES, 'list.txt'), lines.join('\n'));
  console.log(`captured ${frames.length} frames over ${((frames[frames.length - 1].t - frames[0].t) / 1000).toFixed(1)}s — encoding…`);
  await pexec('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', path.join(FRAMES, 'list.txt'), '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '19', '-preset', 'slow', '-movflags', '+faststart', out], { maxBuffer: 1 << 27 });
  fs.rmSync(FRAMES, { recursive: true, force: true });
  console.log('✓', out);
}

// caption / title / cursor overlay in MARK's station-sign language
const OVERLAY = String.raw`(() => {
  const s = document.createElement('style');
  s.textContent = "#dmT{position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#17150f;opacity:0;transition:opacity .45s}#dmT.on{opacity:1}#dmT .t{font-family:'Barlow Condensed',Impact,sans-serif;font-weight:700;font-size:96px;line-height:.95;letter-spacing:.01em;text-transform:uppercase;color:#f3ecd9;text-align:center;max-width:1100px}#dmT .t em{font-style:normal;color:#f0a51f}#dmT .s{font-family:'Barlow Condensed',Impact,sans-serif;font-size:22px;letter-spacing:.3em;color:#bdb5a1;margin-top:22px;text-transform:uppercase}#dmC{position:fixed;left:40px;bottom:40px;z-index:99998;max-width:640px;background:#17150f;color:#f3ecd9;border-bottom:5px solid #f0a51f;padding:16px 24px;opacity:0;transform:translateY(24px);transition:opacity .3s,transform .3s;box-shadow:0 20px 50px rgba(0,0,0,.35)}#dmC.on{opacity:1;transform:none}#dmC .k{font-family:'Barlow Condensed',Impact,sans-serif;font-size:13px;letter-spacing:.28em;color:#f0a51f;text-transform:uppercase}#dmC .v{font-family:'IBM Plex Sans',system-ui,sans-serif;font-size:23px;line-height:1.35;margin-top:5px;font-weight:500}#dmC .v b{color:#f0a51f}#dmU{position:fixed;z-index:99999;width:22px;height:22px;left:0;top:0;pointer-events:none;transition:left .6s cubic-bezier(.5,0,.2,1),top .6s cubic-bezier(.5,0,.2,1);opacity:0}#dmR{position:fixed;z-index:99999;width:60px;height:60px;border:3px solid #f0a51f;border-radius:50%;pointer-events:none;opacity:0;transform:translate(-50%,-50%) scale(.3)}#dmR.go{animation:dmr .55s ease-out}@keyframes dmr{0%{opacity:.9;transform:translate(-50%,-50%) scale(.3)}100%{opacity:0;transform:translate(-50%,-50%) scale(1.5)}}";
  document.head.appendChild(s);
  const T = document.createElement('div'); T.id = 'dmT'; T.innerHTML = '<div class="t"></div><div class="s"></div>'; document.body.appendChild(T);
  const C = document.createElement('div'); C.id = 'dmC'; C.innerHTML = '<div class="k"></div><div class="v"></div>'; document.body.appendChild(C);
  const U = document.createElement('div'); U.id = 'dmU'; U.innerHTML = '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M2 2 L2 17 L6 13 L9 20 L12 19 L9 12 L15 12 Z" fill="#f3ecd9" stroke="#17150f" stroke-width="1.4"/></svg>'; document.body.appendChild(U);
  const R = document.createElement('div'); R.id = 'dmR'; document.body.appendChild(R);
  window.__title = (t, sub) => { T.querySelector('.t').innerHTML = t; T.querySelector('.s').textContent = sub || ''; T.classList.add('on'); };
  window.__titleHide = () => T.classList.remove('on');
  window.__cap = (k, v) => { C.querySelector('.k').textContent = k || ''; C.querySelector('.v').innerHTML = v || ''; C.classList.add('on'); };
  window.__capHide = () => C.classList.remove('on');
  window.__center = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; };
  window.__cursorToSel = (sel) => { const c = window.__center(sel); if (!c) return; U.style.opacity = '1'; U.style.left = c.x + 'px'; U.style.top = c.y + 'px'; };
  window.__clickSel = (sel) => { const c = window.__center(sel); if (!c) return false; R.style.left = c.x + 'px'; R.style.top = c.y + 'px'; R.classList.remove('go'); void R.offsetWidth; R.classList.add('go'); const el = document.querySelector(sel); if (el) el.click(); return true; };
  window.__scrollToSel = (sel, dur) => new Promise((res) => { const el = document.querySelector(sel); if (!el) { res(); return; } const y0 = window.scrollY, y1 = window.scrollY + el.getBoundingClientRect().top - window.innerHeight * 0.12; const t0 = performance.now(); dur = dur || 1000; (function fr(t) { const k = Math.min(1, (t - t0) / dur), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; window.scrollTo(0, y0 + (y1 - y0) * e); if (k < 1) requestAnimationFrame(fr); else res(); })(t0); });
  return true;
})()`;

module.exports = { record, OVERLAY, sleep };

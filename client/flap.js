// Split-flap display. new Flap(el, width, {align:'left'|'right'}).set('TEXT') — each changed cell folds over.
'use strict';
(function () {
  function Flap(el, width, opt) {
    this.el = el; this.w = width; this.opt = opt || {}; this.cells = []; this.cur = '';
    el.classList.add('fl');
    for (let i = 0; i < width; i++) {
      const c = document.createElement('span'); c.className = 'fc blank';
      c.innerHTML = '<span class="h t" data-c=""></span><span class="h b" data-c=""></span><span class="h t ta" data-c=""></span><span class="h b bb" data-c=""></span>';
      el.appendChild(c); this.cells.push(c);
    }
  }
  Flap.prototype.set = function (text, cls) {
    text = String(text == null ? '' : text).toUpperCase();
    if (text.length > this.w) text = text.slice(0, this.w);
    text = this.opt.align === 'right' ? text.padStart(this.w) : text.padEnd(this.w);
    if (cls !== undefined) { this.el.className = 'fl' + (cls ? ' ' + cls : ''); }
    if (text === this.cur) return;
    const old = this.cur.padEnd(this.w);
    this.cur = text;
    for (let i = 0; i < this.w; i++) {
      const ch = text[i], oc = old[i] || ' ', c = this.cells[i];
      if (ch === oc) continue;
      const t = c.children[0], b = c.children[1], ta = c.children[2], bb = c.children[3];
      c.classList.toggle('blank', ch === ' ');
      c.classList.remove('flip'); void c.offsetWidth;
      t.setAttribute('data-c', ch); b.setAttribute('data-c', oc); ta.setAttribute('data-c', oc); bb.setAttribute('data-c', ch);
      const delay = Math.min(i, 8) * 28;
      setTimeout(() => { c.classList.add('flip'); setTimeout(() => { b.setAttribute('data-c', ch); ta.setAttribute('data-c', ch); c.classList.remove('flip'); }, 340); }, delay);
    }
  };
  window.Flap = Flap;
})();

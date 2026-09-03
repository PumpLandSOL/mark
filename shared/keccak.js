// keccak-256 (Ethereum flavour, padding 0x01). Runs in Node and the browser. Input: Uint8Array/Buffer or string (utf8). Output: hex (no 0x).
(function (root) {
  'use strict';
  const RC = ['0000000000000001', '0000000000008082', '800000000000808a', '8000000080008000', '000000000000808b', '0000000080000001', '8000000080008081', '8000000000008009', '000000000000008a', '0000000000000088', '0000000080008009', '000000008000000a', '000000008000808b', '800000000000008b', '8000000000008089', '8000000000008003', '8000000000008002', '8000000000000080', '000000000000800a', '800000008000000a', '8000000080008081', '8000000000008080', '0000000080000001', '8000000080008008'].map((h) => BigInt('0x' + h));
  const ROT = [[0, 36, 3, 41, 18], [1, 44, 10, 45, 2], [62, 6, 43, 15, 61], [28, 55, 25, 21, 56], [27, 20, 39, 8, 14]];
  const M = (1n << 64n) - 1n;
  const rotl = (x, n) => n === 0 ? x : ((x << BigInt(n)) | (x >> BigInt(64 - n))) & M;
  function f(A) {
    for (let r = 0; r < 24; r++) {
      const C = [], D = [];
      for (let x = 0; x < 5; x++) C[x] = A[x] ^ A[x + 5] ^ A[x + 10] ^ A[x + 15] ^ A[x + 20];
      for (let x = 0; x < 5; x++) D[x] = C[(x + 4) % 5] ^ rotl(C[(x + 1) % 5], 1);
      for (let i = 0; i < 25; i++) A[i] ^= D[i % 5];
      const B = new Array(25);
      for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) B[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(A[x + 5 * y], ROT[x][y]);
      for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) A[x + 5 * y] = B[x + 5 * y] ^ ((~B[(x + 1) % 5 + 5 * y]) & M & B[(x + 2) % 5 + 5 * y]);
      A[0] ^= RC[r];
    }
  }
  function keccak256(input) {
    let bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
    const rate = 136, A = new Array(25).fill(0n);
    const padLen = rate - (bytes.length % rate);
    const p = new Uint8Array(bytes.length + padLen); p.set(bytes); p[bytes.length] |= 0x01; p[p.length - 1] |= 0x80;
    for (let off = 0; off < p.length; off += rate) {
      for (let i = 0; i < rate / 8; i++) { let v = 0n; for (let b = 7; b >= 0; b--) v = (v << 8n) | BigInt(p[off + i * 8 + b]); A[i] ^= v; }
      f(A);
    }
    let out = '';
    for (let i = 0; i < 4; i++) { let v = A[i]; for (let b = 0; b < 8; b++) { out += (v & 0xffn).toString(16).padStart(2, '0'); v >>= 8n; } }
    return out;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = keccak256; else root.keccak256 = keccak256;
})(typeof window !== 'undefined' ? window : globalThis);

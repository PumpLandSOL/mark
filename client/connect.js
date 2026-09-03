// Wallet connect — Robinhood Chain (chainId 4663, ETH gas). Falls back to a local desk id if no EVM wallet.
'use strict';
(function () {
  const CHAIN_HEX = '0x1237';
  const CHAIN = { chainId: CHAIN_HEX, chainName: 'Robinhood Chain', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://rpc.mainnet.chain.robinhood.com'] };
  const btn = document.getElementById('connect');
  window.WALLET = null;
  const short = (a) => a.slice(0, 6) + '…' + a.slice(-4);
  function setLive(addr) { window.WALLET = addr.toLowerCase(); if (btn) { btn.textContent = short(addr); btn.classList.add('live'); } document.dispatchEvent(new CustomEvent('wallet', { detail: window.WALLET })); }
  async function ensureChain(eth) {
    try { await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_HEX }] }); }
    catch (e) { if (e && e.code === 4902) { try { await eth.request({ method: 'wallet_addEthereumChain', params: [CHAIN] }); } catch (e2) {} } }
  }
  async function connect(eager) {
    const eth = window.ethereum;
    if (!eth) { if (!eager) alert('No EVM wallet found — install MetaMask or Rabby. The Desk still works with a local desk id.'); return; }
    try {
      const acc = await eth.request({ method: eager ? 'eth_accounts' : 'eth_requestAccounts' });
      if (!acc || !acc.length) return;
      if (!eager) await ensureChain(eth);
      localStorage.markConnected = '1'; setLive(acc[0]);
    } catch (e) {}
  }
  window.connectWallet = () => connect(false);
  if (btn) btn.addEventListener('click', () => { if (!btn.classList.contains('live')) connect(false); });
  if (window.ethereum && window.ethereum.on) window.ethereum.on('accountsChanged', (a) => { if (a && a.length) setLive(a[0]); });
  if (localStorage.markConnected === '1') connect(true);
  // local desk id for wallet-less visitors
  window.deskId = function () {
    if (window.WALLET) return window.WALLET;
    let id = localStorage.markDesk;
    if (!id) { const b = new Uint8Array(8); crypto.getRandomValues(b); id = 'desk_' + Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join(''); localStorage.markDesk = id; }
    return id;
  };
})();

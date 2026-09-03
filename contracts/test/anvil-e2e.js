// End-to-end on a local anvil: deploy MockUSDG + MarkPerps with the server's EVM signer, then
// deposit → provide → open (signed price) → close (signed price) → liquidate path, via cast.
// Usage: node contracts/test/anvil-e2e.js   (needs anvil on :8545 with unlocked default accounts)
'use strict';
const { execSync } = require('child_process');
const path = require('path');
const EVM = require('../../server/evm');
const ROOT = path.join(__dirname, '..', '..');
const RPC = 'http://127.0.0.1:8545';
const A0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'; // anvil account 0 (unlocked)
const A1 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'; // anvil account 1
const sh = (c) => execSync(c, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const cast = (c) => sh('cast ' + c + ' --rpc-url ' + RPC).replace(/ \[[^\]]*\]/g, '');
const send = (from, to, sig, args) => cast(`send ${to} "${sig}" ${args} --from ${from} --unlocked --json`);
const ok = (label, cond) => { console.log((cond ? 'PASS ' : 'FAIL ') + label); if (!cond) process.exitCode = 1; };

EVM.init(null);
const SIGNER = EVM.address();
console.log('signer', SIGNER);
const PX_T = '(bytes32,int64,uint64,uint64,uint8,bytes32,bytes32)';
const px = (m) => { const p = EVM.signPrice(m); return `(${p.sym32},${p.price},${p.conf},${p.ts},${p.session},${p.r},${p.s})`; };
const now = () => Math.floor(Date.now() / 1000);

// deploy
const usdgOut = sh(`forge create contracts/test/MockUSDG.sol:MockUSDG --rpc-url ${RPC} --from ${A0} --unlocked --broadcast --json`);
const USDG = JSON.parse(usdgOut).deployedTo;
const sym32 = '0x' + Buffer.from('TSLA').toString('hex').padEnd(64, '0');
const perpsOut = sh(`forge create contracts/MarkPerps.sol:MarkPerps --rpc-url ${RPC} --from ${A0} --unlocked --broadcast --json --constructor-args ${USDG} ${SIGNER} "[${sym32}]"`);
const PERPS = JSON.parse(perpsOut).deployedTo;
console.log('USDG', USDG, 'PERPS', PERPS);

// fund + approve
send(A0, USDG, 'mint(address,uint256)', `${A0} 1000000000000`);   // 1,000,000 USDG
send(A0, USDG, 'mint(address,uint256)', `${A1} 100000000000`);
send(A0, USDG, 'approve(address,uint256)', `${PERPS} 1000000000000`);
send(A1, USDG, 'approve(address,uint256)', `${PERPS} 100000000000`);
send(A0, PERPS, 'provide(uint256)', '500000000000');                // LP 500,000
send(A1, PERPS, 'deposit(uint256)', '10000000000');                 // trader 10,000
ok('pool = 500000', cast(`call ${PERPS} "poolBalance()(uint256)"`) === '500000000000');
ok('free = 10000', cast(`call ${PERPS} "free(address)(uint256)" ${A1}`) === '10000000000');

// bad signature must revert
let reverted = false;
try { const p = EVM.signPrice({ sym: 'TSLA', mark: 358, conf: 2.5, ts: Date.now(), session: 'closed' }); send(A1, PERPS, `open(${PX_T},bool,uint256,uint256)`, `"(${p.sym32},${p.price},${p.conf},${p.ts},${p.session},${p.r},${p.r})" true 1000000000 5`); } catch (e) { reverted = /bad sig/.test(e.stderr || e.message); }
ok('tampered signature reverts', reverted);

// open long 5x with 1,000 margin at mark 358 ± 2.5 → fill 359.25
const o = JSON.parse(send(A1, PERPS, `open(${PX_T},bool,uint256,uint256)`, `"${px({ sym: 'TSLA', mark: 358, conf: 2.5, ts: Date.now(), session: 'closed' })}" true 1000000000 5`));
ok('open tx ok', o.status === '0x1');
const pos0 = cast(`call ${PERPS} "positions(uint256)(address,bytes32,bool,uint8,uint128,uint128,int64,uint64,int64)" 0`).split('\n');
console.log('  position 0:', pos0.join(' | '));
ok('entry = 359.25', pos0[6].startsWith('35925000000'));
ok('margin = 1000 - 4 fee', pos0[4].startsWith('996000000'));
ok('free = 9000', cast(`call ${PERPS} "free(address)(uint256)" ${A1}`) === '9000000000');

// mark rallies to 370 → close: exit 370 - 1.25 = 368.75; pnl = 5000 * (368.75-359.25)/359.25 ≈ 132.22
const c = JSON.parse(send(A1, PERPS, `close(uint256,${PX_T})`, `0 "${px({ sym: 'TSLA', mark: 370, conf: 2.5, ts: Date.now(), session: 'open' })}"`));
ok('close tx ok', c.status === '0x1');
const free1 = +cast(`call ${PERPS} "free(address)(uint256)" ${A1}`) / 1e6;
console.log('  free after close', free1);
ok('trader up ≈ +124 net of fees', free1 > 10120 && free1 < 10130);
const pool1 = +cast(`call ${PERPS} "poolBalance()(uint256)"`) / 1e6;
ok('pool paid the pnl and kept fees', pool1 > 499870 && pool1 < 499880);

// short 10x then crash the mark up → liquidatable; anyone liquidates for bounty
send(A1, PERPS, `open(${PX_T},bool,uint256,uint256)`, `"${px({ sym: 'TSLA', mark: 358, conf: 2.5, ts: Date.now(), session: 'closed' })}" false 1000000000 10`);
ok('healthy at 358', cast(`call ${PERPS} "liquidatable(uint256,int64)(bool)" 1 35800000000`) === 'false');
ok('liquidatable at 395', cast(`call ${PERPS} "liquidatable(uint256,int64)(bool)" 1 39500000000`) === 'true');
const l = JSON.parse(send(A0, PERPS, `liquidate(uint256,${PX_T})`, `1 "${px({ sym: 'TSLA', mark: 395, conf: 2.5, ts: Date.now(), session: 'open' })}"`));
ok('liquidate tx ok', l.status === '0x1');
const pos1 = cast(`call ${PERPS} "positions(uint256)(address,bytes32,bool,uint8,uint128,uint128,int64,uint64,int64)" 1`).split('\n');
ok('status = liquidated', pos1[3] === '2');
ok('withdraw works', JSON.parse(send(A1, PERPS, 'withdraw(uint256)', '5000000000')).status === '0x1');
ok('stale price reverts', (() => { try { const p = EVM.signPrice({ sym: 'TSLA', mark: 358, conf: 2.5, ts: Date.now() - 600e3, session: 'closed' }); send(A1, PERPS, `open(${PX_T},bool,uint256,uint256)`, `"(${p.sym32},${p.price},${p.conf},${p.ts},${p.session},${p.r},${p.s})" true 100000000 2`); return false; } catch (e) { return /stale/.test(e.stderr || e.message); } })());
console.log('E2E done. perps=' + PERPS);

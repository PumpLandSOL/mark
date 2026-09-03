# MARK ($MARK) — the 24/7 fair-value oracle for tokenized stocks

Wall Street's tape stops at 4pm. Tokenized stocks on Robinhood Chain don't. MARK keeps marking.

For each of 16 tokenized stocks (SPY, QQQ, NVDA, AAPL, TSLA, MSFT, AMZN, META, GOOGL, HOOD, COIN, MSTR, PLTR, GME, AMD, CRCL) MARK publishes a **mark and a confidence band every 4 seconds, 24/7**, blended as a weighted median from real sources:

- the official tape and extended-hours prints (Yahoo Finance)
- every Robinhood Chain pool for the tokenized stock, weighted by liquidity (DexScreener)
- the xStock of the same name on Solana, which trades 24/7 (Jupiter)
- beta-adjusted ES / NQ futures move since the cash close (β regressed from 3 months of daily returns)
- Pyth, optionally, if you supply a Hermes gateway (`PYTH_HERMES_URL`) — public Hermes is key-gated now

Every mark is **ed25519-signed** (`/api/feed/:SYM/signed`, verify at `/api/verify`). `contracts/MarkOracle.sol` is the on-chain push oracle for Robinhood Chain: staked publishers post the same fixed-point integers, consumers read the median, bad reports get slashed, paid reads accrue $MARK to publishers.

## Run
```
node server/index.js          # http://localhost:8194
```
Dependency-free Node ≥ 18.

## Env
| var | purpose |
|---|---|
| `PORT` | default 8194 |
| `DATA_PATH` | persistence (signer key, history, desk accounts) |
| `MARK_SIGNER_PRIV` | base64 pkcs8 ed25519 key — keeps the signer stable across deploys |
| `MARK_MINT` | $MARK contract; flips `live:true` and the CA bar |
| `MARK_ORACLE` | deployed MarkOracle address |
| `PYTH_HERMES_URL` | optional Pyth gateway |

## Pages
`/` board · `/feed/TSLA` feed detail · `/desk` paper leverage on the mark · `/docs` · `/contracts/MarkOracle.sol`

MARK is price infrastructure: no custody, not investment advice. The Desk is paper.

## Trading · MarkPerps.sol
`contracts/MarkPerps.sol` is the on-chain venue: USDG collateral, one LP pool as counterparty, up to 10×, fills at mark ± conf/2, 8 bp per side, 5% maintenance, liquidator bounty. Every `open` / `close` / `liquidate` carries a `Px` struct signed by the server's secp256k1 key (`/api/feed/:SYM/evm`), verified on-chain with `ecrecover` over `sha256("MARKv1" ‖ sym ‖ price ‖ conf ‖ ts ‖ session)`.

Local proof: `anvil --port 8545` then `node contracts/test/anvil-e2e.js` (deploy → deposit → provide → open → close → liquidate → revert checks).

### Deploy to Robinhood Chain
```
forge build
# signer = the server's EVM address, printed by GET /api/config as evmSigner (persist it with MARK_EVM_KEY)
forge create contracts/MarkPerps.sol:MarkPerps --rpc-url https://rpc.mainnet.chain.robinhood.com --private-key $DEPLOYER \
  --broadcast --constructor-args 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168 $EVM_SIGNER \
  "[$(for s in SPY QQQ NVDA AAPL TSLA MSFT AMZN META GOOGL HOOD COIN MSTR PLTR GME AMD CRCL; do printf '0x%s,' $(printf %s $s | xxd -p | sed 's/$/00000000000000000000000000000000000000000000000000000000000000/' | cut -c1-64); done | sed 's/,$//')]"
```
Then set `MARK_PERPS=<address>` and `MARK_EVM_KEY=<base64 pkcs8 from data.json .evm>` on the server. Seed the pool with `provide()` before opening trading. `/trade` goes live automatically.

| var | purpose |
|---|---|
| `MARK_EVM_KEY` | base64 pkcs8 secp256k1 key — the price signer the contract trusts |
| `MARK_PERPS` | deployed MarkPerps address |
| `USDG_ADDR` | override collateral token (default real USDG) |
| `RH_RPC_URL` | override RPC |

# MARK — X kit

**Handle idea:** @MarkOnRH · **Site:** markonrh.xyz · **Ticker:** $MARK · **Chain:** Robinhood Chain

## Bio (160)
The 24/7 fair-value oracle for tokenized stocks on Robinhood Chain. Wall Street closes at 4pm. The mark doesn't. Signed feeds. Trade the mark. markonrh.xyz

## Pinned tweet
Wall Street closes at 4pm Friday.
TSLA on Robinhood Chain keeps trading all weekend.
Every oracle just… freezes.

MARK doesn't. Pools + xStocks + futures × β + the last print → one signed fair value with a confidence band. Every 4 seconds. 24/7.

Long or short it on-chain.
markonrh.xyz · $MARK
[mark-hype-15s.mp4]

## Launch thread
1/ A 65-hour-old number is not a price. It's a memory.
Tokenized stocks trade every block. Their oracles stop at the close. Meet MARK. [mark-banner.png]

2/ How it works: for each of 16 tokenized stocks, MARK reads the official tape, the extended-hours print, every Robinhood Chain pool weighted by liquidity, the xStock on Solana, and the ES/NQ futures move × the stock's beta. Weighted median. Outliers > 8% rejected and shown. [mark-how.png]

3/ The confidence band is the product. Sources agree and the market's open → a few bps. Quiet Sunday → wider. It tells you how much to trust the number instead of pretending.

4/ Every mark is ed25519-signed. One GET returns the payload, one GET verifies it. On-chain, staked publishers post the same integers to MarkOracle.sol; bad reports get slashed. [feed page screenshot]

5/ And you can trade it. MarkPerps.sol: USDG perps on Robinhood Chain, up to 10×, filled at mark ± half the band. Your order carries a fresh oracle signature the contract verifies. LPs are the counterparty and earn every fee. [mark-demo-15s.mp4]

6/ 16 names day one: SPY QQQ NVDA AAPL TSLA MSFT AMZN META GOOGL HOOD COIN MSTR PLTR GME AMD CRCL. All real tokenized stocks with live Robinhood Chain pools.

7/ $MARK: publishers stake it, on-chain reads pay in it, slashes are paid in it.
Board: markonrh.xyz
Trade: markonrh.xyz/trade
Docs: markonrh.xyz/docs
Code: github.com/PumpLandSOL/mark

## One-liners
- "Mark to market. 24/7."
- "The tape stops. The mark doesn't."
- "Pyth sleeps on weekends. MARK doesn't."
- "Your weekend spread is the oracle's honesty."

## Assets (brand/)
mark-pfp.png 400² · mark-wordmark.png · mark-banner.png 1500×500 · mark-og.png 1200×630 · mark-how.png · mark-vs.png · mark-demo-15s.mp4 · mark-hype-15s.mp4

## CA (Robinhood Chain)
0x84b07a7b30157db59da9a152542fdd1efe068161

# Token Radar — how the model works (radar-3)

A protocol's token, if it launched today, would be priced the way the market
already prices the tokens of protocols like it. So this radar does not invent
a multiple: it measures the market's own, from the sealed snapshot, and prices
every pre-token protocol at its category's multiple, adjusted for its own
figures. No protocol name is special-cased anywhere; the same functions score
every row. The page recomputes each row in `app.js` (`impliedOf`, `rangeOf`)
and checks the number — and the range — against `board.json`.

## The multiple: measured, not chosen

For every live-token protocol, `mcap_usd / tvl_usd` is its market ratio. Each
ratio is winsorised to [0.005, 3] so one outlier cannot move a median. Then:

- `globalMedian` = the median ratio over all live-token protocols.
- For each category, `median` = the median ratio over its live-token
  protocols, and the multiple is shrunk toward the global median by a prior
  of 4 protocols: `(n x median + 4 x globalMedian) / (n + 4)`.
- A category needs at least 3 live peers for its own median to count — a
  median of one or two observations is not a median — so thinner categories,
  and categories with no live peer at all, price at the global median. The
  final multiple is clamped to [0.05, 1.50].

On this snapshot the global median is 0.2138x; Dexs price near 0.31x,
Lending near 0.15x, RWA near 0.26x. The dashboard's model panel lists the
measured multiples with their sample sizes.

## The range: the market's own dispersion

A point estimate that pretends to be exact is a lie the market data does not
support, so every row carries a low and a high. They come from the same
ratios: the category's first and third quartiles, shrunk toward the global
quartiles by the same prior of 4, clamped the same way. The low replaces the
median multiple in the product below; the high does the same. Because the
quartiles are shrunk the same way as the median, low <= implied <= high
always holds. On this snapshot the global quartiles are 0.0468x and 1.0467x —
the market prices similar protocols over a wide band, and a thin category
that falls back to the global quartiles honestly shows that width.

## The five factors

```
implied = round(tvl_usd x categoryMultiple
              x (1 + clamp(change_7d, -50, 300) / 100 x 0.6)
              x (0.70 + min(age_days, 1095) / 1095 x 0.30)
              x (1 + 0.02 x min(chains - 1, 10))
              x (1 + 0.15 x youth x growthPos))
youth     = clamp((365 - age_days) / 365, 0, 1)
growthPos = clamp(change_7d, 0, 100) / 100
```

- **Growth** (0.70x–2.80x): seven-day TVL change, clamped at +300% so one
  wild week cannot dominate — but a protocol that quadrupled in a week is
  no longer priced the same as one that doubled. The weight is 0.6, so a
  fast grower genuinely outranks a stagnant peer of the same size.
- **Maturity** (0.70x–1.00x): days since first listed with no token, capped
  at 3 years. A protocol that ran years without a token is more "mature" for
  a launch than one listed last month. Unknown listing date uses 365 days.
- **Chain spread** (1.00x–1.20x): each extra chain adds 2%, up to 10 extra
  chains. Multi-chain reach is real distribution for a launch.
- **Momentum** (1.00x–1.15x): youth times growth. A protocol under a year
  old that is growing fast gets up to +15%; an old protocol, or one that is
  shrinking, gets nothing. The radar marks rows at 1.05x and above "Hot".

Worked example, the top row (Steakhouse Financial): $2.75B TVL x 0.2138
(Risk Curators has one live peer, so it prices at the global median) x
0.9868 growth x 0.8488 maturity x 1.20 chains x 1.00 momentum =
$591.8M, range $138.4M–$2.90B.

## Who is on the board

The board ranks pre-token protocols only: no market cap, no CoinGecko id,
no symbol on record. It applies the watchlist's own exclusion rule to every
row — no exchange, no bridge / liquid-staking / restaking product, no
wrapped or staked product, no versioned pool — so the early radar cannot
smuggle a wrapped product back in under the floor. All 40 watchlist slugs
are covered; the rest are rankable pre-token protocols below the floor,
ranked by the model's own score, never by raw TVL.

Live-token protocols are kept apart in the "Already launched" tab, shown
with their market caps and their mcap/TVL ratios — the market data the
multiples are measured from. The calibration check runs the same model over
all 128 live-token protocols with a market cap: on this snapshot the median
implied/market-cap ratio is 0.9417, which is what "the model prices the
market about right" looks like. (The tab shows the top 48 by market cap, a
biased slice — prediction markets and old versions sit far from the line —
so the calibration is reported as the median over the whole live set, in
the dashboard's model panel, not per row.)

## Farm plans

Each row's plan is derived from the protocol's own record — category, first
chain, TVL, age — never from a hand-written list. The wallet follows the
chain's family (EVM, Solana, Move, Cosmos, Bitcoin), the core action
follows the category (lend, provide liquidity, stake, mint, bridge, and so
on), the capital follows the TVL tier ($50–$250), the gas follows the chain
(Ethereum ~$12 a transaction, Solana ~$0.05, L2s ~$0.30), the hold follows
the age (30–60 days) and the category (a lender watches its health factor,
a staker plans around unbonding), the claim step names the unwind the
category needs first (repay, close, unstake), and the log names the
protocol, its chains and the capital. Protocols on three or more chains get
an extra step repeating the action on a second chain. Every step states its
cost and its time.

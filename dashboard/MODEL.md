# Token Radar — how the model works (radar-2)

A protocol's token, if it launched today, would be priced the way the market
already prices the tokens of protocols like it. So this radar does not invent
a multiple: it measures the market's own, from the sealed snapshot, and prices
every pre-token protocol at its category's multiple, adjusted for its own
figures. No protocol name is special-cased anywhere; the same functions score
every row. The page recomputes each row in `app.js` (`impliedOf`) and checks
the number against `board.json`.

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

On this snapshot the global median is about 0.21x; Dexs price near 0.31x,
Lending near 0.15x, RWA near 0.26x. The dashboard's model panel lists the
measured multiples with their sample sizes.

## The four factors

```
implied = round(tvl_usd x categoryMultiple
              x (1 + clamp(change_7d, -50, 100) / 100 x 0.5)
              x (0.70 + min(age_days, 1095) / 1095 x 0.30)
              x (1 + 0.02 x min(chains - 1, 10)))
```

- **Growth** (0.75x–1.50x): seven-day TVL change, clamped so one wild week
  cannot dominate. A protocol shrinking 50%+ prices at 0.75x.
- **Maturity** (0.70x–1.00x): days since first listed with no token, capped
  at 3 years. A protocol that ran years without a token is more "mature" for
  a launch than one listed last month. Unknown listing date uses 365 days.
- **Chain spread** (1.00x–1.20x): each extra chain adds 2%, up to 10 extra
  chains. Multi-chain reach is real distribution for a launch.

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
implied/market-cap ratio is near 1, which is what "the model prices the
market about right" looks like. (The tab shows the top 48 by market cap, a
biased slice — prediction markets and old versions sit far from the line —
so the calibration is reported as the median over the whole live set, in
the dashboard's model panel, not per row.)

## Farm plans

Each row's plan is derived from the protocol's own record — category, first
chain, TVL, age — never from a hand-written list. The core action follows
the category (lend, provide liquidity, stake, mint, bridge, and so on), the
capital follows the TVL tier ($50–$250), the gas follows the chain
(Ethereum ~$12 a transaction, Solana ~$0.05, L2s ~$0.30), the hold follows
the age (30–60 days), and protocols on three or more chains get an extra
step repeating the action on a second chain. Every step states its cost and
its time.

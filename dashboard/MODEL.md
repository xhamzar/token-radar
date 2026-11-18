# Token Radar — how the model works (radar-4)

A protocol's token, if it launched today, would be priced the way the market
already prices the tokens of protocols like it. So this radar does not invent
a multiple: it measures the market's own, from the sealed snapshot, and prices
every pre-token protocol by a size curve fitted to the traded tokens, adjusted
by its category's premium, its own figures and its launch odds. No protocol
name is special-cased anywhere; the same functions score every row. The page
recomputes each row in `app.js` (`impliedOf`, `rangeOf`) and checks the number
— and the range — against `board.json`.

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

## The size curve and the launch odds

Size pays off sublinearly: the market does not price ten times the TVL at
ten times the cap. The radar fits `log10(market cap) = a + b x log10(TVL)`
by least squares over the traded tokens — on this snapshot a = 3.02,
b = 0.52, R² = 0.19 — and prices a protocol's TVL on that curve, times its
category premium (its measured multiple divided by the global median,
clamped to [0.25, 3]). The premium keeps the category story: a Basis
protocol prices above the curve, a Risk Curator below it.

The curve says what a launch would be worth; the odds say whether one
happens. Each category's ever-launched rate is its traded share — Risk
Curators 5 of 39 have a token, Dexs 73 of 99 — shrunk toward the global
rate of 0.55 by a prior of 10 protocols, then aged down the longer the
protocol has run with no token (x1.10 at listing, x0.85 at three years),
clamped to [0.05, 0.95]. The implied value is the expected value: the
value if it launches times the odds.

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
implied = round(10 ^ (3.0247 + 0.5223 x log10(tvl_usd))
              x (categoryMultiple / 0.2138, clamped to [0.25, 3])
              x (1 + clamp(change_7d, -50, 300) / 100 x 0.6)
              x (0.70 + min(age_days, 1095) / 1095 x 0.30)
              x (1 + 0.02 x min(chains - 1, 10))
              x (1 + 0.15 x youth x growthPos)
              x launchOdds)
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

Worked example, the top row (BitFi Basis): $23.8M curve x 2.31 premium
(Basis, n=7) x 0.9384 growth x 0.8748 maturity x 1.12 chains x 1.00
momentum = $50.6M if it launches x 0.5692 odds = $28.8M, range
$10.5M–$37.4M.

## Out-of-sample: the test that matters

A model fitted on the traded tokens and judged on the same tokens proves
nothing, so the radar holds tokens out. Leave-one-out over all 128 traded
tokens: median miss x3.58 (44% within 3x), against x5.07 for a flat
multiple. Time split — the 48 newest tokens priced from a fit on the older
half: median miss x2.84 (52% within 3x), against x5.29 flat. Ablation,
leave-one-out: flat x5.07, curve x3.40, curve + premium x3.45, full x3.58.
The factors cost a little leave-one-out accuracy against the bare curve and
stay because the brief prices a protocol's growth and its time with no
token. The printed band holds 43% of held-out caps — a little narrow, as
the curve's R² of 0.19 admits.

## Who is on the board

The board ranks pre-token protocols only: no market cap, no CoinGecko id,
no symbol on record. It applies the watchlist's own exclusion rule to every
row — no exchange, no bridge / liquid-staking / restaking product, no
wrapped or staked product, no versioned pool — so the early radar cannot
smuggle a wrapped product back in under the floor. All 40 watchlist slugs
are covered; the rest are the other rankable pre-token protocols, above the
floor or below it, ranked by the model's own score, never by raw TVL. The
audit counts all 758 protocols: 198 ranked, 416 already trade, 43 bridges,
43 liquid staking, 42 exchanges, 11 versioned, 5 wrapped.

Live-token protocols are kept apart in the "Already launched" tab, shown
with their market caps and their mcap/TVL ratios — the market data the
multiples are measured from. The calibration check runs the same model over
all 128 live-token protocols with a market cap: on this snapshot the median
implied/market-cap ratio is 0.9476, which is what "the model prices the
market about right" looks like. (The tab shows the top 48 by market cap, a
biased slice — prediction markets and old versions sit far from the line —
so the calibration is reported as the median over the whole live set, in
the dashboard's model panel, not per row.)

## Farm plans

Each row's plan is derived from the protocol's own record — category, first
chain, TVL, age — never from a hand-written list. The wallet follows the
chain's family (EVM, Solana, Move, Cosmos, Bitcoin), the core action
follows the category (lend, provide liquidity, stake, mint, bridge, and so
on), the capital follows the TVL tier ($100–$1,000), the gas follows the chain
(Ethereum ~$12 a transaction, Solana ~$0.05, L2s ~$0.30), the hold follows
the age (30–60 days) and the category (a lender watches its health factor,
a staker plans around unbonding), the claim step names the unwind the
category needs first (repay, close, unstake), and the log names the
protocol, its chains and the capital. Protocols on three or more chains get
an extra step repeating the action on a second chain. Every step states its
cost and its time.

Each row is also netted to dollars: the expected airdrop slice (7% of the
implied value, pro-rata to the deposit over TVL) minus the gas the plan
spends, over the hours the plan takes. The verdict follows the break-even
launch odds — the odds at which the drop, if it happens, covers the fees:
FARM at 10% or less, THIN at 33% or less, SKIP beyond that. On this
snapshot 9 rows farm, 23 are thin, 166 skip: most launches do not pay a
small ticket, and the board says so.

# Token Radar — how the model works (radar-5)

A protocol's token, if it launched today, would be priced the way the market
already prices the tokens of protocols like it. So this radar measures the
market's own multiple from the sealed snapshot and prices every pre-token
protocol by a size curve fitted to the traded tokens, adjusted by its
category's premium, its own figures and its launch odds. No protocol name is
special-cased. The page recomputes each row in `app.js` (`impliedOf`,
`rangeOf`) and checks the number — and the range — against `board.json`.

## The multiple: measured, not chosen

For every live-token protocol, `mcap_usd / tvl_usd` is its market ratio,
winsorised to [0.005, 3] so one outlier cannot move a median. Then:

- `globalMedian` = the median ratio over all live-token protocols.
- Each category's multiple is its median ratio shrunk toward the global
  median by a prior of 10 protocols: `(n x median + 10 x globalMedian) /
  (n + 10)`, clamped to [0.05, 1.50].
- A category needs at least 3 live peers for its own median to count, so
  thinner categories price at the global median.

On this snapshot the global median is 0.2138x; Dexs price near 0.28x,
Lending near 0.17x, RWA near 0.24x.

## The size curve and the launch odds

Size pays off sublinearly: the market does not price ten times the TVL at
ten times the cap. The radar fits `log10(market cap) = a + b x log10(TVL)`
by least squares over the comparable launches — the 92 traded tokens that
pass the board's own exclusion rule, so no wrapped, staked, bridged,
exchange or versioned product sets the curve. On this snapshot a = 3.96,
b = 0.39, R² = 0.10 — the fit is loose, and the board says so. A protocol's
TVL is priced on that curve, times its category premium (its measured
multiple divided by the global median, clamped to [0.25, 3]).

The curve says what a launch would be worth; the odds say whether one
happens. Each category's ever-launched rate is its traded share — Risk
Curators 5 of 39 have a token, Dexs 73 of 99 — shrunk toward the global
rate of 0.55 by a prior of 10 protocols, then aged down the longer the
protocol has run with no token (x1.10 at listing, x0.85 at three years),
clamped to [0.05, 0.95]. The implied value is the expected value: the
value if it launches times the odds.

## The range: the market's own dispersion

Every row carries a low and a high from the same ratios: the category's
first and third quartiles, shrunk toward the global quartiles by the same
prior of 10. The low replaces the median multiple in the product; the high
does the same. Because the quartiles are shrunk the same way as the median,
low <= implied <= high always holds. On this snapshot the global quartiles
are 0.0468x and 1.0467x — the market prices similar protocols over a wide
band, and a thin category that falls back to the global quartiles honestly
shows that width.

## The five factors

```
implied = round(10 ^ (3.9578 + 0.3940 x log10(tvl_usd))
              x (categoryMultiple / 0.2138, clamped to [0.25, 3])
              x (1 + clamp(change_7d, -50, 300) / 100 x 0.2)
              x (0.70 + min(age_days, 1095) / 1095 x 0.15)
              x (1 + 0.01 x min(chains - 1, 10))
              x (1 + 0.05 x youth x growthPos)
              x launchOdds)
youth     = clamp((365 - age_days) / 365, 0, 1)
growthPos = clamp(change_7d, 0, 100) / 100
```

The weights are gentle on purpose: the ablation below shows the bare curve
beats the full factor model on held-out tokens, so the factors stay small.

- **Growth** (0.90x–1.60x): seven-day TVL change, clamped at +300%.
- **Maturity** (0.70x–0.85x): days listed with no token, capped at 3 years;
  unknown listing date uses 365 days.
- **Chain spread** (1.00x–1.10x): 1% per extra chain, up to 10.
- **Momentum** (1.00x–1.05x): youth times growth; up to +5% for a young,
  fast-growing protocol.

Worked example, the top row (Bittensor dTAO): $21.7M curve x 1.32 premium
(Dexs, n=11) x 0.9869 growth x 0.7077 maturity x 1.00 chains x 1.00
momentum = $19.9M if it launches x 0.7829 odds = $15.6M, range
$3.7M–$35.6M.

## Out-of-sample: the test that matters

A model fitted on the traded tokens and judged on the same tokens proves
nothing, so the radar holds tokens out. Leave-one-out over the 92 comps:
median miss x3.43 (49% within 3x), against x4.90 for a flat multiple. Time
split — the 35 newest tokens priced from a fit on the older half: median
miss x2.46 (54% within 3x), against x4.52 flat. Ablation, leave-one-out:
flat x4.90, curve x3.27, curve + premium x3.49, full x3.43. The premium
costs a little leave-one-out accuracy and stays
because the category story is the point of the radar. The printed band
holds 51% of held-out caps — still narrow, as the curve's R² of 0.10 admits.

## Rank stability: the bootstrap

A point rank overstates how much the data separates the top rows, so the
radar re-fits itself: 200 bootstrap refits, each resampling the 92 comps
with replacement (seeded, deterministic), re-fitting the curve, re-measuring
the multiples, and re-ranking the board. Every row carries the 10th–90th
percentile of the ranks it took — the top row's range is 1–11, the fifth
row's 3–41. Only 3 of the top 20 stay in the top 20 in at least 80% of the
refits: the top of the board is tightly packed, so the range — not the
point rank — is the honest read.

## Who is on the board

The board ranks pre-token protocols only: no market cap, no CoinGecko id,
no symbol on record. It applies the watchlist's own exclusion rule to every
row — no exchange, no bridge / liquid-staking / restaking product, no
wrapped or staked product, no versioned pool. All 40 watchlist slugs are
covered; the rest are the other rankable pre-token protocols, above the
floor or below it, ranked by the model's own score, never by raw TVL. The
audit counts all 758 protocols: 198 ranked, 416 already trade, 43 bridges,
43 liquid staking, 42 exchanges, 11 versioned, 5 wrapped.

Live-token protocols are kept apart in the "Already launched" tab, shown
with their market caps and mcap/TVL ratios. The calibration check runs the
same model over the 92 comps: the median implied/market-cap ratio is
0.8717, so the model prices the market's own tokens about 13% light —
mildly conservative, reported rather than hidden.

## Farm plans

Each row's plan is derived from the protocol's own record — category, first
chain, TVL, age — never from a hand-written list. The wallet follows the
chain's family, the core action follows the category, the capital follows
the TVL tier ($100–$1,000), the gas follows the chain (Ethereum ~$12,
Solana ~$0.05, L2s ~$0.30), the hold follows the age (30–60 days), the
claim step names the unwind the category needs first, and the log names the
protocol, its chains and the capital. Protocols on three or more chains get
an extra step on a second chain. Every step states its cost and time.

Each row is also netted to dollars: the expected airdrop slice (7% of the
implied value, pro-rata to the deposit over TVL) minus the gas, over the
hours the plan takes. The verdict follows the break-even launch odds: FARM
at 10% or less, THIN at 33% or less, SKIP beyond that. On this snapshot 9
rows farm, 23 are thin, 166 skip: most launches do not pay a small ticket,
and the board says so. The sandbox selectors above the board recompute
every row's economics live at another deposit or drop share.

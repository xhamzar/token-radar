# Token Radar — how the model works (radar-6)

A protocol's token, if it launched today, would be priced the way the
market already prices the tokens of protocols like it. This radar
measures the market's own multiple from the sealed snapshot and prices
every pre-token protocol by a size curve fitted to the traded tokens,
adjusted by its category's premium, its own figures and its launch odds.
The page recomputes each row in `app.js` and checks it against
`board.json`.

## Integrity: the page re-proves the board

Before the board is shown, the page recomputes every row and reports
the result in a strip above the table: rows recomputed, ranks in order,
totals equal to `board.json`, the watchlist fully ranked, the audit
ledger complete, and the program's checksum (`main_checksum`, the first
8 hex of main.ts's SHA-256). A failure shows as a ✗.

## The multiple: measured, not chosen

For every live-token protocol, `mcap_usd / tvl_usd` is its market
ratio, winsorised to [0.005, 3]. Then:

- `globalMedian` = the median ratio over all live-token protocols.
- Each category's multiple is its median ratio shrunk toward the global
  median by a prior of 10: `(n x median + 10 x globalMedian) / (n + 10)`,
  clamped to [0.05, 1.50].
- A category needs at least 3 live peers for its own median to count.

On this snapshot the global median is 0.2138x; Dexs price near 0.28x,
Lending near 0.17x, RWA near 0.24x.

## The size curve and the launch odds

Size pays off sublinearly: ten times the TVL is not ten times the cap.
The radar fits `log10(market cap) = a + b x log10(TVL)` by least squares
over the 92 traded tokens that pass the board's own exclusion rule. On
this snapshot a = 3.96, b = 0.39, R² = 0.10 — the fit is loose, and the
board says so. A protocol's TVL is priced on that curve, times its
category premium (its measured multiple over the global median, clamped
to [0.25, 3]).

The curve says what a launch would be worth; the odds say whether one
happens. Each category's ever-launched rate is its traded share — Dexs
73 of 99, Risk Curators 5 of 39 — shrunk toward the global 0.55 by a
prior of 10, then aged down (x1.10 at listing, x0.85 at three years),
clamped to [0.05, 0.95]. Implied value = value if it launches x odds.

## The range: the market's own dispersion

Every row carries a low and a high from the same ratios: the category's
quartiles, shrunk toward the global quartiles by the same prior of 10,
each replacing the median multiple — so low <= implied <= high always
holds. On this snapshot the global quartiles are 0.0468x and 1.0467x.

## The five factors

```
implied = round(10^(3.9578 + 0.3940 x log10(tvl_usd)) x (multiple / 0.2138, clamped [0.25, 3])
  x growth x maturity x chains x momentum x launchOdds)
growth = 1 + clamp(change_7d, -50, 300)/100 x 0.2; maturity = 0.70 + min(age_days, 1095)/1095 x 0.15
chains = 1 + 0.01 x min(chains - 1, 10); momentum = 1 + 0.05 x youth x growthPos
```

Growth runs 0.90x–1.60x, maturity 0.70x–0.85x, chains 1.00x–1.10x,
momentum 1.00x–1.05x. The weights are gentle on purpose: the ablation
shows the bare curve beats the full factor model on held-out tokens,
so the factors stay small.

## Out-of-sample: the test that matters

A model judged on the tokens it was fitted on proves nothing, so the
radar holds tokens out. Leave-one-out (92 comps): median miss x3.43, 49% within 3x, flat x4.90. Time split (35
newest): x2.46, 54%, flat x4.52. 5-fold, dealt by size: x3.30, 47%,
flat x5.03. Category-blind, each category priced with no peer of its
own: x3.31, 47%, flat x4.49. Four tests, one answer: about x3.3,
where a flat multiple misses by x4.5–5.0. Ablation, leave-one-out:
flat x4.90, curve x3.27, curve + premium x3.49, full x3.43. The
printed band holds 51% of held-out caps — still narrow, as the
curve's R² of 0.10 admits. The launch odds score Brier 0.227 against
0.248 for the base rate (split-half 0.243): the category rates and
the age slope earn their keep, barely.

## Rank stability: the bootstrap

A point rank overstates how much the data separates the top rows, so
the radar re-fits itself: 200 bootstrap refits, each resampling the 92
comps with replacement (seeded), re-fitting the curve, re-measuring
the multiples, and re-ranking. Every row carries the 10th–90th
percentile of its ranks — the top row's 1–11, the fifth's 3–41. Only
3 of the top 20 stay there in at least 80% of refits: the range, not
the point rank, is the honest read.

## Who is on the board

The board ranks pre-token protocols only, under the watchlist's own
exclusion rule — no exchange, no bridge / liquid-staking / restaking
product, no wrapped or staked product, no versioned pool. All 40
watchlist slugs are covered; the rest are the other rankable pre-token
protocols, ranked by the model's own score, never by raw TVL. The
audit counts all 758 protocols: 198 ranked, 416 already trade, 43
bridges, 43 liquid staking, 42 exchanges, 11 versioned, 5 wrapped.
Calibration: the same model over the 92 comps gives median
implied/market-cap 0.8717 — about 13% light, reported rather than
hidden.

## Farm plans

Each row's plan is derived from the protocol's own record — category,
first chain, TVL, age — never from a hand-written list. The wallet
follows the chain's family, the action the category, the capital the
TVL tier ($100–$1,000), the gas the chain (Ethereum ~$12, Solana
~$0.05, L2s ~$0.30), the hold the age (30–60 days). Three or more
chains adds a step on a second chain. Every step states its cost and
time.

Each row is netted twice: the expected slice (7% of implied value,
pro-rata to deposit over TVL) minus gas and forgone yield (4% a year
over the hold), at the implied value and at the low band. The verdict
follows the break-even odds — FARM at 10% or less, THIN at 33% or
less, SKIP beyond — except a row still positive at the low band is
ROBUST whatever its odds. On this snapshot 2 rows are robust, 8 thin,
188 skip: most launches do not pay a small ticket. The detail view
shows a sensitivity matrix (net at 3.5%, 7%, 14% drops x $100, $1K,
$10K deposits); the sandbox selectors recompute live.

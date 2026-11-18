// Token Radar's value model (radar-3): the snapshot's own market prices the
// protocols that have no token yet.
//
// Idea: a protocol's token, if it launched today, would be priced the way the
// market already prices the tokens of protocols like it. So the model first
// measures, from the snapshot itself, what live-token protocols trade at
// relative to their TVL — the median mcap/TVL of each category — and then
// prices every pre-token protocol at its category's multiple, adjusted for
// its own seven-day growth, its age without a token, its chain spread, and
// its momentum: a young protocol growing fast is hotter than an old one
// standing still. No protocol name is ever special-cased: the same functions
// score every row, and every number below is computed from the sealed
// snapshot at run time. Each row also carries an implied range, low to high,
// from the quartiles of its category's market ratios, so the point estimate
// never pretends to be more precise than the market data behind it.
//
//   categoryMultiple(category)
//       = (n x median + PRIOR_STRENGTH x globalMedian) / (n + PRIOR_STRENGTH)
//         where median is the category's median mcap/TVL over live-token
//         protocols, each ratio winsorised to [0.005, 3] first, n is the
//         category's live sample size, and globalMedian is the same median
//         over all live-token protocols. A category needs at least three live
//         peers for its own median to count — a median of one or two
//         observations is not a median — so thinner categories price at the
//         global median. The result is clamped to [MULTIPLE_MIN, MULTIPLE_MAX].
//         The range's quartiles are shrunk the same way, so low <= implied <= high.
//   growthMultiplier   = 1 + clamp(change_7d, -50, 300) / 100 x 0.6
//   maturityMultiplier = 0.70 + min(age_days, 1095) / 1095 x 0.30
//   chainMultiplier    = 1 + 0.02 x min(chains - 1, 10)
//   momentumMultiplier = 1 + 0.15 x youth x growthPos,
//         youth = clamp((365 - age_days) / 365, 0, 1),
//         growthPos = clamp(change_7d, 0, 100) / 100
//   impliedValue       = max(1, round(tvl x cat x growth x maturity x chain x momentum))
//   impliedLow/High    = the same product with the category's shrunk
//         first/third ratio quartile in place of the median multiple
//
// The board ranks pre-token protocols only. A protocol is rankable when it
// records no token (no market cap, no CoinGecko id, no symbol), is not a
// wrapped, staked or bridged product, not an exchange, and not a versioned
// pool — the same exclusion rule the snapshot's own watchlist applies, so the
// early radar cannot smuggle a wrapped product back in under the floor.
// Live-token protocols are kept apart and shown with their market caps; the
// model is also run over them as a calibration check (see calibrateModel),
// which the dashboard reports next to the formula.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  prior_strength: number;
  min_category_sample: number;
  ratio_floor: number;
  ratio_cap: number;
  multiple_min: number;
  multiple_max: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  chain_step: number;
  chain_max_extra: number;
  momentum_strength: number;
  momentum_age_days: number;
  momentum_growth_cap: number;
}

export const MODEL: ModelConstants = {
  prior_strength: 4,
  min_category_sample: 3,
  ratio_floor: 0.005,
  ratio_cap: 3,
  multiple_min: 0.05,
  multiple_max: 1.5,
  growth_weight: 0.6,
  growth_floor: -50,
  growth_cap: 300,
  maturity_floor: 0.7,
  maturity_range: 0.3,
  maturity_days: 1095,
  unknown_age_days: 365,
  chain_step: 0.02,
  chain_max_extra: 10,
  momentum_strength: 0.15,
  momentum_age_days: 365,
  momentum_growth_cap: 100,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-3';

/** How many live-token protocols the Live tab carries, by market cap. */
export const LIVE_ROWS = 48;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  model: {
    category_multiple: number;
    category_sample: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chain_multiplier: number;
    momentum_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with the board's own farm plan. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  category_multiple: number;
  category_sample: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
  momentum_multiplier: number;
  farm_steps: string[];
}

/** A live-token protocol: the market's own value. The model never ranks it. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
}

/** One category's measured multiple: median mcap/TVL, sample size, shrunk multiple, shrunk quartiles. */
export interface CategoryMultiple {
  category: string;
  sample: number;
  median_ratio: number;
  multiple: number;
  quartile_low: number;
  quartile_high: number;
}

/** The calibration check: the model run over live-token protocols. */
export interface Calibration {
  sample: number;
  median_implied_to_mcap: number;
  median_mcap_to_tvl: number;
}

/** Everything the dashboard needs: the board, the live set, the multiples, the model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  watchlist_tvl_usd: number;
  board_implied_total_usd: number;
  median_implied_usd: number;
  global_median_ratio: number;
  global_quartile_low: number;
  global_quartile_high: number;
  multiples: CategoryMultiple[];
  calibration: Calibration;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Clamp `n` into [lo, hi]. */
function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** The median of a non-empty list of numbers; NaN when empty. */
function median(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A quantile of a non-empty list, by linear interpolation on the sorted values; NaN when empty. */
function quantile(values: number[], q: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories the watchlist's own rule keeps out: wrapped, staked, bridged, exchange. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** A wrapped or staked product's name: a whole word wrapped, staked or staking, or an exchange's name first. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_NAMES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Whether a protocol is a wrapped, staked or exchange product rather than a protocol of its own. */
export function isWrappedProduct(p: SnapshotProtocol): boolean {
  return WRAPPED_WORD.test(p.name) || EXCHANGE_NAMES.some((e) => p.name.startsWith(e));
}

/** Whether a protocol is one the board may rank: pre-token, not wrapped/staked/bridged, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && !EXCLUDED_CATEGORIES.has(p.category ?? '') && !VERSIONED.test(p.name) && !isWrappedProduct(p);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** One live-token protocol's market ratio, winsorised so one outlier cannot move a median. A zero market cap is missing data, not a price. */
function marketRatio(p: SnapshotProtocol, model: ModelConstants): number | null {
  if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) return null;
  return clamp(p.mcap_usd / p.tvl_usd, model.ratio_floor, model.ratio_cap);
}

/**
 * The market's multiples, measured from the snapshot: for every category with
 * at least `min_category_sample` live-token protocols, its median mcap/TVL
 * shrunk toward the global median by a prior of `prior_strength` protocols.
 * Thinner categories price at the global median. The first and third
 * quartiles are shrunk the same way, so every category carries the range its
 * rows are priced over. Deterministic: categories sorted by name, ties
 * impossible (medians are computed, not ranked).
 */
export function measureMultiples(snapshot: Snapshot, model: ModelConstants = MODEL): { global: number; globalQ1: number; globalQ3: number; byCategory: Map<string, CategoryMultiple> } {
  const live = snapshot.protocols.filter((p) => !isPreToken(p));
  const allRatios = live.map((p) => marketRatio(p, model)).filter((r): r is number => r !== null);
  // Rounded once, here: the dashboard's recompute reads the same rounded
  // value from data.js, so the page and the board agree to the dollar.
  const global = round4(median(allRatios));
  const globalQ1 = round4(quantile(allRatios, 0.25));
  const globalQ3 = round4(quantile(allRatios, 0.75));
  const byCat = new Map<string, number[]>();
  for (const p of live) {
    const r = marketRatio(p, model);
    if (r === null) continue;
    const key = p.category ?? 'Other';
    const list = byCat.get(key) ?? [];
    list.push(r);
    byCat.set(key, list);
  }
  const byCategory = new Map<string, CategoryMultiple>();
  for (const [category, ratios] of [...byCat.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const med = median(ratios);
    const q1 = quantile(ratios, 0.25);
    const q3 = quantile(ratios, 0.75);
    const shrink = (v: number, g: number): number =>
      ratios.length >= model.min_category_sample
        ? clamp((ratios.length * v + model.prior_strength * g) / (ratios.length + model.prior_strength), model.multiple_min, model.multiple_max)
        : clamp(g, model.multiple_min, model.multiple_max);
    byCategory.set(category, {
      category,
      sample: ratios.length,
      median_ratio: round4(med),
      multiple: round4(shrink(med, global)),
      quartile_low: round4(shrink(q1, globalQ1)),
      quartile_high: round4(shrink(q3, globalQ3)),
    });
  }
  return { global, globalQ1, globalQ3, byCategory };
}

/** The market's measured multiples, as measureMultiples returns them. */
export interface MeasuredMultiples {
  global: number;
  globalQ1: number;
  globalQ3: number;
  byCategory: Map<string, CategoryMultiple>;
}

/** The multiple one protocol prices at: its category's shrunk multiple, else the global median. */
export function categoryMultipleFor(p: SnapshotProtocol, multiples: MeasuredMultiples, model: ModelConstants): { multiple: number; sample: number } {
  const entry = multiples.byCategory.get(p.category ?? 'Other');
  if (entry === undefined) return { multiple: clamp(multiples.global, model.multiple_min, model.multiple_max), sample: 0 };
  // The sample counts only when the category's own median was used; a thin
  // category prices at the global median, so its row shows no live peers.
  return { multiple: entry.multiple, sample: entry.sample >= model.min_category_sample ? entry.sample : 0 };
}

/** The range one protocol prices over: its category's shrunk quartiles, else the global quartiles. */
export function categoryQuartilesFor(p: SnapshotProtocol, multiples: MeasuredMultiples, model: ModelConstants): { low: number; high: number } {
  const entry = multiples.byCategory.get(p.category ?? 'Other');
  if (entry === undefined) {
    return { low: clamp(multiples.globalQ1, model.multiple_min, model.multiple_max), high: clamp(multiples.globalQ3, model.multiple_min, model.multiple_max) };
  }
  return { low: entry.quartile_low, high: entry.quartile_high };
}

/** A protocol's momentum: young and growing fast is hotter than old and flat. */
export function momentumMultiplier(protocol: SnapshotProtocol, age: number | null, model: ModelConstants): number {
  const youth = clamp((model.momentum_age_days - (age ?? model.momentum_age_days)) / model.momentum_age_days, 0, 1);
  const growthPos = clamp(finite(protocol.change_7d, 0), 0, model.momentum_growth_cap) / model.momentum_growth_cap;
  return 1 + model.momentum_strength * youth * growthPos;
}

/** The multipliers and the implied value (with its range) one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  multiples: MeasuredMultiples,
  model: ModelConstants,
): {
  implied: number;
  impliedLow: number;
  impliedHigh: number;
  categoryMultiple: number;
  categorySample: number;
  growthMult: number;
  maturityMult: number;
  chainMult: number;
  momentumMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const { multiple, sample } = categoryMultipleFor(protocol, multiples, model);
  const { low, high } = categoryQuartilesFor(protocol, multiples, model);
  const growthPct = clamp(finite(protocol.change_7d, 0), model.growth_floor, model.growth_cap);
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (clamp(ageForModel, 0, model.maturity_days) / model.maturity_days) * model.maturity_range;
  const chainMult = 1 + model.chain_step * Math.min(Math.max(protocol.chains.length - 1, 0), model.chain_max_extra);
  const momentumMult = momentumMultiplier(protocol, age, model);
  const factors = growthMult * maturityMult * chainMult * momentumMult;
  const implied = Math.max(1, Math.round(protocol.tvl_usd * multiple * factors));
  // The quartiles are shrunk the same way as the median, so low <= multiple
  // <= high before rounding; clamp after rounding so the order survives it.
  const impliedLow = Math.max(1, Math.min(Math.round(protocol.tvl_usd * low * factors), implied));
  const impliedHigh = Math.max(implied, Math.round(protocol.tvl_usd * high * factors));
  return { implied, impliedLow, impliedHigh, categoryMultiple: multiple, categorySample: sample, growthMult, maturityMult, chainMult, momentumMult, age };
}

/**
 * The calibration check: run the same model over every live-token protocol
 * with a market cap and compare what it implies with what the market actually
 * pays. A median ratio near 1 means the model prices the market's own tokens
 * about right; the dashboard reports it beside the formula.
 */
export function calibrateModel(snapshot: Snapshot, multiples: MeasuredMultiples, model: ModelConstants = MODEL): Calibration {
  const ratios: number[] = [];
  for (const p of snapshot.protocols) {
    if (isPreToken(p) || p.mcap_usd === null || p.mcap_usd <= 0) continue;
    const { implied } = impliedValue(p, snapshot.as_of, multiples, model);
    ratios.push(implied / p.mcap_usd);
  }
  return { sample: ratios.length, median_implied_to_mcap: round4(median(ratios)), median_mcap_to_tvl: round4(multiples.global) };
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const multiples = measureMultiples(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug it names, whatever else the board holds.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every rankable pre-token protocol below the watchlist
  // floor. Ranked by the model's own score later, never by raw TVL: a small
  // fast-growing protocol can outrank a large stagnant one.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, multiples, model);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    listed_at: s.p.listed_at,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    implied_low_usd: s.impliedLow,
    implied_high_usd: s.impliedHigh,
    model: {
      category_multiple: round4(s.categoryMultiple),
      category_sample: s.categorySample,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      chain_multiplier: round4(s.chainMult),
      momentum_multiplier: round4(s.momentumMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 597)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The second chain a protocol names, for the multi-chain step. */
function secondChainOf(p: SnapshotProtocol): string | null {
  return p.chains.length > 1 ? p.chains[1]! : null;
}

/** Typical gas for one simple transaction on a chain, in dollars. */
function gasUsd(chain: string): number {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return 12;
  if (c === 'solana' || c === 'sui' || c === 'aptos' || c === 'near' || c.includes('hyperliquid') || c === 'sei' || c === 'injective') return 0.05;
  if (c === 'base' || c === 'polygon' || c === 'arbitrum' || c === 'optimism' || c === 'zksync era' || c === 'blast' || c === 'scroll' || c === 'linea' || c === 'mode') return 0.3;
  if (c === 'bsc' || c === 'avalanche' || c === 'fantom' || c === 'gnosis') return 0.4;
  if (c === 'bitcoin' || c === 'tron') return 1.5;
  return 1;
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 100_000_000) return 150;
  if (p.tvl_usd >= 20_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's core action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral') || c.includes('uncollateralized')) {
    return `Supply $${capital} of USDC to ${name} on ${chain} as a lender, then borrow a small amount against it so both sides of the market count.`;
  }
  if (c.includes('dex') || c.includes('leveraged farm')) {
    return `Provide $${capital} of liquidity to ${name}'s deepest pool on ${chain} and keep the position in range.`;
  }
  if (c.includes('yield aggregator') || c.includes('yield') || c.includes('farm')) {
    return `Deposit $${capital} into ${name}'s highest-TVL vault on ${chain} and leave the shares compounding.`;
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) {
    return `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small hedged position.`;
  }
  if (c.includes('restak') || c.includes('staking')) {
    return `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the receipt token.`;
  }
  if (c.includes('bridge') || c.includes('cross chain')) {
    return `Bridge $${capital} of USDC through ${name} to ${chain} and use the bridged funds inside its app.`;
  }
  if (c.includes('rwa') || c.includes('real world')) {
    return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it in your wallet.`;
  }
  if (c.includes('stable') || c.includes('dual-token')) {
    return `Mint or deposit $${capital} of ${name}'s stable asset on ${chain} and keep the position open.`;
  }
  if (c.includes('prediction')) {
    return `Fund $${capital} on ${name} on ${chain} and take one position in its most liquid market.`;
  }
  if (c.includes('risk curator') || c.includes('curator') || c.includes('allocator') || c.includes('liquidity manager')) {
    return `Deposit $${capital} into a ${name} vault on ${chain} and keep the vault shares in your wallet.`;
  }
  if (c.includes('basis')) {
    return `Deposit $${capital} into ${name}'s basis strategy on ${chain} and keep the position through one funding cycle.`;
  }
  if (c.includes('insurance')) {
    return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  }
  if (c.includes('launchpad')) {
    return `Stake $${capital} in ${name}'s launch pool on ${chain} and join one sale allocation.`;
  }
  if (c.includes('privacy') || c.includes('chain') || c.includes('payments') || c.includes('card')) {
    return `Use ${name} on ${chain} with $${capital} of volume across two or three transactions.`;
  }
  if (c.includes('nft') || c.includes('gaming') || c.includes('ai')) {
    return `Use ${name}'s app on ${chain} with $${capital} of activity and keep any receipt or pass it issues.`;
  }
  if (c.includes('index') || c.includes('token locker') || c.includes('dor')) {
    return `Buy or lock $${capital} through ${name} on ${chain} and hold the receipt.`;
  }
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's weekly qualifying action: what "stay active" means for this protocol. */
function weeklyActionFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'supply or borrow a little more';
  if (c.includes('dex')) return 'make one swap or rebalance the pool position';
  if (c.includes('yield') || c.includes('farm') || c.includes('curator') || c.includes('allocator') || c.includes('liquidity manager')) return 'top up the vault or harvest and re-deposit';
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return 'open or close one small position';
  if (c.includes('restak') || c.includes('staking')) return 'add a little more stake or restake the rewards';
  if (c.includes('bridge') || c.includes('cross chain')) return 'bridge a small amount across';
  if (c.includes('rwa') || c.includes('stable')) return 'mint or redeem a small amount';
  if (c.includes('prediction')) return 'take one new market position';
  if (c.includes('basis')) return 'check the funding rate and adjust the position';
  if (c.includes('insurance')) return 'renew or extend the cover';
  if (c.includes('launchpad')) return 'join one new allocation round';
  return 'make one deposit, swap or vote';
}

/**
 * A protocol's farm plan: six steps (seven when it spans three or more
 * chains), each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a
 * hand-written list of names: the wallet follows the chain's family, the
 * core action and the weekly action follow the category, the capital follows
 * the TVL tier, the gas follows the chain, the hold follows the age and the
 * category, and the claim and log steps name the protocol and its chain.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const second = secondChainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasUsd(chain);
  const gasText = gas >= 1 ? `about $${Math.round(gas)} of gas` : `about $${gas.toFixed(2)} of gas`;
  const steps: FarmStep[] = [
    {
      text: `Use ${walletFor(chain)} that holds only the funds you plan to farm with, and keep its seed phrase offline.`,
      cost: `${gasText} for the first transaction`,
      time: '5 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and ${gasText}`,
      time: '15 minutes to set up',
    },
    {
      text: `Stay active once a week: ${weeklyActionFor(p)} so the wallet is counted in more than one snapshot.`,
      cost: `${gasText} a week`,
      time: '10 minutes a week',
    },
  ];
  if (p.chains.length >= 3 && second !== null) {
    const gas2 = gasUsd(second);
    const gas2Text = gas2 >= 1 ? `about $${Math.round(gas2)} of gas` : `about $${gas2.toFixed(2)} of gas`;
    steps.push({
      text: `Repeat the core action on a second chain, ${second}, with half the capital, so the activity is visible on more than one network.`,
      cost: `$${Math.round(capital / 2)} of capital and ${gas2Text}`,
      time: '15 minutes',
    });
  }
  steps.push(
    {
      text: holdTextFor(p, hold, chain),
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: claimTextFor(p, chain),
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: logTextFor(p, chain, capital),
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  );
  return steps;
}

/** The wallet a chain's family uses: EVM, Solana, Move, Cosmos, Bitcoin and the rest. */
function walletFor(chain: string): string {
  const c = chain.toLowerCase();
  if (c === 'solana') return 'a fresh Solana wallet (Phantom or Backpack)';
  if (c === 'sui' || c === 'aptos' || c === 'movement') return 'a fresh Move wallet (Sui Wallet or Petra)';
  if (c === 'bitcoin') return 'a fresh Bitcoin wallet (Xverse or Unisat)';
  if (c === 'near') return 'a fresh NEAR wallet (MyNearWallet)';
  if (c === 'ton') return 'a fresh TON wallet (Tonkeeper)';
  if (c === 'cosmos' || c === 'osmosis' || c === 'celestia' || c === 'injective' || c === 'sei' || c === 'kava' || c === 'dydx') return 'a fresh Cosmos wallet (Keplr)';
  if (c === 'tron') return 'a fresh Tron wallet (TronLink)';
  if (c === 'starknet') return 'a fresh Starknet wallet (Argent X or Braavos)';
  if (c === 'cardano') return 'a fresh Cardano wallet (Eternl or Nami)';
  if (c.includes('hyperliquid')) return 'a fresh Hyperliquid wallet (an EVM wallet such as MetaMask, connected to Hyperliquid)';
  return 'a fresh EVM wallet (MetaMask or Rabby)';
}

/** The hold step, in the category's own terms: what "hold" means for this protocol. */
function holdTextFor(p: SnapshotProtocol, hold: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const tail = `for at least ${hold} days, so the activity is counted in more than one snapshot.`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral') || c.includes('uncollateralized')) {
    return `Hold the supply-and-borrow position on ${chain} ${tail} Keep the health factor comfortably above the liquidation line the whole time.`;
  }
  if (c.includes('dex') || c.includes('leveraged farm')) {
    return `Hold the ${chain} pool position ${tail} Rebalance only when the price leaves your range.`;
  }
  if (c.includes('yield') || c.includes('farm') || c.includes('curator') || c.includes('allocator') || c.includes('liquidity manager')) {
    return `Leave the vault shares compounding on ${chain} ${tail} Withdrawing early resets the clock on most points systems.`;
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) {
    return `Keep the ${chain} margin account funded ${tail} Trade small enough to survive a bad week.`;
  }
  if (c.includes('restak') || c.includes('staking')) {
    return `Keep the stake locked through ${p.name} on ${chain} ${tail} Unbonding takes time, so plan the exit before you need the funds.`;
  }
  if (c.includes('bridge') || c.includes('cross chain')) {
    return `Keep using ${p.name} on ${chain} ${tail} Bridge in small amounts over time rather than once.`;
  }
  if (c.includes('rwa') || c.includes('real world') || c.includes('stable') || c.includes('dual-token')) {
    return `Hold the ${p.name} asset on ${chain} ${tail} The yield accrues while the position sits.`;
  }
  if (c.includes('prediction')) {
    return `Keep a position open on ${p.name} on ${chain} ${tail} One market at a time is enough.`;
  }
  if (c.includes('basis')) {
    return `Keep the basis position on ${chain} ${tail} Watch the funding rate each week.`;
  }
  if (c.includes('insurance')) {
    return `Keep the ${p.name} cover active on ${chain} ${tail} Letting it lapse breaks the streak.`;
  }
  if (c.includes('launchpad')) {
    return `Keep the ${p.name} launch stake on ${chain} ${tail} New rounds open while you wait.`;
  }
  return `Hold the position on ${chain} ${tail}`;
}

/** The claim step, with the unwind the category needs before the claim. */
function claimTextFor(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const tail = `open the protocol's own points or rewards page and claim only from the link it publishes.`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral') || c.includes('uncollateralized')) {
    return `Before you withdraw from ${p.name}, repay any borrow on ${chain} first, then ${tail}`;
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) {
    return `Before you withdraw from ${p.name}, close open positions on ${chain} first, then ${tail}`;
  }
  if (c.includes('dex') || c.includes('leveraged farm')) {
    return `Before you remove liquidity from ${p.name} on ${chain}, ${tail}`;
  }
  if (c.includes('restak') || c.includes('staking')) {
    return `Before you unstake from ${p.name}, check the unbonding time on ${chain}, then ${tail}`;
  }
  if (c.includes('bridge') || c.includes('cross chain')) {
    return `Before you stop using ${p.name}, ${tail} Bridge activity is often snapshotted separately.`;
  }
  return `Before you withdraw from ${p.name}, ${tail}`;
}

/** The log step, naming the position it records: protocol, chain and capital. */
function logTextFor(p: SnapshotProtocol, chain: string, capital: number): string {
  const chains = p.chains.length > 1 ? `${chain} and ${p.chains.length - 1} more chain${p.chains.length > 2 ? 's' : ''}` : chain;
  return `Write the wallet, the ${p.name} position on ${chains} (about $${capital}), the dates and every transaction hash in a farm log so you can repeat the position or unwind it.`;
}

/** The live-token protocols, by market cap, for the dashboard's Live tab. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd as number,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the board's own farm plan. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    implied_low_usd: row.implied_low_usd,
    implied_high_usd: row.implied_high_usd,
    category_multiple: row.model.category_multiple,
    category_sample: row.model.category_sample,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    chain_multiplier: row.model.chain_multiplier,
    momentum_multiplier: row.model.momentum_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const multiples = measureMultiples(snapshot, model);
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const calibration = calibrateModel(snapshot, multiples, model);
  const index = bySlug(snapshot.protocols);
  const watchlistTvl = snapshot.watchlist.reduce((n, s) => n + (index.get(s)?.tvl_usd ?? 0), 0);
  const impliedValues = board.map((r) => r.implied_value_usd);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    watchlist_tvl_usd: watchlistTvl,
    board_implied_total_usd: impliedValues.reduce((a, b) => a + b, 0),
    median_implied_usd: Math.round(median(impliedValues)),
    global_median_ratio: round4(multiples.global),
    global_quartile_low: round4(multiples.globalQ1),
    global_quartile_high: round4(multiples.globalQ3),
    multiples: [...multiples.byCategory.values()],
    calibration,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100) return `the board holds ${board.length} rows, under the 100 the gate needs`;
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (r.implied_value_usd > 100_000_000_000_000) return `${r.slug} has implied value over the gate's cap`;
    if (!Number.isSafeInteger(r.implied_low_usd) || !Number.isSafeInteger(r.implied_high_usd)) return `${r.slug} has a non-integer implied range`;
    if (r.implied_low_usd < 1 || r.implied_low_usd > r.implied_value_usd || r.implied_value_usd > r.implied_high_usd) {
      return `${r.slug} has an implied range that does not bracket its implied value`;
    }
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}

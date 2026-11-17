// Token Radar, model radar-2.
//
// One sealed snapshot in, one ranked board out. The board ranks only
// protocols that record no token, and it keeps the live-token protocols
// apart: their market cap is a fact, never a model output.
//
// The model — impliedValue() — is a multiple on TVL, and every factor in
// it comes from the snapshot's own figures for that protocol. No protocol
// name is ever special-cased; the same function scores every row.
//
//   implied = round( tvl_usd x 0.22
//     x categoryTilt(category)      // what the protocol earns fees on
//     x growthMult(change_7d)       // 7-day TVL change, clamped, weight 0.7
//     x ageFactor(age_days)         // inverted-U: seasoned, not ancient
//     x breadthFactor(chains)       // how many chains it runs on
//     x sizeFactor(tvl_usd) )       // small protocols get a higher multiple
//
// Why each factor is shaped this way:
// - categoryTilt: a vault, lending market or real-world-asset protocol
//   earns a fee on money it holds, so a token that shared those fees
//   would have something to share. A plain exchange or payment rail
//   earns less per dollar of TVL, so its tilt is lower. The tilt is
//   only +/-12%, so it can never carry a row on its own.
// - growthMult: seven days is one noisy week, so the change is clamped
//   to -50%..+80% and weighted 0.7. A crash still hurts; a spike still
//   helps, but it cannot double the value by itself.
// - ageFactor: a protocol that has run a while with no token has
//   proved it can keep TVL, so its factor rises to 1.10 at about two
//   years. Past that the wait itself is the signal — a launch that
//   has not come in four years is less likely to come — so the factor
//   falls back to 0.90. An unknown listing date is neutral at 0.95.
// - breadthFactor: one chain is a single point of failure (0.92);
//   two or three chains is the normal case (1.00); eight or more is
//   real distribution (1.10).
// - sizeFactor: a $50M protocol has far more room to grow into a
//   token than a $2B one, so the multiple is a little higher at small
//   TVL and a little lower at large TVL, (tvl / 1e8)^-0.05, clamped
//   to 0.85..1.12.
//
// The early radar is every pre-token protocol below the watchlist
// floor that passes the same exclusions the watchlist uses — no
// wrapped, staked or bridged product, no versioned pool, no exchange
// product, no CEX — not a hand-picked top-N. On this snapshot that
// is 138 protocols, so the board is 40 watchlist + 138 early = 178.

/** One protocol as the sealed snapshot carries it: exactly ten fields. */
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

/** The radar-2 constants, as the dashboard states them. */
export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  unknown_age_factor: number;
  breadth_one: number;
  breadth_mid: number;
  breadth_wide: number;
  size_exponent: number;
  size_floor: number;
  size_cap: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.22,
  growth_weight: 0.7,
  growth_floor: -50,
  growth_cap: 80,
  unknown_age_factor: 0.95,
  breadth_one: 0.92,
  breadth_mid: 1.0,
  breadth_wide: 1.1,
  size_exponent: -0.05,
  size_floor: 0.85,
  size_cap: 1.12,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-2';

/** Live-token protocols the dashboard sets aside, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json. */
export interface BoardRow {
  rank: number;
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
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    category_tilt: number;
    growth_pct: number;
    growth_multiplier: number;
    age_factor: number;
    breadth_factor: number;
    size_factor: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  on_watchlist: boolean;
  category_tilt: number;
  growth_multiplier: number;
  age_factor: number;
  breadth_factor: number;
  size_factor: number;
}

/** A live-token protocol: the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  mcap_tvl_ratio: number | null;
}

/** Everything the dashboard needs. */
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
  median_implied_usd: number;
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

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Whole days from `listedAt` to `asOf`, clamped at zero; null when absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The fee-earning tilt for a category: 1.12, 1.00, 0.95 or 0.98. */
export function categoryTilt(category: string | null): number {
  const c = (category ?? '').toLowerCase();
  if (c.includes('risk curat') || c.includes('capital allocator') || c.includes('rwa') || c.includes('lending') || c === 'cdp') return 1.12;
  if (c.includes('dex') || c.includes('yield') || c.includes('derivative') || c.includes('basis trad') || c.includes('leveraged farm')) return 1.0;
  if (c.includes('payment') || c.includes('prediction') || c.includes('index') || c.includes('farm')) return 0.95;
  return 0.98;
}

/**
 * The age factor: an inverted-U over days with no token.
 * Young protocols ramp 0.75 -> 0.95 over their first 180 days, season
 * to 1.10 by day 730, then fade back to 0.95 by day 1460 and 0.90
 * after that. Unknown age is neutral at 0.95.
 */
export function ageFactor(age: number | null): number {
  if (age === null) return MODEL.unknown_age_factor;
  if (age < 180) return 0.75 + (age / 180) * 0.2;
  if (age < 730) return 0.95 + ((age - 180) / 550) * 0.15;
  if (age < 1460) return 1.1 - ((age - 730) / 730) * 0.15;
  return 0.9;
}

/** The breadth factor from how many chains a protocol runs on. */
export function breadthFactor(chainCount: number): number {
  if (chainCount <= 0) return 0.95;
  if (chainCount === 1) return MODEL.breadth_one;
  if (chainCount <= 3) return MODEL.breadth_mid;
  if (chainCount <= 7) return 1.06;
  return MODEL.breadth_wide;
}

/** The size factor: (tvl / 1e8)^-0.05, clamped to 0.85..1.12. */
export function sizeFactor(tvlUsd: number): number {
  const f = Math.pow(Math.max(tvlUsd, 1) / 1e8, MODEL.size_exponent);
  return Math.min(MODEL.size_cap, Math.max(MODEL.size_floor, f));
}

/** Every factor and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
): {
  implied: number;
  tilt: number;
  growthPct: number;
  growthMult: number;
  ageFactorValue: number;
  breadth: number;
  size: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const tilt = categoryTilt(protocol.category);
  const ageF = ageFactor(age);
  const breadth = breadthFactor(protocol.chains.length);
  const size = sizeFactor(protocol.tvl_usd);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * model.base_multiple * tilt * growthMult * ageF * breadth * size));
  return { implied, tilt, growthPct, growthMult, ageFactorValue: ageF, breadth, size, age };
}

/** A name ending in a version marker is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** Categories that are a wrapped, staked or bridged product, not a launch. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
/** Whole words that mark a wrapped or staked product. */
const WRAPPED_WORD = /\bwrapped\b|\bstaked\b|\bstaking\b/i;
/** Exchange names a product name must not start with. */
const EXCHANGES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol may be ranked: pre-token, and passing the same
 * exclusions the watchlist uses — not a bridge / liquid-staking /
 * CEX product, not a versioned pool, not a wrapped or staked product,
 * not an exchange's own product.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGES.some((e) => p.name.startsWith(e))) return false;
  return true;
}

function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // Early radar: every rankable pre-token protocol below the floor.
  // No cap and no hand-picking: the exclusions above do the work.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model);
    return { p, v };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    model: {
      base_multiple: model.base_multiple,
      category_tilt: s.v.tilt,
      growth_pct: s.v.growthPct,
      growth_multiplier: round4(s.v.growthMult),
      age_factor: round4(s.v.ageFactorValue),
      breadth_factor: round4(s.v.breadth),
      size_factor: round4(s.v.size),
      age_days: s.v.age,
    },
    farm_steps: farmSteps(s.p, s.v.age).map(stepText),
  }));
}

/** One step as a single string: action, then cost and time. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** Farm capital by TVL: $75 under $100M, $150 under $1B, $300 above. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 300;
  if (p.tvl_usd >= 100_000_000) return 150;
  return 75;
}

/** Hold days from age: young protocols need a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The main farming action for a category, in words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and leave it supplied.`;
  if (c.includes('dex') || c.includes('leveraged farm')) return `Add $${capital} of liquidity to ${name}'s deepest pool on ${chain} and keep the position in range.`;
  if (c.includes('yield') || c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and hold the vault shares.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position.`;
  if (c.includes('prediction')) return `Fund $${capital} and take one small position in an open market on ${name}.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it for a full month.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds inside its app.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The second qualifying action, different from the first, by category. */
function secondActionFor(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow $20 of a stable asset against the supply on ${name} and repay it the same week.`;
  if (c.includes('dex') || c.includes('leveraged farm')) return `Swap $20 through ${name} on ${chain} so the wallet shows a trade as well as liquidity.`;
  if (c.includes('yield') || c.includes('curator') || c.includes('allocator')) return `Deposit a second, smaller amount into a different ${name} vault on ${chain}.`;
  if (c.includes('staking') || c.includes('restak')) return `Vote or delegate with the receipt token if ${name} offers a vote, and keep the stake.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Close the hedge, then open one fresh small position so the wallet shows two trades.`;
  if (c.includes('prediction')) return `Settle one market and open a second one in a different category on ${name}.`;
  if (c.includes('rwa')) return `Check the asset's monthly yield statement on ${name} and keep the holding.`;
  return `Make one swap or vote inside ${name} on ${chain} so the wallet shows a second kind of activity.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost
 * and a time. Derived from the protocol's own record (category,
 * chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = capital >= 300 ? 8 : capital >= 150 ? 5 : 4;
  return [
    {
      text: 'Use a fresh wallet that holds only the funds you plan to farm, and write its seed phrase on paper, never in a screenshot.',
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about $${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: secondActionFor(p, chain),
      cost: 'about $20 of capital and $2 of gas',
      time: '10 minutes',
    },
    {
      text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote, and never leave the wallet idle for a whole month.',
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: 'Before you withdraw, open the protocol\u2019s own points or rewards page from the link it publishes, and claim only there; never pay a fee to claim and never follow a claim link from a chat or email.',
      cost: 'no fee to check',
      time: '10 minutes',
    },
    {
      text: 'Write the wallet, the dates and every transaction in a farm log, then unwind in two halves a week apart so a single exit does not move the price against you.',
      cost: 'nothing but the log, plus exit gas',
      time: '5 minutes, plus a week to exit',
    },
  ];
}

/** The live-token protocols, by market cap, for the Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      mcap_tvl_ratio: p.mcap_usd !== null && p.tvl_usd > 0 ? Math.round((p.mcap_usd / p.tvl_usd) * 100) / 100 : null,
    }));
}

function radarRow(row: BoardRow, onWatchlist: boolean): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    on_watchlist: onWatchlist,
    category_tilt: row.model.category_tilt,
    growth_multiplier: row.model.growth_multiplier,
    age_factor: row.model.age_factor,
    breadth_factor: row.model.breadth_factor,
    size_factor: row.model.size_factor,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const sortedValues = board.map((r) => r.implied_value_usd).sort((a, b) => a - b);
  const median = sortedValues.length === 0 ? 0 : sortedValues[Math.floor(sortedValues.length / 2)]!;
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
    median_implied_usd: median,
    rows: board.map((r) => radarRow(r, snapshot.watchlist.includes(r.slug))),
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
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
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

/** Why a board is not one the gate will take, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
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
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}

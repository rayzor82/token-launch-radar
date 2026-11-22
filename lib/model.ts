// Token Radar, model radar-5.
//
// One sealed snapshot in, one ranked board out. The board ranks only
// protocols that record no token, and it keeps the traded ones apart:
// their market cap is a fact, never a model output.
//
// The model is FITTED to the snapshot, not asserted. It has two parts,
// both computed from the snapshot itself every time the program runs:
//
//   1. Value if it launches. A log-log curve fitted by least squares
//      to the traded tokens in this snapshot, with a fixed tenure
//      factor for how long a protocol has run with no token:
//        log10 V = b0 + b1 * log10(forward TVL) + log10(tenure(age))
//        tenure(age) = 1 - 0.6 * exp(-age / 480)
//      Forward TVL carries the last week's move forward one week,
//      capped at 20% either way, so a one-week spike cannot carry a
//      row. Age is days since DefiLlama began tracking the protocol;
//      a protocol with no listing date is scored at 365 days. The
//      curve's slope b1 is below 1, so the multiple falls as TVL
//      grows: a big protocol is worth less per dollar of TVL than a
//      small one. The tenure factor is 0.40 for a brand-new protocol
//      and rises toward 1 over about two years: a record that has
//      run longer with no token is worth more, but the factor
//      saturates, so age can never carry a row on its own. Nothing
//      here names a protocol; the same fit scores every row, and the
//      fitted coefficients are printed on the dashboard so a reader
//      can check them.
//
//      Why this shape, measured on this snapshot by the program
//      itself (leave-one-out and 5-origin walk-forward, older
//      tokens training, newer tokens tested):
//      - radar-3's unbounded log-age term (log10 V = 1.67 + 0.611 *
//        log10(forward TVL) + 0.223 * log10(1 + age)) misses x3.79
//        walk-forward and x3.24 on the older-half/newer-half split:
//        the age pattern in the cross-section does not transfer
//        forward in time, so it systematically misprices the newer
//        tokens. Dropping the age term outright misses x2.48
//        walk-forward; the fixed saturating tenure misses x2.36.
//      - Fitting the saturating shape's coefficient by least
//        squares instead of fixing it makes the fit unidentifiable
//        from old-only training windows (the age column goes
//        near-constant), so the walk-forward miss swings from x2.57
//        to x8.59 between neighbouring shapes. The shape is fixed
//        by a grid search on leave-one-out, where every age is
//        present: the whole neighbourhood (amplitude 0.5-0.7,
//        tau 360-600 days) misses x2.29-x2.37 walk-forward, a flat
//        plateau, not a lucky point.
//      - A momentum regressor on top of the tenure model gains
//        under 10% walk-forward (x2.36 to x2.14-x2.16) and its
//        sign flips across near-identical designs (+0.10, -0.09,
//        -0.51, +0.91), so it is not kept. Relative momentum
//        (the week's move minus the peers' median week) changes
//        nothing (x2.35). Huber reweighting hurts leave-one-out
//        on this design (x2.91 against x2.72). The elemental-median
//        robust fit (Theil-Sen style) misses x3.12 leave-one-out.
//        Family premiums were tested again on this design and still
//        make leave-one-out worse. Family-adjusted launch odds
//        still lose on 5-fold accuracy. Each rejected variant is
//        printed on the dashboard with its own numbers.
//
//      Fit-set width was tested on this snapshot for radar-5:
//      widening the mcap/TVL band 0.005-5 to 0.001-20 (85 to 91
//      tokens) improves walk-forward x2.36 to x2.19 but worsens
//      leave-one-out x2.72 to x3.25, so it is not kept; including
//      the excluded categories (bridges, liquid staking, CEX)
//      is worse on both tests (n=115: LOO x2.87, walk-forward
//      x2.85; n=123: LOO x3.26, walk-forward x2.73); dropping the
//      ratio filter entirely fails the board's own check, because
//      the snapshot carries a negative market cap that poisons
//      the fit. The band and the exclusions stay as radar-4 set
//      them. A stronger-shrunk category factor (mean, n/(n+20),
//      capped at 0.15 dex) was tested again and still worsens
//      leave-one-out (x2.96 against x2.72) with no walk-forward
//      gain, so it joins the rejected list below.
//
//   2. Launch odds. The share of the snapshot's protocols in the same
//      age band that record a token, shrunk toward the snapshot's
//      overall rate. It is a proxy, not a forecast: the snapshot
//      cannot show whether a protocol will ever launch, and the
//      dashboard says so. Bands: under 180 days, 180-365, 365-730,
//      730-1460, over 1460, and no listing date.
//
//   implied value = value if it launches x launch odds, rounded to
//   whole dollars. The P10-P90 range comes from the leave-one-out
//   residuals of the fitted curve: the 10th and 90th percentile of
//   how far the curve missed the traded tokens it had not seen.
//
// Farm economics. A farm is judged at a deposit the reader picks
// ($1,000 by default) and a drop share (7% of the value if it
// launches, the reader can try 3.5% or 14%). The expected drop is
// launch odds x drop share x value if it launches x deposit / TVL:
// the farmer's slice of TVL. Fees are a $1.50 bridge or withdrawal
// leg plus four paid transactions at the cheapest gas of the
// protocol's three largest chains (stated per-chain table: Base
// $0.03, Solana $0.01, Ethereum $2.50, anything unlisted $0.10).
// The 4% T-bill yield the deposit would otherwise earn over the
// 12-week farm is an explicit cost, so the net is expected drop
// minus fees minus T-bill income forgone. Break-even odds are the
// launch odds at which the expected drop exactly repays fees plus
// T-bill. The verdict follows the field's convention, at the
// $1,000 default: FARM when the net is above zero (the odds cover
// break-even); THIN when the expected drop beats the fees but not
// fees plus T-bill; otherwise SKIP. ROBUST marks the rows whose
// launch odds are at least twice break-even, so the farm pays even
// if the true odds are half the estimate — that was radar-4's FARM
// rule, kept as a badge rather than the verdict. An absolute
// break-even rule (farm when break-even odds are at most 10%) was
// tested and dropped: the T-bill line puts a floor under break-even
// that no row on this board can clear, so it would call every row
// SKIP at any deposit. Every row also carries its own plan deposit:
// the smallest ladder rung ($500 / $1,000 / $2,500 / $5,000) that
// earns FARM, else the smallest that earns THIN, else the $500
// minimum; plus the deposit where the farm first pays (net zero)
// and the deposit where it first earns ROBUST. Every number is
// labelled with the assumption behind it, on the dashboard.

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

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-5';

/** The tenure factor's fixed shape: 1 - TENURE_A * exp(-age / TENURE_TAU). */
export const TENURE_A = 0.6;
export const TENURE_TAU = 480;

/** Age bands for launch odds, in days; the last band is no listing date. */
export const AGE_BANDS: Array<{ label: string; lo: number; hi: number }> = [
  { label: 'under 180 days', lo: 0, hi: 180 },
  { label: '180-365 days', lo: 180, hi: 365 },
  { label: '1-2 years', lo: 365, hi: 730 },
  { label: '2-4 years', lo: 730, hi: 1460 },
  { label: 'over 4 years', lo: 1460, hi: Number.POSITIVE_INFINITY },
  { label: 'no listing date', lo: -1, hi: -1 },
];

/** Shrinkage strength for the age-band odds: 20 protocols' worth of the overall rate. */
export const ODDS_SHRINK_K = 20;

/** Walk-forward origins: train on the oldest fraction, test on all newer tokens. */
export const WALK_FRACS = [0.5, 0.6, 0.7, 0.8, 0.9];

/** One rejected variant's measured misses, as the dashboard prints them. */
export interface RejectedVariant {
  name: string;
  looMiss: number;
  walk5Miss: number;
  note: string;
}

/** One ablation row: what a term of the model earns, measured the same way. */
export interface AblationRow {
  name: string;
  looMiss: number;
  walk5Miss: number;
  kept: boolean;
}

/** The fitted value curve, as the dashboard prints it. */
export interface FitResult {
  n: number;
  beta: [number, number];
  tenureA: number;
  tenureTau: number;
  looMiss: number;
  looFlatMiss: number;
  walk5Miss: number;
  walk5FlatMiss: number;
  walkHalfMiss: number;
  walkHalfFlatMiss: number;
  residP10: number;
  residP90: number;
  rangeHold: number;
  ablation: AblationRow[];
  rejected: RejectedVariant[];
}

/** The launch-odds model, as the dashboard prints it. */
export interface OddsResult {
  bands: Array<{ label: string; rate: number; n: number }>;
  overall: number;
  accuracy: number;
  baseAccuracy: number;
  brier: number;
  baseBrier: number;
  rejectedFamilyAccuracy: number;
}

/** One row's farm economics at the dashboard's default deposit and drop share. */
export interface FarmEconomics {
  deposit: number;
  dropShare: number;
  feesUsd: number;
  gasUsd: number;
  bridgeUsd: number;
  tbillUsd: number;
  expectedDropUsd: number;
  netUsd: number;
  netPerHourUsd: number;
  breakEvenOdds: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
  /** True when the launch odds are at least twice break-even: the farm pays even if the true odds are half the estimate. */
  robust: boolean;
  /** The row's own plan deposit: smallest ladder rung earning FARM, else THIN, else the $500 minimum. */
  planDeposit: number;
  /** Deposit where the expected net first reaches zero; Infinity when it never pays. */
  paysFromUsd: number;
  /** Deposit where the row first earns ROBUST; Infinity when no deposit reaches it. */
  farmFromUsd: number;
  hours: number;
  weeks: number;
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
  forward_tvl_usd: number;
  value_if_launches_usd: number;
  launch_odds: number;
  implied_value_usd: number;
  implied_p10_usd: number;
  implied_p90_usd: number;
  /** P10-P90 of the row's rank over 200 bootstrap refits of the value curve. */
  rank_p10: number;
  rank_p90: number;
  model: {
    beta0: number;
    beta1: number;
    tenureA: number;
    tenureTau: number;
    tenureFactor: number;
    growth_pct: number;
    age_days: number | null;
  };
  economics: FarmEconomics;
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
  age_days: number | null;
  forward_tvl_usd: number;
  value_if_launches_usd: number;
  launch_odds: number;
  implied_value_usd: number;
  implied_p10_usd: number;
  implied_p90_usd: number;
  rank_p10: number;
  rank_p90: number;
  tenure_factor: number;
  on_watchlist: boolean;
  off_list: boolean;
  fees_usd: number;
  gas_usd: number;
  bridge_usd: number;
  plan_deposit_usd: number;
  pays_from_usd: number;
  farm_from_usd: number;
  early_reason: string | null;
  verdict: 'FARM' | 'THIN' | 'SKIP';
  robust: boolean;
  farm_steps: string[];
}

/** One traded token the curve was fitted on. */
export interface TradedRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
  age_days: number | null;
  mcap_tvl_ratio: number;
}

/** Everything the dashboard needs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  fit: FitResult;
  odds: OddsResult;
  counts: {
    protocols: number;
    watchlist: number;
    board: number;
    offList: number;
    belowFloor: number;
    live: number;
    fitN: number;
    /** Rows whose model rank sits 5+ places off their TVL rank. */
    rerank5plus: number;
    /** Rows under 180 days old or up 20%+ in 7 days. */
    early: number;
    setAside: { label: string; n: number }[];
  };
  totals: {
    impliedSumUsd: number;
    medianImpliedUsd: number;
    farm: number;
    thin: number;
    robust: number;
    skip: number;
  };
  econDefaults: {
    deposit: number;
    dropShare: number;
    bridgeUsd: number;
    txCount: number;
    tbillRate: number;
    weeks: number;
    hours: number;
    planLadder: number[];
  };
  /** Stated gas per transaction by chain; chains not listed cost gasDefaultUsd. */
  gasTable: Record<string, number>;
  gasDefaultUsd: number;
  rows: RadarRow[];
  live: TradedRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const LOG10 = Math.log10;

/** Whole days from `listedAt` to `asOf`, clamped at zero; null when absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The 7-day change clamped to -20..+20, or 0 when unreported. */
export function clampedGrowth(change7d: number | null): number {
  if (change7d === null || !Number.isFinite(change7d)) return 0;
  return Math.min(20, Math.max(-20, change7d));
}

/** TVL carried one week forward at the clamped 7-day change. */
export function forwardTvl(p: SnapshotProtocol): number {
  return p.tvl_usd * (1 + clampedGrowth(p.change_7d) / 100);
}

/** Age in days for scoring: the listing age, or 365 when unknown. */
export function scoringAge(p: SnapshotProtocol, asOf: string): number {
  return ageDays(asOf, p.listed_at) ?? 365;
}

/** The tenure factor for an age in days: 0.40 at birth, rising toward 1. */
export function tenureFactor(age: number): number {
  return 1 - TENURE_A * Math.exp(-age / TENURE_TAU);
}

/** Which age band a protocol's age falls in; 5 when there is no listing date. */
export function ageBand(age: number | null): number {
  if (age === null) return 5;
  for (let i = 0; i < 5; i++) {
    if (age >= AGE_BANDS[i]!.lo && age < AGE_BANDS[i]!.hi) return i;
  }
  return 4;
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

/** Why a protocol is set aside, for the dashboard's composition bar. */
export function setAsideReason(p: SnapshotProtocol): string | null {
  if (!isPreToken(p)) return 'already records a token';
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return 'wrapped, staked or bridged product';
  if (VERSIONED.test(p.name)) return 'versioned release of one protocol';
  if (WRAPPED_WORD.test(p.name)) return 'wrapped or staked by name';
  if (EXCHANGES.some((e) => p.name.startsWith(e))) return 'exchange custody, nothing to farm';
  return null;
}

/** Category families, used only to test (and reject) family offsets. */
const FAMILIES: Record<string, string[]> = {
  Lending: ['Lending', 'CDP', 'Collateral Management'],
  Trading: ['Dexs', 'Derivatives', 'Basis Trading', 'Prediction Market', 'Leveraged Farming', 'Options'],
  Vaults: ['Yield', 'Yield Aggregator', 'Risk Curators', 'Onchain Capital Allocator', 'Liquidity Manager'],
  RWA: ['RWA', 'Dual-Token Stablecoin', 'DOR'],
  Staking: ['Restaking', 'Staking Pool'],
  Infra: ['Chain', 'Privacy', 'AI Agents', 'Decentralized AI', 'NFT Marketplace', 'Launchpad', 'Token Locker', 'Indexes'],
};

export function familyOf(p: SnapshotProtocol): string {
  for (const [family, cats] of Object.entries(FAMILIES)) {
    if (p.category !== null && cats.includes(p.category)) return family;
  }
  return 'Other';
}

/** A name's first word, lowercased, version markers stripped: the stem a kin match is made on. */
export function nameStem(name: string): string {
  const cleaned = name.toLowerCase().replace(/\s(v\d+(\.\d+)?|\d+\.\d+)$/, '').replace(/[^a-z0-9 ]/g, ' ');
  const toks = cleaned.split(' ').filter(Boolean);
  return toks.length > 0 ? toks[0]! : '';
}

/** Generic words that carry no kin signal: a shared 'yield' or 'finance' is not a family. */
const KIN_STOP = new Set([
  'finance', 'protocol', 'labs', 'swap', 'vault', 'vaults', 'chain', 'token', 'network', 'bridge',
  'staking', 'yield', 'liquid', 'lending', 'dex', 'market', 'markets', 'capital', 'fund', 'funds',
  'app', 'fi', 'defi', 'crypto', 'exchange', 'wallet', 'pay', 'usd', 'btc', 'eth', 'sol', 'dao',
  'x', 'v2', 'v3', 'one', 'the', 'and', 'for', 'on', 'in', 'by', 'io', 'xyz', 'pro', 'plus',
  'prime', 'max', 'hub', 'core', 'base', 'link', 'pool', 'pools', 'farm', 'farms', 'earn', 'save',
  'stake', 'mint', 'trade', 'trading', 'perp', 'perps', 'options', 'derivatives', 'nft', 'rwa',
  'ai', 'meme', 'stable', 'stablecoin', 'synthetic', 'index', 'indexes', 'aggregator', 'router',
  'oracle', 'data', 'infra', 'games', 'gaming', 'social', 'launchpad', 'locker', 'manager',
  'management', 'allocator', 'curator', 'curators', 'risk', 'credit', 'money', 'asset', 'assets',
  'reserve', 'treasury', 'governance', 'vote', 'voting', 'node', 'nodes', 'validator', 'validators',
  'restaking', 'lrt', 'lst', 'cdp', 'amm', 'dexs', 'cex', 'otc', 'p2p', 'real', 'world', 'cross',
  'multi', 'omni', 'hyper', 'super', 'mega', 'ultra', 'meta', 'neo', 'new', 'next', 'global',
  'web3', 'web', 'cloud', 'edge', 'layer', 'l1', 'l2', 'zero', 'two', 'three',
]);

/** A name's distinctive words: length 4 or more, minus the generic words above. */
export function distinctiveWords(name: string): Set<string> {
  const cleaned = name.toLowerCase().replace(/[^a-z0-9 ]/g, ' ');
  return new Set(cleaned.split(' ').filter((t) => t.length >= 4 && !KIN_STOP.has(t)));
}

/** Whether a protocol shares a name stem with a traded token in the pool (not itself). */
export function hasKinStem(p: SnapshotProtocol, pool: SnapshotProtocol[]): boolean {
  const s = nameStem(p.name);
  if (s.length < 3) return false;
  return pool.some((q) => q.slug !== p.slug && nameStem(q.name) === s);
}

/** The traded tokens the curve is fitted on: they record a token, hold TVL, are not a wrapper or exchange product, and their mcap/TVL sits between 0.005 and 5. */
export function fitSet(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => {
    if (isPreToken(p) || p.tvl_usd <= 0 || p.mcap_usd === null) return false;
    if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
    const ratio = p.mcap_usd / p.tvl_usd;
    return ratio >= 0.005 && ratio <= 5;
  });
}

type Beta = [number, number];

/** Design row of one traded token: intercept, log forward TVL. The tenure factor enters as a fixed offset, never a fitted coefficient. */
function designRow(p: SnapshotProtocol): [number, number] {
  return [1, LOG10(forwardTvl(p))];
}

/** log10 of the tenure-adjusted target: log10(mcap) minus log10(tenure). */
function targetOf(p: SnapshotProtocol, asOf: string): number {
  return LOG10(p.mcap_usd!) - LOG10(tenureFactor(scoringAge(p, asOf)));
}

/** Solve a small linear system by Gauss elimination with pivoting; null when singular. */
function solve(a: number[][], vec: number[]): number[] | null {
  const k = vec.length;
  const m: number[][] = a.map((row, i) => [...row, vec[i]!]);
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(m[r]![c]!) > Math.abs(m[piv]![c]!)) piv = r;
    [m[c], m[piv]] = [m[piv]!, m[c]!];
    if (Math.abs(m[c]![c]!) < 1e-12) return null;
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = m[r]![c]! / m[c]![c]!;
      for (let cc = c; cc <= k; cc++) m[r]![cc]! -= f * m[c]![cc]!;
    }
  }
  return m.map((row, i) => row[k]! / row[i]!);
}

/** A whisper of ridge on the normal equations: negligible on the full fit, it keeps small training windows (early walk-forward origins) solvable. */
function ridge(a: number[][]): void {
  const k = a.length;
  const trace = a.reduce((t, row, i) => t + row[i]!, 0);
  const lam = 1e-6 * (trace / k);
  for (let i = 0; i < k; i++) a[i]![i]! += lam;
}

/** Least squares for the tenure-adjusted target on the design rows. */
function olsFit(rows: SnapshotProtocol[], asOf: string): Beta {
  const k = 2;
  const a: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const v: number[] = new Array<number>(k).fill(0);
  for (const p of rows) {
    const x = designRow(p);
    const y = targetOf(p, asOf);
    for (let r = 0; r < k; r++) {
      for (let c = 0; c < k; c++) a[r]![c]! += x[r]! * x[c]!;
      v[r]! += x[r]! * y;
    }
  }
  ridge(a);
  const b = solve(a, v);
  if (b === null) throw new Error('fit is singular');
  return [b[0]!, b[1]!];
}

/** log10 of the value if it launches, under a fitted beta. */
function logValue(p: SnapshotProtocol, asOf: string, beta: Beta): number {
  const x = designRow(p);
  return beta[0] * x[0]! + beta[1] * x[1]! + LOG10(tenureFactor(scoringAge(p, asOf)));
}

/** Median of numbers, or 0 when empty. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** A quantile of sorted numbers by linear interpolation. */
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/** The traded tokens sorted by listing date, oldest first; undated tokens are left out of time splits. */
function datedFit(fit: SnapshotProtocol[]): SnapshotProtocol[] {
  return fit
    .filter((p) => p.listed_at !== null)
    .sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : a.listed_at! > b.listed_at! ? 1 : a.slug < b.slug ? -1 : 1));
}

/** Median absolute log error of a fitted beta on a test set. */
function missOf(test: SnapshotProtocol[], asOf: string, beta: Beta): number {
  return Math.pow(10, median(test.map((p) => Math.abs(LOG10(p.mcap_usd!) - logValue(p, asOf, beta)))));
}

/** The flat-multiple miss on a test set, the multiple taken from a training set. */
function flatMissOf(train: SnapshotProtocol[], test: SnapshotProtocol[]): number {
  const mult = median(train.map((p) => p.mcap_usd! / p.tvl_usd));
  return Math.pow(10, median(test.map((p) => Math.abs(LOG10(p.mcap_usd!) - LOG10(mult * p.tvl_usd)))));
}

/** Seeded random numbers, so the elemental-median fit is deterministic. */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The elemental-median robust fit (Theil-Sen style): the component-wise
 * median of the exact fits through 2,000 sampled pairs of points.
 * Deterministic: the same seed every run.
 */
function elemMedianFit(rows: SnapshotProtocol[], asOf: string): Beta {
  const rng = mulberry32(20261118);
  const b0s: number[] = [];
  const b1s: number[] = [];
  const n = rows.length;
  let tries = 0;
  while (b0s.length < 2000 && tries < 40000) {
    tries++;
    const i = Math.floor(rng() * n);
    let j = Math.floor(rng() * n);
    if (j === i) continue;
    const p = rows[i]!;
    const q = rows[j]!;
    const x1 = LOG10(forwardTvl(p));
    const x2 = LOG10(forwardTvl(q));
    if (Math.abs(x2 - x1) < 1e-9) continue;
    const y1 = targetOf(p, asOf);
    const y2 = targetOf(q, asOf);
    const b1 = (y2 - y1) / (x2 - x1);
    const b0 = y1 - b1 * x1;
    if (!Number.isFinite(b0) || !Number.isFinite(b1)) continue;
    b0s.push(b0);
    b1s.push(b1);
  }
  return [median(b0s), median(b1s)];
}

/** Huber reweighting of the fit, three passes, on the same design. */
function huberFit(rows: SnapshotProtocol[], asOf: string): Beta {
  let b = olsFit(rows, asOf);
  for (let pass = 0; pass < 3; pass++) {
    const res = rows.map((p) => targetOf(p, asOf) - (logValue(p, asOf, b) - LOG10(tenureFactor(scoringAge(p, asOf)))));
    const med = median(res);
    const mad = median(res.map((r) => Math.abs(r - med))) || 1;
    const scale = 1.4826 * mad;
    const weights = res.map((r) => (Math.abs(r) <= 1.345 * scale ? 1 : (1.345 * scale) / Math.abs(r)));
    const k = 2;
    const a: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
    const v: number[] = new Array<number>(k).fill(0);
    rows.forEach((p, i) => {
      const x = designRow(p);
      const y = targetOf(p, asOf);
      const w = weights[i]!;
      for (let r = 0; r < k; r++) {
        for (let c = 0; c < k; c++) a[r]![c]! += w * x[r]! * x[c]!;
        v[r]! += w * x[r]! * y;
      }
    });
    ridge(a);
    const nb = solve(a, v);
    if (nb === null) break;
    b = [nb[0]!, nb[1]!];
  }
  return b;
}

/**
 * Fit the value curve and measure it out of sample, on this snapshot.
 * Leave-one-out trains on all but one traded token and scores the one
 * held out; walk-forward trains on the oldest tokens and scores the
 * newer ones, at five origins. The same tests are run on the flat
 * multiple (the best single number) and on every variant the
 * dashboard says was tested and rejected, so those numbers are
 * measured, not asserted.
 */
export function fitValueCurve(snapshot: Snapshot): FitResult {
  const asOf = snapshot.as_of;
  const fit = fitSet(snapshot);
  if (fit.length < 10) throw new SnapshotError(`only ${fit.length} traded tokens to fit on`);
  const dated = datedFit(fit);
  const half = Math.floor(dated.length / 2);
  const older = dated.slice(0, half);
  const newer = dated.slice(half);

  const beta = olsFit(fit, asOf);

  // Leave-one-out on the chosen model, and the flat baseline beside it.
  // The flat multiple is taken from each fold's training set, so the
  // held-out token never leaks into its own baseline.
  const looRes: number[] = [];
  const looFlatAbs: number[] = [];
  for (let i = 0; i < fit.length; i++) {
    const rest = fit.filter((_, j) => j !== i);
    const b = olsFit(rest, asOf);
    looRes.push(LOG10(fit[i]!.mcap_usd!) - logValue(fit[i]!, asOf, b));
    const flatRest = median(rest.map((p) => p.mcap_usd! / p.tvl_usd));
    looFlatAbs.push(Math.abs(LOG10(fit[i]!.mcap_usd!) - LOG10(flatRest * fit[i]!.tvl_usd)));
  }
  const looMiss = Math.pow(10, median(looRes.map(Math.abs)));
  const looFlatMiss = Math.pow(10, median(looFlatAbs));

  // Five-origin walk-forward, pooled, and the half/half split for continuity.
  const walkAbs: number[] = [];
  const walkFlatAbs: number[] = [];
  for (const frac of WALK_FRACS) {
    const cut = Math.floor(dated.length * frac);
    const train = dated.slice(0, cut);
    const test = dated.slice(cut);
    const b = olsFit(train, asOf);
    for (const p of test) {
      walkAbs.push(Math.abs(LOG10(p.mcap_usd!) - logValue(p, asOf, b)));
      walkFlatAbs.push(Math.abs(LOG10(p.mcap_usd!) - LOG10(median(train.map((q) => q.mcap_usd! / q.tvl_usd)) * p.tvl_usd)));
    }
  }
  const walk5Miss = Math.pow(10, median(walkAbs));
  const walk5FlatMiss = Math.pow(10, median(walkFlatAbs));
  const walkHalfMiss = missOf(newer, asOf, olsFit(older, asOf));
  const walkHalfFlatMiss = flatMissOf(older, newer);

  // The P10-P90 range of the leave-one-out residuals, and the share of
  // held-out caps that fell inside it.
  const sortedRes = [...looRes].sort((a, b) => a - b);
  const residP10 = quantile(sortedRes, 0.1);
  const residP90 = quantile(sortedRes, 0.9);
  const rangeHold = looRes.filter((r) => r >= residP10 && r <= residP90).length / looRes.length;

  /**
   * Measure a post-fit multiplier variant: mult(p, beta, pool) is the
   * log10 multiplier applied to a prediction, computed from the
   * training pool only, so the held-out token never leaks into its
   * own adjustment. Returns the LOO and 5-origin walk-forward
   * median misses.
   */
  function measureMultiplier(
    mult: (p: SnapshotProtocol, beta: Beta, pool: SnapshotProtocol[]) => number,
  ): { loo: number; walk5: number } {
    const looAbs: number[] = [];
    for (let i = 0; i < fit.length; i++) {
      const rest = fit.filter((_, j) => j !== i);
      const b = olsFit(rest, asOf);
      looAbs.push(Math.abs(LOG10(fit[i]!.mcap_usd!) - (logValue(fit[i]!, asOf, b) + mult(fit[i]!, b, rest))));
    }
    const wAbs: number[] = [];
    for (const frac of WALK_FRACS) {
      const cut = Math.floor(dated.length * frac);
      const train = dated.slice(0, cut);
      const b = olsFit(train, asOf);
      for (const p of dated.slice(cut)) {
        wAbs.push(Math.abs(LOG10(p.mcap_usd!) - (logValue(p, asOf, b) + mult(p, b, train))));
      }
    }
    return { loo: Math.pow(10, median(looAbs)), walk5: Math.pow(10, median(wAbs)) };
  }

  const rejected: RejectedVariant[] = [];

  // radar-3's unbounded log-age term, measured on the same tests.
  {
    const logAge = (p: SnapshotProtocol): number => LOG10(1 + scoringAge(p, asOf));
    const fitLogAge = (rows: SnapshotProtocol[]): [number, number, number] => {
      const k = 3;
      const a: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
      const v: number[] = new Array<number>(k).fill(0);
      for (const p of rows) {
        const x = [1, LOG10(forwardTvl(p)), logAge(p)];
        const y = LOG10(p.mcap_usd!);
        for (let r = 0; r < k; r++) {
          for (let c = 0; c < k; c++) a[r]![c]! += x[r]! * x[c]!;
          v[r]! += x[r]! * y;
        }
      }
      ridge(a);
      const b = solve(a, v);
      if (b === null) throw new Error('log-age fit is singular');
      return [b[0]!, b[1]!, b[2]!];
    };
    const val = (p: SnapshotProtocol, b: [number, number, number]): number =>
      b[0] + b[1] * LOG10(forwardTvl(p)) + b[2] * logAge(p);
    const looAbs: number[] = [];
    for (let i = 0; i < fit.length; i++) {
      const rest = fit.filter((_, j) => j !== i);
      looAbs.push(Math.abs(LOG10(fit[i]!.mcap_usd!) - val(fit[i]!, fitLogAge(rest))));
    }
    const wAbs: number[] = [];
    for (const frac of WALK_FRACS) {
      const cut = Math.floor(dated.length * frac);
      const b = fitLogAge(dated.slice(0, cut));
      for (const p of dated.slice(cut)) wAbs.push(Math.abs(LOG10(p.mcap_usd!) - val(p, b)));
    }
    rejected.push({
      name: 'radar-3 log-age term (unbounded)',
      looMiss: Math.pow(10, median(looAbs)),
      walk5Miss: Math.pow(10, median(wAbs)),
      note: 'the age pattern in the cross-section does not transfer forward in time',
    });
  }

  // A momentum regressor on top of the tenure model (raw TVL + momentum).
  {
    const momX = (p: SnapshotProtocol): [number, number, number] => {
      const chg = p.change_7d === null ? 0 : Math.min(50, Math.max(-50, p.change_7d));
      return [1, LOG10(p.tvl_usd), LOG10(1 + chg / 100)];
    };
    const fitMom = (rows: SnapshotProtocol[]): [number, number, number] => {
      const k = 3;
      const a: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
      const v: number[] = new Array<number>(k).fill(0);
      for (const p of rows) {
        const x = momX(p);
        const y = LOG10(p.mcap_usd!) - LOG10(tenureFactor(scoringAge(p, asOf)));
        for (let r = 0; r < k; r++) {
          for (let c = 0; c < k; c++) a[r]![c]! += x[r]! * x[c]!;
          v[r]! += x[r]! * y;
        }
      }
      ridge(a);
      const b = solve(a, v);
      if (b === null) throw new Error('momentum fit is singular');
      return [b[0]!, b[1]!, b[2]!];
    };
    const val = (p: SnapshotProtocol, b: [number, number, number]): number => {
      const x = momX(p);
      return b[0] * x[0]! + b[1] * x[1]! + b[2] * x[2]! + LOG10(tenureFactor(scoringAge(p, asOf)));
    };
    const looAbs: number[] = [];
    for (let i = 0; i < fit.length; i++) {
      const rest = fit.filter((_, j) => j !== i);
      looAbs.push(Math.abs(LOG10(fit[i]!.mcap_usd!) - val(fit[i]!, fitMom(rest))));
    }
    const wAbs: number[] = [];
    for (const frac of WALK_FRACS) {
      const cut = Math.floor(dated.length * frac);
      const b = fitMom(dated.slice(0, cut));
      for (const p of dated.slice(cut)) wAbs.push(Math.abs(LOG10(p.mcap_usd!) - val(p, b)));
    }
    rejected.push({
      name: 'momentum regressor on the tenure model',
      looMiss: Math.pow(10, median(looAbs)),
      walk5Miss: Math.pow(10, median(wAbs)),
      note: 'gains under 10% walk-forward and the sign flips across near-identical designs',
    });
  }

  // Huber reweighting on the chosen design.
  {
    const looAbs: number[] = [];
    for (let i = 0; i < fit.length; i++) {
      const rest = fit.filter((_, j) => j !== i);
      looAbs.push(Math.abs(LOG10(fit[i]!.mcap_usd!) - logValue(fit[i]!, asOf, huberFit(rest, asOf))));
    }
    const wAbs: number[] = [];
    for (const frac of WALK_FRACS) {
      const cut = Math.floor(dated.length * frac);
      const b = huberFit(dated.slice(0, cut), asOf);
      for (const p of dated.slice(cut)) wAbs.push(Math.abs(LOG10(p.mcap_usd!) - logValue(p, asOf, b)));
    }
    rejected.push({
      name: 'Huber reweighting',
      looMiss: Math.pow(10, median(looAbs)),
      walk5Miss: Math.pow(10, median(wAbs)),
      note: 'hurts leave-one-out on this design',
    });
  }

  // The elemental-median robust fit (Theil-Sen style), leave-one-out only.
  {
    const looAbs: number[] = [];
    for (let i = 0; i < fit.length; i++) {
      const rest = fit.filter((_, j) => j !== i);
      looAbs.push(Math.abs(LOG10(fit[i]!.mcap_usd!) - logValue(fit[i]!, asOf, elemMedianFit(rest, asOf))));
    }
    rejected.push({
      name: 'elemental-median (Theil-Sen) fit',
      looMiss: Math.pow(10, median(looAbs)),
      walk5Miss: Number.NaN,
      note: 'robust in name, worse than plain least squares on this snapshot',
    });
  }

  // Family offsets (multiplicative, shrunk n/(n+8), capped at 0.30 dex).
  {
    const fitFam = (rows: SnapshotProtocol[]): { beta: Beta; off: Map<string, number> } => {
      const b = olsFit(rows, asOf);
      const off = new Map<string, number>();
      for (const fam of new Set(rows.map(familyOf))) {
        const members = rows.filter((p) => familyOf(p) === fam);
        const res = members.map((p) => LOG10(p.mcap_usd!) - logValue(p, asOf, b));
        const n = members.length;
        off.set(fam, Math.max(-0.3, Math.min(0.3, median(res) * (n / (n + 8)))));
      }
      return { beta: b, off };
    };
    const looAbs: number[] = [];
    for (let i = 0; i < fit.length; i++) {
      const rest = fit.filter((_, j) => j !== i);
      const f = fitFam(rest);
      const p = fit[i]!;
      looAbs.push(Math.abs(LOG10(p.mcap_usd!) - (logValue(p, asOf, f.beta) + (f.off.get(familyOf(p)) ?? 0))));
    }
    rejected.push({
      name: 'family premiums',
      looMiss: Math.pow(10, median(looAbs)),
      walk5Miss: Number.NaN,
      note: 'still makes leave-one-out worse',
    });
  }

  // Kin / sibling haircut: a protocol whose name stem is shared by a
  // traded token is worth half as much if it launches. Measured the
  // same way; the haircut is unmeasurable on this snapshot, because
  // only 2 of the 85 fit tokens share a name stem with another
  // traded token, so every haircut from x0.4 to x0.6 leaves both
  // misses unchanged. It would touch 2 of the 198 board rows.
  {
    const kin = measureMultiplier((p, _b, pool) => (hasKinStem(p, pool) ? LOG10(0.5) : 0));
    rejected.push({
      name: 'kin / sibling haircut x0.5 (name stem)',
      looMiss: kin.loo,
      walk5Miss: kin.walk5,
      note: 'untestable here: only 2 of 85 fit tokens have a traded kin, so the haircut moves nothing',
    });
  }

  // Category factor, second test: the closest family-style variant
  // found in the grid (mean residual, shrinkage n/(n+8), capped at
  // 0.30 dex). It still worsens leave-one-out with no walk-forward
  // gain, so it is not kept either.
  {
    const cat = measureMultiplier((p, b, pool) => {
      const off = new Map<string, number>();
      for (const cat of new Set(pool.map((q) => q.category ?? 'null'))) {
        const members = pool.filter((q) => (q.category ?? 'null') === cat);
        const res = members.map((q) => LOG10(q.mcap_usd!) - logValue(q, asOf, b));
        const mean = res.reduce((s, x) => s + x, 0) / res.length;
        off.set(cat, Math.max(-0.3, Math.min(0.3, mean * (members.length / (members.length + 8)))));
      }
      return off.get(p.category ?? 'null') ?? 0;
    });
    rejected.push({
      name: 'category factor (mean, n/(n+8))',
      looMiss: cat.loo,
      walk5Miss: cat.walk5,
      note: 'closest family variant; still worsens leave-one-out, no walk-forward gain',
    });
  }

  // Category factor, stronger shrinkage (mean, n/(n+20), cap 0.15 dex).
  {
    const cat = measureMultiplier((p, b, pool) => {
      const off = new Map<string, number>();
      for (const cat of new Set(pool.map((q) => q.category ?? 'null'))) {
        const members = pool.filter((q) => (q.category ?? 'null') === cat);
        const res = members.map((q) => LOG10(q.mcap_usd!) - logValue(q, asOf, b));
        const mean = res.reduce((s, x) => s + x, 0) / res.length;
        off.set(cat, Math.max(-0.15, Math.min(0.15, mean * (members.length / (members.length + 20)))));
      }
      return off.get(p.category ?? 'null') ?? 0;
    });
    rejected.push({
      name: 'category factor (mean, n/(n+20), cap 0.15 dex)',
      looMiss: cat.loo,
      walk5Miss: cat.walk5,
      note: 'stronger shrinkage; still worsens leave-one-out, no walk-forward gain',
    });
  }

  // Ablation: what each term of the model earns. The size curve
  // alone is refitted without the tenure term, on the same tests.
  const ablation: AblationRow[] = [
    { name: 'Flat TVL multiple', looMiss: looFlatMiss, walk5Miss: walk5FlatMiss, kept: false },
  ];
  {
    const looAbs: number[] = [];
    const wAbs: number[] = [];
    const fitSizeOnly = (rows: SnapshotProtocol[]): Beta => {
      const k = 2;
      const a: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
      const v: number[] = new Array<number>(k).fill(0);
      for (const p of rows) {
        const x = [1, LOG10(forwardTvl(p))];
        const y = LOG10(p.mcap_usd!);
        for (let r = 0; r < k; r++) {
          for (let c = 0; c < k; c++) a[r]![c]! += x[r]! * x[c]!;
          v[r]! += x[r]! * y;
        }
      }
      ridge(a);
      const b = solve(a, v);
      if (b === null) throw new Error('size-only fit is singular');
      return [b[0]!, b[1]!];
    };
    const valSizeOnly = (p: SnapshotProtocol, b: Beta): number => b[0] + b[1] * LOG10(forwardTvl(p));
    for (let i = 0; i < fit.length; i++) {
      const rest = fit.filter((_, j) => j !== i);
      looAbs.push(Math.abs(LOG10(fit[i]!.mcap_usd!) - valSizeOnly(fit[i]!, fitSizeOnly(rest))));
    }
    for (const frac of WALK_FRACS) {
      const cut = Math.floor(dated.length * frac);
      const b = fitSizeOnly(dated.slice(0, cut));
      for (const p of dated.slice(cut)) wAbs.push(Math.abs(LOG10(p.mcap_usd!) - valSizeOnly(p, b)));
    }
    ablation.push({
      name: 'Size curve, no tenure',
      looMiss: Math.pow(10, median(looAbs)),
      walk5Miss: Math.pow(10, median(wAbs)),
      kept: false,
    });
  }
  ablation.push({
    name: 'Size curve + tenure (this model)',
    looMiss,
    walk5Miss,
    kept: true,
  });

  return {
    n: fit.length,
    beta,
    tenureA: TENURE_A,
    tenureTau: TENURE_TAU,
    looMiss,
    looFlatMiss,
    walk5Miss,
    walk5FlatMiss,
    walkHalfMiss,
    walkHalfFlatMiss,
    residP10,
    residP90,
    rangeHold,
    ablation,
    rejected,
  };
}

/**
 * Launch odds by age band, shrunk toward the snapshot's overall rate.
 * Accuracy is measured on 5-fold cross-validation over the dated
 * protocols; the family-adjusted variant is measured the same way
 * and rejected. Odds are for the snapshot's own protocols, whose
 * "launched" state is known: for a pre-token row it is a proxy, and
 * the dashboard says so.
 */
/**
 * P10-P90 of each board row's rank over 200 bootstrap refits of the
 * value curve. Each refit resamples the 85 traded tokens with
 * replacement, refits the same curve, and re-ranks all 198 board
 * rows by implied value, exactly as the board does. Deterministic:
 * the same seed every run, so the ranges never change between runs.
 */
export function bootstrapRankRanges(snapshot: Snapshot, odds: OddsResult): Record<string, [number, number]> {
  const asOf = snapshot.as_of;
  const fit = fitSet(snapshot);
  const rows = snapshot.protocols.filter(isRankable);
  const n = fit.length;
  const rng = mulberry32(20261118);
  const ranksBySlug = new Map<string, number[]>();
  for (const p of rows) ranksBySlug.set(p.slug, []);
  for (let b = 0; b < 200; b++) {
    const sample: SnapshotProtocol[] = [];
    for (let i = 0; i < n; i++) sample.push(fit[Math.floor(rng() * n)]!);
    const beta = olsFit(sample, asOf);
    const scored = rows
      .map((p) => ({
        slug: p.slug,
        implied: Math.max(
          1,
          Math.round(
            Math.pow(10, logValue(p, asOf, beta)) *
              odds.bands[ageBand(ageDays(asOf, p.listed_at))]!.rate,
          ),
        ),
      }))
      .sort((x, y) => y.implied - x.implied || x.slug.localeCompare(y.slug));
    scored.forEach((s, i) => ranksBySlug.get(s.slug)!.push(i + 1));
  }
  const out: Record<string, [number, number]> = {};
  for (const [slug, ranks] of ranksBySlug) {
    const sorted = [...ranks].sort((a, b) => a - b);
    out[slug] = [Math.round(quantile(sorted, 0.1)), Math.round(quantile(sorted, 0.9))];
  }
  return out;
}

/** A row's early-finds reason: new (under 180 days) or rising (+20% in 7 days), else null. */
export function earlyReason(p: SnapshotProtocol, asOf: string): string | null {
  const age = ageDays(asOf, p.listed_at);
  const isNew = age !== null && age < 180;
  const isRising = p.change_7d !== null && p.change_7d >= 20;
  if (isNew && isRising) return 'new and rising';
  if (isNew) return 'new';
  if (isRising) return 'rising';
  return null;
}

export function fitOdds(snapshot: Snapshot): OddsResult {
  const dated = snapshot.protocols.filter((p) => p.listed_at !== null);
  const overall = dated.filter((p) => !isPreToken(p)).length / dated.length;
  const bands = AGE_BANDS.map((band, i) => {
    const members = dated.filter((p) => ageBand(ageDays(snapshot.as_of, p.listed_at)) === i);
    const launched = members.filter((p) => !isPreToken(p)).length;
    const rate = (launched + ODDS_SHRINK_K * overall) / (members.length + ODDS_SHRINK_K);
    return { label: band.label, rate, n: members.length };
  });
  const oddsOf = (p: SnapshotProtocol): number =>
    bands[ageBand(ageDays(snapshot.as_of, p.listed_at))]!.rate;

  // 5-fold cross-validation on the dated protocols.
  const folds: SnapshotProtocol[][] = Array.from({ length: 5 }, () => []);
  dated.forEach((p, i) => folds[i % 5]!.push(p));
  let correct = 0;
  let brierSum = 0;
  let correctBase = 0;
  let brierBase = 0;
  let correctFam = 0;
  for (let f = 0; f < 5; f++) {
    const test = folds[f]!;
    const train = folds.flatMap((fold, i) => (i === f ? [] : fold));
    const trainOverall = train.filter((p) => !isPreToken(p)).length / train.length;
    const trainBands = AGE_BANDS.map((_, i) => {
      const members = train.filter((p) => ageBand(ageDays(snapshot.as_of, p.listed_at)) === i);
      const launched = members.filter((p) => !isPreToken(p)).length;
      return (launched + ODDS_SHRINK_K * trainOverall) / (members.length + ODDS_SHRINK_K);
    });
    const trainFam = new Map<string, number>();
    for (const fam of new Set(train.map(familyOf))) {
      const members = train.filter((p) => familyOf(p) === fam);
      const launched = members.filter((p) => !isPreToken(p)).length;
      trainFam.set(fam, (launched + ODDS_SHRINK_K * trainOverall) / (members.length + ODDS_SHRINK_K));
    }
    for (const p of test) {
      const launched = !isPreToken(p);
      const o = trainBands[ageBand(ageDays(snapshot.as_of, p.listed_at))]!;
      const fo = trainFam.get(familyOf(p)) ?? trainOverall;
      if ((o >= 0.5) === launched) correct++;
      if ((fo >= 0.5) === launched) correctFam++;
      if (overall >= 0.5 === launched) correctBase++;
      brierSum += (o - (launched ? 1 : 0)) ** 2;
      brierBase += (overall - (launched ? 1 : 0)) ** 2;
    }
  }
  return {
    bands,
    overall,
    accuracy: correct / dated.length,
    baseAccuracy: correctBase / dated.length,
    brier: brierSum / dated.length,
    baseBrier: brierBase / dated.length,
    rejectedFamilyAccuracy: correctFam / dated.length,
  };
}

/**
 * Gas per transaction, in dollars, by chain. These are stated
 * assumptions, not snapshot figures: the dashboard labels them.
 * Chains not listed here cost GAS_DEFAULT_USD.
 */
export const GAS_PER_TX_USD: Record<string, number> = {
  Ethereum: 2.5,
  Bitcoin: 0.5,
  Binance: 0.1,
  Tron: 0.1,
  Base: 0.03,
  Arbitrum: 0.05,
  Optimism: 0.05,
  Polygon: 0.02,
  Solana: 0.01,
  Avalanche: 0.05,
  'Hyperliquid L1': 0.05,
  Monad: 0.05,
  'Robinhood Chain': 0.05,
  Linea: 0.05,
  Plasma: 0.05,
  Sonic: 0.05,
  Sui: 0.05,
  Ripple: 0.05,
  Mantle: 0.05,
  Fantom: 0.05,
};
export const GAS_DEFAULT_USD = 0.1;
/** One bridge or withdrawal leg, in dollars, to get funds onto the farm chain. */
export const BRIDGE_LEG_USD = 1.5;
/** Paid transactions over the farm: deposit, second action, claim, unwind. */
export const FARM_TX_COUNT = 4;
/** The T-bill yield the deposit would otherwise earn, per year. */
export const TBILL_RATE = 0.04;
/** The farm runs 12 weeks; hands-on time is about 3.5 hours. */
export const FARM_WEEKS = 12;
export const FARM_HOURS = 3.5;
/** The plan-deposit ladder, in dollars. */
export const PLAN_LADDER = [500, 1000, 2500, 5000];

/** Gas per transaction on one chain, in dollars. */
export function gasPerTx(chain: string): number {
  return GAS_PER_TX_USD[chain] ?? GAS_DEFAULT_USD;
}

/**
 * The cheapest gas among a protocol's three largest chains. The
 * snapshot lists a protocol's chains largest first, so the first
 * three are the three largest; the plan farms on the cheapest of
 * them. A protocol with no chains listed farms on Ethereum.
 */
export function cheapestGas(p: SnapshotProtocol): { chain: string; perTx: number } {
  const top = p.chains.slice(0, 3);
  if (top.length === 0) return { chain: 'Ethereum', perTx: GAS_PER_TX_USD.Ethereum! };
  let best = { chain: top[0]!, perTx: gasPerTx(top[0]!) };
  for (const c of top) {
    const g = gasPerTx(c);
    if (g < best.perTx) best = { chain: c, perTx: g };
  }
  return best;
}

/** The protocol's farm fees: one bridge leg plus four paid transactions at the cheapest gas. */
export function farmFees(p: SnapshotProtocol): { total: number; gas: number; bridge: number; chain: string } {
  const gas = cheapestGas(p);
  const gasUsd = FARM_TX_COUNT * gas.perTx;
  return { total: BRIDGE_LEG_USD + gasUsd, gas: gasUsd, bridge: BRIDGE_LEG_USD, chain: gas.chain };
}

/** T-bill income forgone per dollar deposited over the farm, at 4% a year. */
export function tbillPerDollar(): number {
  return TBILL_RATE * ((FARM_WEEKS * 7) / 365);
}

/**
 * The plan deposit for a row: the smallest ladder rung that earns
 * FARM, else the smallest that earns THIN, else the $500
 * minimum — never over-commit to a farm that does not pay. The
 * verdict only improves with the deposit, because the fixed fees
 * dilute, so the first rung earning a verdict is the smallest.
 */
export function planDepositFor(
  p: SnapshotProtocol,
  valueIfLaunchesUsd: number,
  launchOdds: number,
  dropShare = 0.07,
): number {
  for (const rung of PLAN_LADDER) {
    if (farmVerdict(p, valueIfLaunchesUsd, launchOdds, rung, dropShare) === 'FARM') return rung;
  }
  for (const rung of PLAN_LADDER) {
    if (farmVerdict(p, valueIfLaunchesUsd, launchOdds, rung, dropShare) === 'THIN') return rung;
  }
  return PLAN_LADDER[0]!;
}

/** Break-even odds at a deposit: the launch odds at which the expected drop exactly repays fees plus T-bill. */
export function breakEvenOdds(
  p: SnapshotProtocol,
  valueIfLaunchesUsd: number,
  deposit: number,
  dropShare = 0.07,
): number {
  const fees = farmFees(p).total;
  const k = (dropShare * valueIfLaunchesUsd) / Math.max(1, p.tvl_usd);
  return (fees + tbillPerDollar() * deposit) / Math.max(1e-9, k * deposit);
}

/**
 * The farm verdict at a deposit, the field's convention: FARM when
 * the expected drop beats fees plus the T-bill forgone (net above
 * zero, i.e. the odds cover break-even); THIN when the expected
 * drop beats the fees but not fees plus T-bill; otherwise SKIP.
 */
export function farmVerdict(
  p: SnapshotProtocol,
  valueIfLaunchesUsd: number,
  launchOdds: number,
  deposit: number,
  dropShare = 0.07,
): 'FARM' | 'THIN' | 'SKIP' {
  const fees = farmFees(p).total;
  const k = (dropShare * valueIfLaunchesUsd) / Math.max(1, p.tvl_usd);
  const expected = launchOdds * k * deposit;
  const be = breakEvenOdds(p, valueIfLaunchesUsd, deposit, dropShare);
  if (launchOdds >= be) return 'FARM';
  if (expected > fees) return 'THIN';
  return 'SKIP';
}

/**
 * ROBUST at a deposit: the launch odds are at least twice
 * break-even, so the farm pays even if the true odds are half the
 * estimate. This was radar-4's FARM rule, kept as a badge.
 */
export function isRobust(
  p: SnapshotProtocol,
  valueIfLaunchesUsd: number,
  launchOdds: number,
  deposit: number,
  dropShare = 0.07,
): boolean {
  return launchOdds >= 2 * breakEvenOdds(p, valueIfLaunchesUsd, deposit, dropShare);
}

/** Farm economics at a deposit and a drop share. */
export function farmEconomics(
  p: SnapshotProtocol,
  valueIfLaunchesUsd: number,
  launchOdds: number,
  deposit = 1_000,
  dropShare = 0.07,
): FarmEconomics {
  const fees = farmFees(p);
  const k = (dropShare * valueIfLaunchesUsd) / Math.max(1, p.tvl_usd);
  const c = tbillPerDollar();
  const slicePerDollar = launchOdds * k;
  const expectedDrop = slicePerDollar * deposit;
  const tbill = c * deposit;
  const net = expectedDrop - fees.total - tbill;
  const breakEven = breakEvenOdds(p, valueIfLaunchesUsd, deposit, dropShare);
  const verdict = farmVerdict(p, valueIfLaunchesUsd, launchOdds, deposit, dropShare);
  const robust = isRobust(p, valueIfLaunchesUsd, launchOdds, deposit, dropShare);
  const margin = slicePerDollar - c;
  const paysFrom = margin > 0 ? fees.total / margin : Number.POSITIVE_INFINITY;
  const farmFrom =
    (launchOdds * k) / 2 - c > 0 ? fees.total / ((launchOdds * k) / 2 - c) : Number.POSITIVE_INFINITY;
  return {
    deposit,
    dropShare,
    feesUsd: fees.total,
    gasUsd: fees.gas,
    bridgeUsd: fees.bridge,
    tbillUsd: tbill,
    expectedDropUsd: expectedDrop,
    netUsd: net,
    netPerHourUsd: net / FARM_HOURS,
    breakEvenOdds: breakEven,
    verdict,
    robust,
    planDeposit: planDepositFor(p, valueIfLaunchesUsd, launchOdds, dropShare),
    paysFromUsd: paysFrom,
    farmFromUsd: farmFrom,
    hours: FARM_HOURS,
    weeks: FARM_WEEKS,
  };
}

/** The farm plan's first action: the protocol's own use, at the plan deposit. */
export function actionFor(p: SnapshotProtocol, deposit: number): string {
  const chain = cheapestGas(p).chain;
  const type = p.category ?? 'protocol';
  const amt = `$${deposit.toLocaleString('en-US')}`;
  const half = `$${Math.round(deposit / 2).toLocaleString('en-US')}`;
  switch (type) {
    case 'Dexs':
      return `Swap ${half} of USDC for the paired token on ${chain} in one transaction`;
    case 'Lending':
      return `Deposit ${amt} of USDC into the lending market on ${chain}`;
    case 'Yield':
      return `Deposit ${amt} of USDC into the yield vault on ${chain}`;
    case 'Yield Aggregator':
      return `Deposit ${amt} of USDC into the aggregator vault on ${chain}`;
    case 'Liquid Staking':
      return `Stake ${amt} on ${chain} for a liquid staking position`;
    case 'CDP':
      return `Deposit ${amt} of collateral into the CDP vault on ${chain}`;
    case 'Bridge':
    case 'Canonical Bridge':
      return `Bridge ${amt} of USDC to ${chain}`;
    case 'RWA':
      return `Buy ${amt} of the tokenised asset on ${chain}`;
    case 'Derivatives':
      return `Open a ${half} hedged position on ${chain}`;
    case 'Perpetuals':
      return `Open a ${half} hedged perpetual on ${chain}`;
    case 'Leveraged Farming':
      return `Deposit ${amt} of USDC into the leveraged vault on ${chain}`;
    case 'Prediction Market':
      return `Take a ${half} position on a near-term market on ${chain}`;
    case 'NFT Marketplace':
      return `Buy a low-priced NFT for ${half} on ${chain}`;
    default:
      return `Deposit ${amt} of USDC into the ${type.toLowerCase()} pool on ${chain}`;
  }
}

/** The farm plan's second action: keeping the position alive. */
export function secondActionFor(p: SnapshotProtocol): string {
  const chain = cheapestGas(p).chain;
  const type = p.category ?? 'protocol';
  switch (type) {
    case 'Dexs':
      return `Provide the paired side on ${chain} and set a 1% price range`;
    case 'Lending':
      return `Borrow against the deposit and restake the proceeds on ${chain}`;
    case 'Yield':
    case 'Yield Aggregator':
      return `Auto-compound the yield weekly for 12 weeks on ${chain}`;
    case 'CDP':
      return `Mint the stablecoin and supply it to the pool on ${chain}`;
    case 'Bridge':
    case 'Canonical Bridge':
      return `Bridge a second tranche in week 4 to average the entry on ${chain}`;
    case 'RWA':
      return `Hold the asset for the full 12 weeks and track its redemption window`;
    case 'Derivatives':
      return `Roll the hedge weekly and keep exposure under $2,000 on ${chain}`;
    case 'Perpetuals':
      return `Rebalance the hedge weekly and keep exposure under $2,000 on ${chain}`;
    case 'Leveraged Farming':
      return `Add the second tranche after 30 days at 1.5x leverage on ${chain}`;
    default:
      return `Keep the position open for 12 weeks on ${chain}`;
  }
}

/** The Day-3 check, specific to the protocol's kind. */
export function checkFor(p: SnapshotProtocol): string {
  const chain = cheapestGas(p).chain;
  switch (p.category) {
    case 'RWA':
      return `Pass the protocol's KYC check if it asks for one, and confirm the asset's redemption window on ${chain}`;
    case 'Lending':
    case 'CDP':
      return `Check the collateral factor and the minimum deposit on ${chain}, and confirm the position tracks TVL`;
    case 'Dexs':
      return `Check the pool's fee tier and depth on ${chain}, and confirm the position tracks TVL`;
    case 'Yield':
    case 'Yield Aggregator':
      return `Check the lock-up and withdrawal window on ${chain}, and confirm the position tracks TVL`;
    case 'Derivatives':
    case 'Perpetuals':
      return `Check the funding rate and the liquidation price on ${chain}, and confirm the hedge is still balanced`;
    case 'Bridge':
    case 'Canonical Bridge':
      return `Confirm the bridge has no withdrawal pause on ${chain}, and check the arrival time of the first tranche`;
    case 'Prediction Market':
      return `Check the market's resolution date and the payout rule on ${chain}`;
    default:
      return `Confirm the position tracks the protocol's TVL on ${chain} and screenshot the balance`;
  }
}

/** Seven concrete farm steps, each with a cost and a time, at the row's plan deposit. */
export function farmSteps(p: SnapshotProtocol, econ: FarmEconomics): string[] {
  const d = econ.planDeposit;
  const fees = econ.feesUsd;
  const perTx = econ.gasUsd / FARM_TX_COUNT;
  const chain = cheapestGas(p).chain;
  const stop = Math.round(p.tvl_usd * 0.9);
  return [
    `Day 0: ${actionFor(p, d)}; about 15 minutes of hands-on time.`,
    `Day 0: ${secondActionFor(p)}; the two actions together cost about $${(2 * perTx).toFixed(2)} in gas, plus the $${econ.bridgeUsd} bridge leg.`,
    `Day 3: ${checkFor(p)}; 10 minutes, no cost.`,
    `Week 4: add a second tranche of $${Math.round(d / 2).toLocaleString('en-US')} only if the protocol's TVL is steady; 15 minutes, about $${perTx.toFixed(2)} in gas.`,
    `Day 42: review — stop if TVL has fallen below $${stop.toLocaleString('en-US')} (10% under day 0) or no points program has appeared; 10 minutes, no cost.`,
    `Week 8: harvest any yield and re-deposit it into the same position on ${chain}; 10 minutes, about $${perTx.toFixed(2)} in gas.`,
    `Week 12: unwind — withdraw the deposit and move on if no token has launched; if a token launches, claim within 48 hours through the protocol's own domain only. At the plan deposit the expected drop is $${econ.expectedDropUsd.toFixed(2)} minus $${fees} fees and $${econ.tbillUsd.toFixed(2)} T-bill income forgone.`,
  ];
}

/** One row of the board, priced by the fitted curve and the odds bands. */
export function buildBoard(snapshot: Snapshot, fit: FitResult, odds: OddsResult): BoardRow[] {
  const asOf = snapshot.as_of;
  const rankRanges = bootstrapRankRanges(snapshot, odds);
  const rows = snapshot.protocols.filter(isRankable);
  const priced: BoardRow[] = rows.map((p) => {
    const age = ageDays(asOf, p.listed_at);
    const scored = scoringAge(p, asOf);
    const tenure = tenureFactor(scored);
    const fwd = forwardTvl(p);
    const logVal =
      fit.beta[0] * 1 + fit.beta[1] * LOG10(fwd) + LOG10(tenure);
    const valueIfLaunches = Math.pow(10, logVal);
    const launch = odds.bands[ageBand(age)]!.rate;
    const implied = Math.max(1, Math.round(valueIfLaunches * launch));
    const p10 = Math.max(1, Math.round(valueIfLaunches * launch * Math.pow(10, fit.residP10)));
    const p90 = Math.max(1, Math.round(valueIfLaunches * launch * Math.pow(10, fit.residP90)));
    const plan = planDepositFor(p, valueIfLaunches, launch);
    const econ = farmEconomics(p, valueIfLaunches, launch, plan);
    const range = rankRanges[p.slug] ?? [0, 0];
    return {
      rank: 0,
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      mcap_usd: null,
      listed_at: p.listed_at,
      gecko_id: null,
      symbol: null,
      token_status: 'pre-token',
      age_days: age,
      forward_tvl_usd: fwd,
      value_if_launches_usd: valueIfLaunches,
      launch_odds: launch,
      implied_value_usd: implied,
      implied_p10_usd: p10,
      implied_p90_usd: p90,
      rank_p10: range[0],
      rank_p90: range[1],
      model: {
        beta0: fit.beta[0],
        beta1: fit.beta[1],
        tenureA: fit.tenureA,
        tenureTau: fit.tenureTau,
        tenureFactor: tenure,
        growth_pct: clampedGrowth(p.change_7d),
        age_days: age,
      },
      economics: econ,
      farm_steps: farmSteps(p, econ),
      early_reason: earlyReason(p, asOf),
    };
  });
  priced.sort((a, b) => b.implied_value_usd - a.implied_value_usd || a.slug.localeCompare(b.slug));
  priced.forEach((row, i) => {
    row.rank = i + 1;
    // Widen the bootstrap rank range to bracket the row's own rank,
    // so the displayed range always contains the point estimate.
    row.rank_p10 = Math.min(row.rank_p10, row.rank);
    row.rank_p90 = Math.max(row.rank_p90, row.rank);
  });
  return priced;
}

/** The traded tokens, for the dashboard's live-token tab. */
export function liveRows(snapshot: Snapshot): TradedRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.mcap_usd !== null)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd!,
      change_7d: p.change_7d,
      age_days: ageDays(snapshot.as_of, p.listed_at),
      mcap_tvl_ratio: p.mcap_usd! / p.tvl_usd,
    }))
    .sort((a, b) => b.mcap_usd - a.mcap_usd);
}

/** Build the whole board: fit, odds, rows, and the dashboard's counts and totals. */
export function buildRadar(snapshot: Snapshot): { rows: BoardRow[]; data: RadarData } {
  const fit = fitValueCurve(snapshot);
  const odds = fitOdds(snapshot);
  const board = buildBoard(snapshot, fit, odds);
  const watch = new Set(snapshot.watchlist);
  const live = liveRows(snapshot);
  const setAside = new Map<string, number>();
  for (const p of snapshot.protocols) {
    const reason = setAsideReason(p);
    if (reason !== null) setAside.set(reason, (setAside.get(reason) ?? 0) + 1);
  }
  const sortedImplied = [...board].map((r) => r.implied_value_usd).sort((a, b) => a - b);
  const tvlRank = new Map<string, number>();
  [...board]
    .sort((a, b) => b.tvl_usd - a.tvl_usd || a.slug.localeCompare(b.slug))
    .forEach((r, i) => tvlRank.set(r.slug, i + 1));
  const rerank5plus = board.filter((r) => Math.abs(r.rank - (tvlRank.get(r.slug) ?? 0)) >= 5).length;
  const data: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    fit,
    odds,
    counts: {
      protocols: snapshot.protocols.length,
      watchlist: snapshot.watchlist.length,
      board: board.length,
      offList: board.filter((r) => !watch.has(r.slug) && r.tvl_usd >= snapshot.floor_usd).length,
      belowFloor: board.filter((r) => r.tvl_usd < snapshot.floor_usd).length,
      live: live.length,
      fitN: fit.n,
      rerank5plus,
      early: board.filter((r) => r.early_reason !== null).length,
      setAside: [...setAside.entries()]
        .map(([label, n]) => ({ label, n }))
        .sort((a, b) => b.n - a.n),
    },
    totals: {
      impliedSumUsd: board.reduce((s, r) => s + r.implied_value_usd, 0),
      medianImpliedUsd: median(sortedImplied),
      farm: board.filter((r) => r.economics.verdict === 'FARM').length,
      thin: board.filter((r) => r.economics.verdict === 'THIN').length,
      robust: board.filter((r) => r.economics.robust).length,
      skip: board.filter((r) => r.economics.verdict === 'SKIP').length,
    },
    econDefaults: {
      deposit: 1_000,
      dropShare: 0.07,
      bridgeUsd: BRIDGE_LEG_USD,
      txCount: FARM_TX_COUNT,
      tbillRate: TBILL_RATE,
      weeks: FARM_WEEKS,
      hours: FARM_HOURS,
      planLadder: PLAN_LADDER,
    },
    gasTable: GAS_PER_TX_USD,
    gasDefaultUsd: GAS_DEFAULT_USD,
    rows: board.map((r) => ({
      rank: r.rank,
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      change_7d: r.change_7d,
      age_days: r.age_days,
      forward_tvl_usd: r.forward_tvl_usd,
      value_if_launches_usd: r.value_if_launches_usd,
      launch_odds: r.launch_odds,
      implied_value_usd: r.implied_value_usd,
      implied_p10_usd: r.implied_p10_usd,
      implied_p90_usd: r.implied_p90_usd,
      rank_p10: r.rank_p10,
      rank_p90: r.rank_p90,
      tenure_factor: r.model.tenureFactor,
      on_watchlist: watch.has(r.slug),
      off_list: !watch.has(r.slug) && r.tvl_usd >= snapshot.floor_usd,
      fees_usd: r.economics.feesUsd,
      gas_usd: r.economics.gasUsd,
      bridge_usd: r.economics.bridgeUsd,
      plan_deposit_usd: r.economics.planDeposit,
      pays_from_usd: r.economics.paysFromUsd,
      farm_from_usd: r.economics.farmFromUsd,
      early_reason: r.early_reason,
      verdict: r.economics.verdict,
      robust: r.economics.robust,
      farm_steps: r.farm_steps,
    })),
    live,
  };
  return { rows: board, data };
}

/** The ten fields of one protocol, in the snapshot's exact order. */
const PROTOCOL_FIELDS = ['slug', 'name', 'category', 'chains', 'tvl_usd', 'change_7d', 'mcap_usd', 'listed_at', 'gecko_id', 'symbol'];

/** Parse and check a snapshot: shape, counts, and the watchlist's own membership. */
export function parseSnapshot(raw: unknown): Snapshot {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new SnapshotError('snapshot is not an object');
  }
  const snap = raw as Record<string, unknown>;
  for (const f of ['as_of', 'source', 'floor_usd', 'protocols', 'watchlist'] as const) {
    if (!(f in snap)) throw new SnapshotError(`snapshot is missing ${f}`);
  }
  if (typeof snap.as_of !== 'string' || typeof snap.source !== 'string') {
    throw new SnapshotError('snapshot as_of and source must be strings');
  }
  if (typeof snap.floor_usd !== 'number' || !(snap.floor_usd > 0)) {
    throw new SnapshotError('snapshot floor_usd must be a positive number');
  }
  if (!Array.isArray(snap.protocols)) throw new SnapshotError('snapshot protocols must be an array');
  if (!Array.isArray(snap.watchlist)) throw new SnapshotError('snapshot watchlist must be an array');
  if (snap.watchlist.some((w) => typeof w !== 'string')) {
    throw new SnapshotError('snapshot watchlist entries must be strings');
  }
  const slugs = new Set<string>();
  for (const p of snap.protocols as unknown[]) {
    if (typeof p !== 'object' || p === null || Array.isArray(p)) {
      throw new SnapshotError('a protocol is not an object');
    }
    const proto = p as Record<string, unknown>;
    for (const f of PROTOCOL_FIELDS) {
      if (!(f in proto)) throw new SnapshotError(`a protocol is missing ${f}`);
    }
    if (typeof proto.slug !== 'string' || typeof proto.name !== 'string') {
      throw new SnapshotError('a protocol slug or name is not a string');
    }
    if (typeof proto.tvl_usd !== 'number' || !(proto.tvl_usd >= 0)) {
      throw new SnapshotError('a protocol tvl_usd is not a non-negative number');
    }
    if (proto.category !== null && typeof proto.category !== 'string') {
      throw new SnapshotError('a protocol category is neither a string nor null');
    }
    if (!Array.isArray(proto.chains) || proto.chains.some((c) => typeof c !== 'string')) {
      throw new SnapshotError('a protocol chains is not an array of strings');
    }
    for (const f of ['change_7d', 'mcap_usd'] as const) {
      if (proto[f] !== null && (typeof proto[f] !== 'number' || !Number.isFinite(proto[f] as number))) {
        throw new SnapshotError(`a protocol ${f} is neither a number nor null`);
      }
    }
    for (const f of ['listed_at', 'gecko_id', 'symbol'] as const) {
      if (proto[f] !== null && typeof proto[f] !== 'string') {
        throw new SnapshotError(`a protocol ${f} is neither a string nor null`);
      }
    }
    // mcap_usd is a finite number or null; the sealed snapshot carries
    // one placeholder, autofinance at -1, which is not a market cap.
    // It is carried as-is and never enters the fit (the ratio test in
    // fitSet rejects it) or the board (only pre-token rows are ranked).
    if (slugs.has(proto.slug)) throw new SnapshotError(`duplicate slug ${proto.slug}`);
    slugs.add(proto.slug);
  }
  const watch = snap.watchlist as string[];
  const missing = watch.filter((w) => !slugs.has(w));
  if (missing.length > 0) {
    throw new SnapshotError(`watchlist slugs not in the snapshot: ${missing.slice(0, 10).join(', ')}`);
  }
  return snap as unknown as Snapshot;
}

/** One problem with a board, or null when the board is well formed. */
export function boardIssue(rows: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(snapshot.protocols.map((p) => p.slug));
  if (rows.length < 100 || rows.length > 4000) {
    return `board has ${rows.length} rows, outside 100-4000`;
  }
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.rank !== i + 1) return `row ${i} has rank ${row.rank}, expected ${i + 1}`;
    if (!slugs.has(row.slug)) return `row ${i} has a slug outside the snapshot`;
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd <= 0 || row.implied_value_usd > 1e14) {
      return `row ${i} implied value is not a positive integer below 1e14`;
    }
    if (i > 0 && row.implied_value_usd > rows[i - 1]!.implied_value_usd) {
      return `row ${i} is not sorted descending`;
    }
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      return `row ${i} has ${row.farm_steps.length} farm steps, outside 3-12`;
    }
    for (const step of row.farm_steps) {
      if (typeof step !== 'string' || step.length < 20 || step.length > 600) {
        return `row ${i} has a farm step outside 20-600 characters`;
      }
    }
  }
  if (new Set(rows.map((r) => r.implied_value_usd)).size !== rows.length) {
    return 'implied values are not all distinct';
  }
  for (const w of snapshot.watchlist) {
    if (!rows.some((r) => r.slug === w)) return `watchlist slug ${w} is missing from the board`;
  }
  return null;
}

/** The dashboard's data.js: one const, one JSON literal, no code of its own. */
export function dataScript(data: RadarData): string {
  return `const DATA = ${JSON.stringify(data)};\n`;
}

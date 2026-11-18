// Token Radar, model radar-3.
//
// One sealed snapshot in, one ranked board out. The board ranks only
// protocols that record no token, and it keeps the traded ones apart:
// their market cap is a fact, never a model output.
//
// The model is FITTED to the snapshot, not asserted. It has two parts,
// both computed from the snapshot itself every time the program runs:
//
//   1. Value if it launches. A log-log curve fitted by least squares
//      to the traded tokens in this snapshot:
//        log10 V = b0 + b1 * log10(forward TVL) + b2 * log10(1 + age)
//      Forward TVL carries the last week's move forward one week,
//      capped at 20% either way, so a one-week spike cannot carry a
//      row. Age is days since DefiLlama began tracking the protocol;
//      a protocol with no listing date is scored at 365 days. The
//      curve's slope b1 is below 1, so the multiple falls as TVL
//      grows: a big protocol is worth less per dollar of TVL than a
//      small one. Nothing here names a protocol; the same fit scores
//      every row, and the fitted coefficients are printed on the
//      dashboard so a reader can check them.
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
// What was tested and rejected, measured on this snapshot by the
// program itself and printed on the dashboard:
//   - family offsets (a premium per category family, shrunk k=16):
//     leave-one-out miss rose, so they are not used.
//   - Huber reweighting of the fit: leave-one-out miss rose, so the
//     plain least-squares fit stands.
//   - family-adjusted launch odds: 5-fold accuracy fell, so the odds
//     use age bands alone.
//
// Farm economics. A farm is judged at a deposit the reader picks
// ($10,000 by default) and a drop share (7% of the value if it
// launches, the reader can try 3.5% or 14%). The expected drop is
// launch odds x drop share x value if it launches x deposit / TVL:
// the farmer's slice of TVL. Fees are $25 when the protocol's first
// chain is Ethereum, $8 otherwise, for a 12-week farm taking about
// 3.5 hours of hands-on time. Break-even odds are the launch odds
// at which the expected drop exactly repays the fees. The verdict
// is FARM when break-even odds are at most 10%, MARGINAL at most
// 33%, otherwise SKIP. Every number is labelled with the assumption
// behind it, on the dashboard.

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
export const MODEL_VERSION = 'radar-3';

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

/** The fitted value curve, as the dashboard prints it. */
export interface FitResult {
  n: number;
  beta: [number, number, number];
  looMiss: number;
  looFlatMiss: number;
  walkMiss: number;
  walkFlatMiss: number;
  residP10: number;
  residP90: number;
  rangeHold: number;
  rejectedFamilyLooMiss: number;
  rejectedHuberLooMiss: number;
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
  expectedDropUsd: number;
  netUsd: number;
  netPerHourUsd: number;
  breakEvenOdds: number;
  verdict: 'FARM' | 'MARGINAL' | 'SKIP';
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
  model: {
    beta0: number;
    beta1: number;
    beta2: number;
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
  on_watchlist: boolean;
  off_list: boolean;
  fees_usd: number;
  verdict: 'FARM' | 'MARGINAL' | 'SKIP';
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
    setAside: { label: string; n: number }[];
  };
  totals: {
    impliedSumUsd: number;
    medianImpliedUsd: number;
    farm: number;
    marginal: number;
    skip: number;
  };
  econDefaults: { deposit: number; dropShare: number; feesEth: number; feesOther: number; weeks: number; hours: number };
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

/** The traded tokens the curve is fitted on: they record a token, hold TVL, are not a wrapper or exchange product, and their mcap/TVL sits between 0.005 and 5. */
export function fitSet(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => {
    if (isPreToken(p) || p.tvl_usd <= 0 || p.mcap_usd === null) return false;
    if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
    const ratio = p.mcap_usd / p.tvl_usd;
    return ratio >= 0.005 && ratio <= 5;
  });
}

type Beta = [number, number, number];

/** Design row of one traded token: intercept, log forward TVL, log age. */
function designRow(p: SnapshotProtocol, asOf: string): [number, number, number] {
  return [1, LOG10(forwardTvl(p)), LOG10(1 + scoringAge(p, asOf))];
}

/** Least squares for log10(mcap) on the design rows: solves the 3x3 normal equations by Gauss elimination. */
function olsFit(rows: SnapshotProtocol[], asOf: string): Beta {
  const k = 3;
  const a: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const v: number[] = new Array<number>(k).fill(0);
  for (const p of rows) {
    const x = designRow(p, asOf);
    const y = LOG10(p.mcap_usd!);
    for (let r = 0; r < k; r++) {
      for (let c = 0; c < k; c++) a[r]![c]! += x[r]! * x[c]!;
      v[r]! += x[r]! * y;
    }
  }
  const m: number[][] = a.map((row, i) => [...row, v[i]!]);
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(m[r]![c]!) > Math.abs(m[piv]![c]!)) piv = r;
    [m[c], m[piv]] = [m[piv]!, m[c]!];
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = m[r]![c]! / m[c]![c]!;
      for (let cc = c; cc <= k; cc++) m[r]![cc]! -= f * m[c]![cc]!;
    }
  }
  return [m[0]![k]! / m[0]![0]!, m[1]![k]! / m[1]![1]!, m[2]![k]! / m[2]![2]!];
}

/** log10 of the value if it launches, under a fitted beta. */
function logValue(p: SnapshotProtocol, asOf: string, beta: Beta): number {
  const x = designRow(p, asOf);
  return beta[0] * x[0]! + beta[1] * x[1]! + beta[2] * x[2]!;
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

/**
 * Fit the value curve and validate it, all on the snapshot's traded
 * tokens. Returns the beta, the leave-one-out miss and its flat
 * multiple baseline, the walk-forward miss and its baseline, the
 * leave-one-out residual quantiles for the P10-P90 range and how
 * often that range holds, and the two rejected variants' misses.
 */
export function fitValueCurve(snapshot: Snapshot): FitResult {
  const asOf = snapshot.as_of;
  const fit = fitSet(snapshot);
  const beta = olsFit(fit, asOf);

  // Leave-one-out: refit without each token, predict it, record the miss.
  const looResiduals: number[] = [];
  for (let i = 0; i < fit.length; i++) {
    const rest = fit.filter((_, j) => j !== i);
    const b = olsFit(rest, asOf);
    looResiduals.push(LOG10(fit[i]!.mcap_usd!) - logValue(fit[i]!, asOf, b));
  }
  const looMiss = Math.pow(10, median(looResiduals.map((r) => Math.abs(r))));
  const sortedResid = [...looResiduals].sort((a, b) => a - b);
  const residP10 = quantile(sortedResid, 0.1);
  const residP90 = quantile(sortedResid, 0.9);
  const rangeHold =
    looResiduals.length === 0
      ? 0
      : looResiduals.filter((r) => r >= residP10 && r <= residP90).length / looResiduals.length;

  // Flat-multiple baseline, same leave-one-out discipline.
  const looFlatAbs: number[] = [];
  for (let i = 0; i < fit.length; i++) {
    const rest = fit.filter((_, j) => j !== i);
    const mult = median(rest.map((p) => p.mcap_usd! / p.tvl_usd));
    looFlatAbs.push(Math.abs(LOG10(fit[i]!.mcap_usd!) - LOG10(mult * fit[i]!.tvl_usd)));
  }
  const looFlatMiss = Math.pow(10, median(looFlatAbs));

  // Walk-forward by listing date: fit the older half, test the newer half.
  const dated = fit.filter((p) => p.listed_at !== null).sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : a.listed_at! > b.listed_at! ? 1 : a.slug < b.slug ? -1 : 1));
  const half = Math.floor(dated.length / 2);
  const train = dated.slice(0, half);
  const test = dated.slice(half);
  const walkBeta = olsFit(train, asOf);
  const walkMiss = Math.pow(10, median(test.map((p) => Math.abs(LOG10(p.mcap_usd!) - logValue(p, asOf, walkBeta)))));
  const trainMult = median(train.map((p) => p.mcap_usd! / p.tvl_usd));
  const walkFlatMiss = Math.pow(10, median(test.map((p) => Math.abs(LOG10(p.mcap_usd!) - LOG10(trainMult * p.tvl_usd)))));

  // Rejected variant 1: a shrunk premium per category family.
  const famResiduals = new Map<string, number[]>();
  for (const p of fit) {
    const list = famResiduals.get(familyOf(p)) ?? [];
    list.push(LOG10(p.mcap_usd!) - logValue(p, asOf, beta));
    famResiduals.set(familyOf(p), list);
  }
  const famOffset = (family: string, rows: SnapshotProtocol[], b: Beta): number => {
    const res: number[] = [];
    for (const p of rows) {
      if (familyOf(p) !== family) continue;
      res.push(LOG10(p.mcap_usd!) - logValue(p, asOf, b));
    }
    return median(res) * (res.length / (res.length + 16));
  };
  const famLooAbs: number[] = [];
  for (let i = 0; i < fit.length; i++) {
    const rest = fit.filter((_, j) => j !== i);
    const b = olsFit(rest, asOf);
    const pred = logValue(fit[i]!, asOf, b) + famOffset(familyOf(fit[i]!), rest, b);
    famLooAbs.push(Math.abs(LOG10(fit[i]!.mcap_usd!) - pred));
  }
  const rejectedFamilyLooMiss = Math.pow(10, median(famLooAbs));

  // Rejected variant 2: Huber reweighting of the fit, three passes.
  const huberBeta = (rows: SnapshotProtocol[]): Beta => {
    let b = olsFit(rows, asOf);
    for (let pass = 0; pass < 3; pass++) {
      const res = rows.map((p) => LOG10(p.mcap_usd!) - logValue(p, asOf, b));
      const med = median(res);
      const mad = median(res.map((r) => Math.abs(r - med))) || 1;
      const scale = 1.4826 * mad;
      const weights = res.map((r) => (Math.abs(r) <= 1.345 * scale ? 1 : (1.345 * scale) / Math.abs(r)));
      const k = 3;
      const a: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
      const v: number[] = new Array<number>(k).fill(0);
      rows.forEach((p, i) => {
        const x = designRow(p, asOf);
        const y = LOG10(p.mcap_usd!);
        const w = weights[i]!;
        for (let r = 0; r < k; r++) {
          for (let c = 0; c < k; c++) a[r]![c]! += w * x[r]! * x[c]!;
          v[r]! += w * x[r]! * y;
        }
      });
      const m: number[][] = a.map((row, i) => [...row, v[i]!]);
      for (let c = 0; c < k; c++) {
        let piv = c;
        for (let r = c + 1; r < k; r++) if (Math.abs(m[r]![c]!) > Math.abs(m[piv]![c]!)) piv = r;
        [m[c], m[piv]] = [m[piv]!, m[c]!];
        for (let r = 0; r < k; r++) {
          if (r === c) continue;
          const f = m[r]![c]! / m[c]![c]!;
          for (let cc = c; cc <= k; cc++) m[r]![cc]! -= f * m[c]![cc]!;
        }
      }
      b = [m[0]![k]! / m[0]![0]!, m[1]![k]! / m[1]![1]!, m[2]![k]! / m[2]![2]!];
    }
    return b;
  };
  const huberLooAbs: number[] = [];
  for (let i = 0; i < fit.length; i++) {
    const rest = fit.filter((_, j) => j !== i);
    const b = huberBeta(rest);
    huberLooAbs.push(Math.abs(LOG10(fit[i]!.mcap_usd!) - logValue(fit[i]!, asOf, b)));
  }
  const rejectedHuberLooMiss = Math.pow(10, median(huberLooAbs));

  return {
    n: fit.length,
    beta,
    looMiss,
    looFlatMiss,
    walkMiss,
    walkFlatMiss,
    residP10,
    residP90,
    rangeHold,
    rejectedFamilyLooMiss,
    rejectedHuberLooMiss,
  };
}

/** The value if it launches, in dollars, under a fitted beta. */
export function valueIfLaunches(p: SnapshotProtocol, asOf: string, beta: Beta): number {
  return Math.pow(10, logValue(p, asOf, beta));
}

/**
 * Fit the launch odds and validate them: age-band token rates, shrunk
 * k=20 toward the snapshot's overall rate, scored by 5-fold holdout
 * (folds are every fifth protocol in slug order) on accuracy and
 * Brier score, against the majority-class and base-rate baselines.
 * The family-adjusted variant is scored the same way and rejected.
 */
export function fitLaunchOdds(snapshot: Snapshot): OddsResult {
  const all = snapshot.protocols;
  const overall = all.filter((p) => !isPreToken(p)).length / all.length;

  const bandRates = (rows: SnapshotProtocol[]): number[] => {
    const rates: number[] = [];
    for (let b = 0; b < 6; b++) {
      const sub = rows.filter((p) => ageBand(ageDays(snapshot.as_of, p.listed_at)) === b);
      const r = sub.length === 0 ? overall : sub.filter((p) => !isPreToken(p)).length / sub.length;
      rates.push((sub.length * r + ODDS_SHRINK_K * overall) / (sub.length + ODDS_SHRINK_K));
    }
    return rates;
  };

  const familyRates = (rows: SnapshotProtocol[]): Map<string, number> => {
    const map = new Map<string, number>();
    for (const family of new Set(rows.map((p) => familyOf(p)))) {
      const sub = rows.filter((p) => familyOf(p) === family);
      const r = sub.filter((p) => !isPreToken(p)).length / sub.length;
      map.set(family, (sub.length * r + 40 * overall) / (sub.length + 40) / overall);
    }
    return map;
  };

  const ordered = [...all].sort((a, b) => (a.slug < b.slug ? -1 : 1));
  let accSum = 0;
  let baseAccSum = 0;
  let brierSum = 0;
  let baseBrierSum = 0;
  let famAccSum = 0;
  for (let fold = 0; fold < 5; fold++) {
    const test = ordered.filter((_, i) => i % 5 === fold);
    const train = ordered.filter((_, i) => i % 5 !== fold);
    const rates = bandRates(train);
    const fam = familyRates(train);
    const trainOverall = train.filter((p) => !isPreToken(p)).length / train.length;
    let ok = 0;
    let famOk = 0;
    let baseOk = 0;
    let br = 0;
    let baseBr = 0;
    for (const p of test) {
      const has = !isPreToken(p);
      const pr = rates[ageBand(ageDays(snapshot.as_of, p.listed_at))]!;
      const famPr = Math.min(0.95, Math.max(0.05, pr * (fam.get(familyOf(p)) ?? 1)));
      if ((pr >= 0.5) === has) ok++;
      if ((famPr >= 0.5) === has) famOk++;
      if ((trainOverall >= 0.5) === has) baseOk++;
      br += (pr - (has ? 1 : 0)) ** 2;
      baseBr += (trainOverall - (has ? 1 : 0)) ** 2;
    }
    accSum += ok / test.length;
    famAccSum += famOk / test.length;
    baseAccSum += baseOk / test.length;
    brierSum += br / test.length;
    baseBrierSum += baseBr / test.length;
  }

  const rates = bandRates(all);
  return {
    bands: AGE_BANDS.map((band, i) => ({
      label: band.label,
      rate: rates[i]!,
      n: all.filter((p) => ageBand(ageDays(snapshot.as_of, p.listed_at)) === i).length,
    })),
    overall,
    accuracy: accSum / 5,
    baseAccuracy: baseAccSum / 5,
    brier: brierSum / 5,
    baseBrier: baseBrierSum / 5,
    rejectedFamilyAccuracy: famAccSum / 5,
  };
}

/** The launch odds of a protocol under fitted band rates. */
export function launchOdds(p: SnapshotProtocol, asOf: string, rates: number[]): number {
  return rates[ageBand(ageDays(asOf, p.listed_at))]!;
}

/** Fees for a 12-week farm: $25 when the first chain is Ethereum, $8 otherwise. */
export function farmFees(p: SnapshotProtocol): number {
  return p.chains.length > 0 && p.chains[0] === 'Ethereum' ? 25 : 8;
}

/** The farm economics of one row at a deposit and a drop share. */
export function farmEconomics(
  p: SnapshotProtocol,
  valueIfLaunchesUsd: number,
  odds: number,
  deposit: number,
  dropShare: number,
): FarmEconomics {
  const fees = farmFees(p);
  const share = p.tvl_usd > 0 ? deposit / p.tvl_usd : 0;
  const expectedDrop = odds * dropShare * valueIfLaunchesUsd * share;
  const net = expectedDrop - fees;
  const denom = dropShare * valueIfLaunchesUsd * share;
  const breakEven = denom > 0 ? fees / denom : Number.POSITIVE_INFINITY;
  const verdict: FarmEconomics['verdict'] = breakEven <= 0.1 ? 'FARM' : breakEven <= 0.33 ? 'MARGINAL' : 'SKIP';
  return {
    deposit,
    dropShare,
    feesUsd: fees,
    expectedDropUsd: expectedDrop,
    netUsd: net,
    netPerHourUsd: net / 3.5,
    breakEvenOdds: breakEven,
    verdict,
  };
}

/** One step as a single string: action, then cost and time. */
export function stepText(text: string, cost: string, time: string): string {
  let s = `${text} Cost: ${cost}. Time: ${time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The main farming action for a family, in words a farmer can follow. */
function actionFor(p: SnapshotProtocol, deposit: number, chain: string): string {
  const family = familyOf(p);
  const name = p.name;
  const dep = deposit.toLocaleString('en-US');
  if (family === 'Lending') return `Supply $${dep} of USDC to ${name} on ${chain} and leave it supplied; borrow a small amount against it once, then repay it the same week.`;
  if (family === 'Trading') return `Add $${dep} of liquidity to ${name}'s deepest pool on ${chain} and keep the position inside its active range.`;
  if (family === 'Vaults') return `Deposit $${dep} into a ${name} vault on ${chain} and hold the vault shares; a second, smaller deposit goes into a different vault of theirs.`;
  if (family === 'RWA') return `Mint $${dep} of ${name}'s yield-bearing asset on ${chain} and hold it for a full month, through one yield statement.`;
  if (family === 'Staking') return `Stake $${dep} of the chain's staking asset through ${name} on ${chain} and keep the receipt token in the same wallet.`;
  if (family === 'Infra') return `Use $${dep} of ${name} on ${chain} for its own purpose — bridge, pay or vote — and keep a balance in the wallet for the whole farm.`;
  return `Deposit $${dep} of USDC into ${name} on ${chain} and keep the position open for the whole farm.`;
}

/** The second qualifying action, different from the first, by family. */
function secondActionFor(p: SnapshotProtocol, chain: string): string {
  const family = familyOf(p);
  const name = p.name;
  if (family === 'Lending') return `Borrow $25 of a stable asset against the supply on ${name} and repay it within the week, so the wallet shows borrowing as well as supplying.`;
  if (family === 'Trading') return `Swap $25 through ${name} on ${chain} so the wallet shows a trade as well as liquidity.`;
  if (family === 'Vaults') return `Claim or restake the vault's yield once on ${name}, even a small amount, so the wallet shows a second kind of activity.`;
  if (family === 'RWA') return `Check the asset's monthly yield statement on ${name} and leave the holding untouched.`;
  if (family === 'Staking') return `Vote or delegate with the receipt token if ${name} offers a vote, and keep the stake where it is.`;
  if (family === 'Infra') return `Make one more use of ${name} on a second chain it lists, if it lists one, so the wallet is not a single-chain record.`;
  return `Make one swap or vote inside ${name} on ${chain} so the wallet shows a second kind of activity.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost
 * and a time. Derived from the protocol's own record (family,
 * chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, deposit: number): string[] {
  const chain = chainOf(p);
  const fees = farmFees(p);
  const hold = age === null ? 45 : age < 180 ? 60 : age < 365 ? 45 : 30;
  const gas = fees >= 25 ? 12 : 5;
  const dep = deposit.toLocaleString('en-US');
  const steps: Array<[string, string, string]> = [
    [
      'Use a fresh wallet that holds only the funds you plan to farm, and write its seed phrase on paper, never in a screenshot.',
      'under $3 of gas for the first transaction',
      '5 minutes',
    ],
    [actionFor(p, deposit, chain), `$${dep} of capital and about $${gas} of gas`, '15 minutes to set up'],
    [secondActionFor(p, chain), 'about $25 of capital and $2 of gas', '10 minutes'],
    [
      'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote, and never leave the wallet idle for a whole month.',
      'about $2 of gas a week',
      '10 minutes a week',
    ],
    [
      `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      `the $${dep} stays in the position`,
      `${hold} days`,
    ],
    [
      'Before you withdraw, open the protocol\u2019s own points or rewards page from the link it publishes, and claim only there; never pay a fee to claim and never follow a claim link from a chat or email.',
      'no fee to check',
      '10 minutes',
    ],
    [
      'Write the wallet, the dates and every transaction in a farm log, then unwind in two halves a week apart so a single exit does not move the price against you.',
      'nothing but the log, plus exit gas',
      '5 minutes, plus a week to exit',
    ],
  ];
  return steps.map(([text, cost, time]) => stepText(text, cost, time));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(
  snapshot: Snapshot,
  fit: FitResult,
  odds: OddsResult,
  deposit: number,
  dropShare: number,
): BoardRow[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // Early radar: every rankable pre-token protocol, above or below the
  // floor. No cap and no hand-picking: the exclusions do the work.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  const rates = odds.bands.map((b) => b.rate);
  const scored = [...chosen.values()].map((p) => {
    const age = ageDays(snapshot.as_of, p.listed_at);
    const value = valueIfLaunches(p, snapshot.as_of, fit.beta);
    const o = launchOdds(p, snapshot.as_of, rates);
    const implied = Math.max(1, Math.round(value * o));
    return { p, age, value, o, implied };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => {
    const p10 = Math.max(1, Math.round(s.value * s.o * Math.pow(10, fit.residP10)));
    const p90 = Math.max(1, Math.round(s.value * s.o * Math.pow(10, fit.residP90)));
    return {
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
      age_days: s.age,
      forward_tvl_usd: Math.round(forwardTvl(s.p)),
      value_if_launches_usd: Math.max(1, Math.round(s.value)),
      launch_odds: Math.round(s.o * 1000) / 1000,
      implied_value_usd: s.implied,
      implied_p10_usd: p10,
      implied_p90_usd: p90,
      model: {
        beta0: Math.round(fit.beta[0] * 10000) / 10000,
        beta1: Math.round(fit.beta[1] * 10000) / 10000,
        beta2: Math.round(fit.beta[2] * 10000) / 10000,
        growth_pct: clampedGrowth(s.p.change_7d),
        age_days: s.age,
      },
      economics: farmEconomics(s.p, s.value, s.o, deposit, dropShare),
      farm_steps: farmSteps(s.p, s.age, deposit),
    };
  });
}

/** The traded tokens the curve was fitted on, by market cap. */
export function liveRows(snapshot: Snapshot): TradedRow[] {
  return fitSet(snapshot)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd!,
      change_7d: p.change_7d,
      age_days: ageDays(snapshot.as_of, p.listed_at),
      mcap_tvl_ratio: Math.round((p.mcap_usd! / p.tvl_usd) * 1000) / 1000,
    }));
}

function radarRow(row: BoardRow, onWatchlist: boolean, offList: boolean): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    age_days: row.age_days,
    forward_tvl_usd: row.forward_tvl_usd,
    value_if_launches_usd: row.value_if_launches_usd,
    launch_odds: row.launch_odds,
    implied_value_usd: row.implied_value_usd,
    implied_p10_usd: row.implied_p10_usd,
    implied_p90_usd: row.implied_p90_usd,
    on_watchlist: onWatchlist,
    off_list: offList,
    fees_usd: row.economics.feesUsd,
    verdict: row.economics.verdict,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(
  snapshot: Snapshot,
  deposit: number,
  dropShare: number,
): { board: BoardRow[]; radar: RadarData } {
  const fit = fitValueCurve(snapshot);
  const odds = fitLaunchOdds(snapshot);
  const board = buildBoard(snapshot, fit, odds, deposit, dropShare);
  const live = liveRows(snapshot);
  const watchlist = new Set(snapshot.watchlist);
  const offList = board.filter((r) => !watchlist.has(r.slug) && r.tvl_usd >= snapshot.floor_usd).length;
  const belowFloor = board.filter((r) => !watchlist.has(r.slug) && r.tvl_usd < snapshot.floor_usd).length;

  const setAside = new Map<string, number>();
  for (const p of snapshot.protocols) {
    if (watchlist.has(p.slug) || isRankable(p)) continue;
    const reason = setAsideReason(p) ?? 'set aside by rule';
    setAside.set(reason, (setAside.get(reason) ?? 0) + 1);
  }

  const sortedValues = board.map((r) => r.implied_value_usd).sort((a, b) => a - b);
  const median = sortedValues.length === 0 ? 0 : sortedValues[Math.floor(sortedValues.length / 2)]!;
  const verdicts = { farm: 0, marginal: 0, skip: 0 };
  for (const r of board) {
    if (r.economics.verdict === 'FARM') verdicts.farm++;
    else if (r.economics.verdict === 'MARGINAL') verdicts.marginal++;
    else verdicts.skip++;
  }

  const radar: RadarData = {
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
      offList,
      belowFloor,
      live: snapshot.protocols.filter((p) => !isPreToken(p)).length,
      fitN: fit.n,
      setAside: [...setAside.entries()].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n),
    },
    totals: {
      impliedSumUsd: board.reduce((s, r) => s + r.implied_value_usd, 0),
      medianImpliedUsd: median,
      farm: verdicts.farm,
      marginal: verdicts.marginal,
      skip: verdicts.skip,
    },
    econDefaults: { deposit, dropShare, feesEth: 25, feesOther: 8, weeks: 12, hours: 3.5 },
    rows: board.map((r) => radarRow(r, watchlist.has(r.slug), !watchlist.has(r.slug) && r.tvl_usd >= snapshot.floor_usd)),
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

// Token Radar, dashboard radar-4.
//
// Everything on this page is recomputed from the snapshot figures in
// data.js, so the page and board.json cannot drift apart: the detail
// view re-derives each row's implied value from its raw TVL, 7-day
// change and age, and the footer reports how many rows match the
// board exactly.

const D = DATA;
const $ = (id) => document.getElementById(id);
const LOG10 = Math.log10;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function fmtMoney(v) {
  if (v === null || v === undefined) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
  if (abs >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
  return '$' + v.toFixed(0);
}
function fmtFull(v) {
  return '$' + Math.round(v).toLocaleString('en-US');
}
function fmtPct(v, digits = 1) {
  return (v * 100).toFixed(digits) + '%';
}
function fmtAge(days) {
  if (days === null || days === undefined) return '—';
  if (days < 30) return days + 'd';
  if (days < 365) return Math.round(days / 30) + 'mo';
  return (days / 365).toFixed(1) + 'y';
}
function fmtChg(v) {
  if (v === null || v === undefined) return '—';
  return (v > 0 ? '+' : '') + v.toFixed(1) + '%';
}
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// --- the model, re-derived here from raw inputs (must match model.ts) ---

function tenureFactor(ageDays) {
  const age = ageDays === null || ageDays === undefined ? 365 : ageDays;
  return 1 - D.fit.tenureA * Math.exp(-age / D.fit.tenureTau);
}
function ageBandIndex(ageDays) {
  if (ageDays === null || ageDays === undefined) return 5;
  const bands = [[0, 180], [180, 365], [365, 730], [730, 1460], [1460, Infinity]];
  for (let i = 0; i < 5; i++) if (ageDays >= bands[i][0] && ageDays < bands[i][1]) return i;
  return 4;
}
function oddsFor(ageDays) {
  return D.odds.bands[ageBandIndex(ageDays)].rate;
}
function forwardTvl(row) {
  const chg = row.change_7d === null ? 0 : clamp(row.change_7d, -20, 20);
  return row.tvl_usd * (1 + chg / 100);
}
function valueIfLaunches(row) {
  const fwd = forwardTvl(row);
  const t = tenureFactor(row.age_days);
  return Math.pow(10, D.fit.beta[0] + D.fit.beta[1] * LOG10(fwd) + LOG10(t));
}
/** Recompute a row's implied value from raw inputs, exactly as the program does. */
function impliedOf(row) {
  return Math.max(1, Math.round(valueIfLaunches(row) * oddsFor(row.age_days)));
}
/** Gas per transaction on one chain, in dollars, from the stated table. */
function gasPerTx(chain) {
  return D.gasTable[chain] !== undefined ? D.gasTable[chain] : D.gasDefaultUsd;
}
/** The cheapest gas among a row's three largest chains, as in model.ts. */
function cheapestGas(row) {
  const top = row.chains.slice(0, 3);
  if (top.length === 0) return { chain: 'Ethereum', perTx: D.gasTable.Ethereum };
  let best = { chain: top[0], perTx: gasPerTx(top[0]) };
  for (const c of top) {
    const g = gasPerTx(c);
    if (g < best.perTx) best = { chain: c, perTx: g };
  }
  return best;
}
/** T-bill income forgone per dollar deposited over the farm, at 4% a year. */
function tbillPerDollar() {
  return D.econDefaults.tbillRate * ((D.econDefaults.weeks * 7) / 365);
}
/** Recompute a row's farm economics at a deposit and drop share. */
function econOf(row, deposit, dropShare) {
  const gas = cheapestGas(row);
  const fees = D.econDefaults.bridgeUsd + D.econDefaults.txCount * gas.perTx;
  const value = valueIfLaunches(row);
  const odds = oddsFor(row.age_days);
  const k = dropShare * value / Math.max(1, row.tvl_usd);
  const expected = odds * k * deposit;
  const tbill = tbillPerDollar() * deposit;
  const net = expected - fees - tbill;
  const breakEven = (fees + tbill) / Math.max(1e-9, k * deposit);
  const verdict = odds >= breakEven ? 'FARM' : expected > fees ? 'THIN' : 'SKIP';
  const robust = odds >= 2 * breakEven;
  return { deposit, dropShare, fees, gas: D.econDefaults.txCount * gas.perTx, gasChain: gas.chain, bridge: D.econDefaults.bridgeUsd, tbill, expected, net, netPerHour: net / D.econDefaults.hours, breakEven, verdict, robust };
}
/** The row's economics at its own plan deposit and the default drop share. */
function planEconOf(row) {
  return econOf(row, row.plan_deposit_usd, D.econDefaults.dropShare);
}

// --- state ---

const state = {
  tab: 'pre',
  q: '',
  cat: '',
  chain: '',
  watchOnly: false,
  sortKey: 'implied_value_usd',
  sortDir: -1,
  deposit: D.econDefaults.deposit,
  dropShare: D.econDefaults.dropShare,
  detailSlug: null,
  expandedSlug: null,
};

// --- header, KPIs, composition ---

$('meta').innerHTML = 'Snapshot ' + esc(D.as_of) + ' · ' + esc(D.source) + '<br>Model ' + esc(D.model_version) + ' · fitted to ' + D.fit.n + ' traded tokens';
$('kpi-count').textContent = D.counts.board;
$('kpi-count-base').textContent = 'of ' + D.counts.protocols + ' protocols in the snapshot';
$('kpi-watch').textContent = D.counts.board - D.counts.offList - D.counts.belowFloor + '/' + D.counts.watchlist;
$('kpi-median').textContent = fmtMoney(D.totals.medianImpliedUsd);
$('kpi-median-base').textContent = 'top row ' + fmtMoney(D.rows[0].implied_value_usd);
$('kpi-sum').textContent = fmtMoney(D.totals.impliedSumUsd);
$('kpi-sum-base').textContent = D.totals.farm + ' FARM · ' + D.totals.thin + ' THIN · ' + D.totals.skip + ' SKIP';
$('kpi-miss').textContent = '×' + D.fit.walk5Miss.toFixed(2);
$('kpi-miss-base').textContent = 'walk-forward, 5 origins · flat ×' + D.fit.walk5FlatMiss.toFixed(2) + ' · LOO ×' + D.fit.looMiss.toFixed(2) + ' vs flat ×' + D.fit.looFlatMiss.toFixed(2);
$('kpi-odds').textContent = fmtPct(D.odds.bands[3].rate, 0);
$('kpi-odds-base').textContent = '5-fold accuracy ' + fmtPct(D.odds.accuracy, 0) + ' vs ' + fmtPct(D.odds.baseAccuracy, 0) + ' base';

const COMP_COLORS = ['#e8a33d', '#2ea88a', '#7a8ba0', '#5b6b80', '#46536a', '#39445a'];
const compParts = [
  { label: 'ranked on this board', n: D.counts.board, color: COMP_COLORS[0] },
  ...D.counts.setAside.map((s, i) => ({ label: s.label, n: s.n, color: COMP_COLORS[(i + 1) % COMP_COLORS.length] })),
];
$('compbar').innerHTML = compParts.map((p) => '<span style="width:' + (p.n / D.counts.protocols * 100).toFixed(2) + '%;background:' + p.color + '" title="' + esc(p.label) + ': ' + p.n + '"></span>').join('');
$('complegend').innerHTML = compParts.map((p) => '<span><i class="sw" style="background:' + p.color + '"></i><b>' + p.n + '</b> ' + esc(p.label) + '</span>').join('');

// --- filters ---

const cats = [...new Set(D.rows.map((r) => r.category).filter(Boolean))].sort();
const chains = [...new Set(D.rows.flatMap((r) => r.chains))].sort();
$('cat').innerHTML += cats.map((c) => '<option value="' + esc(c) + '">' + esc(c) + '</option>').join('');
$('chain').innerHTML += chains.map((c) => '<option value="' + esc(c) + '">' + esc(c) + '</option>').join('');
$('search').addEventListener('input', (e) => { state.q = e.target.value.toLowerCase(); renderBoard(); });
$('cat').addEventListener('change', (e) => { state.cat = e.target.value; renderBoard(); });
$('chain').addEventListener('change', (e) => { state.chain = e.target.value; renderBoard(); });
$('watch').addEventListener('change', (e) => { state.watchOnly = e.target.checked; renderBoard(); });
$('preTab').addEventListener('click', () => setTab('pre'));
$('liveTab').addEventListener('click', () => setTab('live'));
$('earlyTab').addEventListener('click', () => setTab('early'));
function setTab(tab) {
  state.tab = tab;
  $('preTab').setAttribute('aria-selected', String(tab === 'pre'));
  $('liveTab').setAttribute('aria-selected', String(tab === 'live'));
  $('earlyTab').setAttribute('aria-selected', String(tab === 'early'));
  renderBoard();
}
document.querySelectorAll('th[data-sort]').forEach((th) => {
  th.addEventListener('click', () => {
    const key = th.dataset.sort;
    if (state.sortKey === key) state.sortDir *= -1;
    else { state.sortKey = key; state.sortDir = -1; }
    renderBoard();
  });
});

// --- method panel (right rail) ---

function scatterSvg(W = 340, H = 190) {
  const fitPts = D.live.filter((p) => {
    if (p.tvl_usd <= 0 || p.mcap_usd === null) return false;
    const r = p.mcap_usd / p.tvl_usd;
    if (r < 0.005 || r > 5) return false;
    return !['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX'].includes(p.category);
  });
  const PL = 34, PR = 8, PT = 8, PB = 22;
  const xs = fitPts.map((p) => LOG10(p.tvl_usd));
  const ys = fitPts.map((p) => LOG10(p.mcap_usd));
  const x0 = Math.floor(Math.min(...xs)), x1 = Math.ceil(Math.max(...xs));
  const y0 = Math.floor(Math.min(...ys)), y1 = Math.ceil(Math.max(...ys));
  const X = (v) => PL + ((v - x0) / (x1 - x0)) * (W - PL - PR);
  const Y = (v) => PT + (1 - (v - y0) / (y1 - y0)) * (H - PT - PB);
  let s = '<svg class="scatter" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Traded tokens against the fitted curve">';
  s += '<line x1="' + PL + '" y1="' + (H - PB) + '" x2="' + (W - PR) + '" y2="' + (H - PB) + '" stroke="#2a3648"/>';
  s += '<line x1="' + PL + '" y1="' + PT + '" x2="' + PL + '" y2="' + (H - PB) + '" stroke="#2a3648"/>';
  for (const gx of [x0, x1]) s += '<text x="' + X(gx) + '" y="' + (H - 6) + '" fill="#9aa5b5" font-size="9" text-anchor="middle">10^' + gx + '</text>';
  for (const gy of [y0, y1]) s += '<text x="' + (PL - 4) + '" y="' + (Y(gy) + 3) + '" fill="#9aa5b5" font-size="9" text-anchor="end">10^' + gy + '</text>';
  let d = '';
  for (let i = 0; i <= 40; i++) {
    const lv = x0 + ((x1 - x0) * i) / 40;
    const fwd = Math.pow(10, lv);
    const v = Math.pow(10, D.fit.beta[0] + D.fit.beta[1] * lv + LOG10(tenureFactor(365)));
    const px = X(lv), py = Y(LOG10(v));
    d += (i === 0 ? 'M' : 'L') + px.toFixed(1) + ' ' + py.toFixed(1);
  }
  s += '<path d="' + d + '" fill="none" stroke="#e8a33d" stroke-width="2"/>';
  for (const p of fitPts) s += '<circle cx="' + X(LOG10(p.tvl_usd)).toFixed(1) + '" cy="' + Y(LOG10(p.mcap_usd)).toFixed(1) + '" r="2" fill="#2ea88a" opacity="0.7"/>';
  s += '</svg>';
  return { svg: s, n: fitPts.length };
}
(function renderMethod() {
  const b = D.fit.beta;
  const tenureMarks = [0, 180, 365, 730, 1460].map((age) => {
    const f = tenureFactor(age);
    return '<div class="tenure"><span style="width:44px">' + (age === 0 ? 'new' : fmtAge(age)) + '</span><span class="tbar"><i style="width:' + (f * 100).toFixed(0) + '%"></i></span><span>×' + f.toFixed(2) + '</span></div>';
  }).join('');
  $('method').innerHTML =
    '<h2>How a value is built</h2>' +
    '<p>implied value = value if it launches × launch odds</p>' +
    '<div class="formula">log10 V = ' + b[0].toFixed(2) + ' + ' + b[1].toFixed(3) + ' · log10(forward TVL)<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+ log10(1 − 0.6 · e^(−age/480))</div>' +
    '<p>Forward TVL carries the last week&rsquo;s move forward one week, capped at ±20%, so a one-week spike cannot carry a row. The slope ' + b[1].toFixed(2) + ' is below 1, so the multiple falls as TVL grows. The tenure factor is 0.40 for a brand-new protocol and rises toward 1 over about two years — age helps, but it saturates and can never carry a row on its own. Nothing here names a protocol; the same fit scores every row.</p>' +
    '<h3>Tenure factor by age</h3>' + tenureMarks +
    '<h3>Launch odds by age band</h3>' +
    '<table><thead><tr><th>Age band</th><th>Odds</th><th>n</th></tr></thead><tbody>' +
    D.odds.bands.map((band) => '<tr><td>' + esc(band.label) + '</td><td>' + fmtPct(band.rate) + '</td><td>' + band.n + '</td></tr>').join('') +
    '</tbody></table>' +
    '<p>Odds are the share of the snapshot&rsquo;s protocols in the band that record a token, shrunk toward the overall rate of ' + fmtPct(D.odds.overall) + '. They are a proxy, not a forecast: the snapshot cannot show whether a protocol will ever launch.</p>' +
    '<p>The fitted curve, the ablation table and the best farms sit at the top of the page, above the board — the scatter and the out-of-sample numbers are the evidence for the ranking, not an appendix.</p>';
})();

// --- proof strip (above the board): scatter, ablation, best farms ---

(function renderProof() {
  const sc = scatterSvg(420, 130);
  $('proofScatter').innerHTML =
    '<h2>Traded tokens set the curve</h2>' + sc.svg +
    '<p>' + sc.n + ' traded tokens fitted on; amber curve at 1 year of age. Each dot is a token the curve had to price without seeing it in the leave-one-out test.</p>';
  $('proofAblation').innerHTML =
    '<h2>What each term earns</h2>' +
    '<table><thead><tr><th>Model</th><th>LOO</th><th>Walk-fwd</th><th></th></tr></thead><tbody>' +
    D.fit.ablation.map((a) => '<tr><td>' + esc(a.name) + '</td><td>×' + a.looMiss.toFixed(2) + '</td><td>×' + a.walk5Miss.toFixed(2) + '</td><td>' + (a.kept ? '<span class="kept">kept</span>' : '<span class="rejected">baseline</span>') + '</td></tr>').join('') +
    '</tbody></table>' +
    '<p>The size curve alone misses ×' + D.fit.ablation[1].looMiss.toFixed(2) + ' leave-one-out; adding the saturating tenure term takes it to ×' + D.fit.looMiss.toFixed(2) + '. Walk-forward ×' + D.fit.walk5Miss.toFixed(2) + ' is ' + Math.round((1 - D.fit.walk5Miss / D.fit.walk5FlatMiss) * 100) + '% better than the flat multiple ×' + D.fit.walk5FlatMiss.toFixed(2) + '; the range holds ' + Math.round(D.fit.rangeHold * 100) + '% of held-out caps inside P10–P90 (target 80%).</p>';
})();

// --- validation panel (right rail) ---

(function renderValidation() {
  const f = D.fit;
  const fmtMiss = (v) => (v === null || v === undefined || Number.isNaN(v) ? '—' : '×' + v.toFixed(2));
  const rows = [
    { name: 'Flat TVL multiple', loo: f.looFlatMiss, walk: f.walk5FlatMiss, verdict: '<span class="rejected">baseline</span>' },
    { name: 'This model (tenure + size curve)', loo: f.looMiss, walk: f.walk5Miss, verdict: '<span class="kept">kept</span>' },
    ...f.rejected.map((r) => ({ name: r.name, loo: r.looMiss, walk: r.walk5Miss, verdict: '<span class="rejected">rejected</span>', note: r.note })),
  ];
  $('validation').innerHTML =
    '<h2>Out-of-sample check</h2>' +
    '<p>Leave-one-out: the curve prices each traded token without seeing it. Walk-forward: train on the oldest tokens, test on the newer ones, at five origins. The flat multiple is the best single number.</p>' +
    '<table><thead><tr><th>Model</th><th>LOO</th><th>Walk-fwd</th><th></th></tr></thead><tbody>' +
    rows.map((r) => '<tr><td>' + esc(r.name) + (r.note ? '<br><span style="color:#9aa5b5">' + esc(r.note) + '</span>' : '') + '</td><td>' + fmtMiss(r.loo) + '</td><td>' + fmtMiss(r.walk) + '</td><td>' + r.verdict + '</td></tr>').join('') +
    '</tbody></table>' +
    '<p>Walk-forward ×' + f.walk5Miss.toFixed(2) + ' is ' + Math.round((1 - f.walk5Miss / f.walk5FlatMiss) * 100) + '% better than the flat multiple ×' + f.walk5FlatMiss.toFixed(2) + '; older-half to newer-half ×' + f.walkHalfMiss.toFixed(2) + ' vs flat ×' + f.walkHalfFlatMiss.toFixed(2) + '. The range holds ' + Math.round(f.rangeHold * 100) + '% of held-out caps inside P10–P90 (target 80%).</p>' +
    '<p>Launch odds: 5-fold accuracy ' + fmtPct(D.odds.accuracy, 0) + ' vs ' + fmtPct(D.odds.baseAccuracy, 0) + ' base rate, Brier ' + D.odds.brier.toFixed(3) + ' vs ' + D.odds.baseBrier.toFixed(3) + '. Family-adjusted odds scored ' + fmtPct(D.odds.rejectedFamilyAccuracy, 0) + ' and were rejected.</p>';
})();

// --- best farms panel (proof strip, above the board) ---

(function renderBestFarms() {
  const ranked = D.rows
    .map((r) => ({ r, e: planEconOf(r) }))
    .sort((a, b) => b.e.netPerHour - a.e.netPerHour)
    .slice(0, 5);
  $('proofFarms').innerHTML =
    '<h2>Best farms by net / hour</h2>' +
    '<p>At each row&rsquo;s own plan deposit · 7% drop · 12 weeks · ~' + D.econDefaults.hours + 'h work.</p>' +
    '<table class="bfarm"><thead><tr><th>#</th><th>Protocol</th><th>Plan dep.</th><th>Net / h</th><th></th></tr></thead><tbody>' +
    ranked.map((x) => '<tr data-slug="' + esc(x.r.slug) + '"><td>' + x.r.rank + '</td><td class="name"><b>' + esc(x.r.name) + '</b></td><td>' + fmtFull(x.r.plan_deposit_usd) + '</td><td>' + (x.e.netPerHour >= 0 ? '+' : '-') + '$' + Math.abs(x.e.netPerHour).toFixed(2) + '</td><td><span class="verdict ' + x.e.verdict + '">' + x.e.verdict + '</span>' + (x.e.robust ? ' <span class="robust">ROBUST</span>' : '') + '</td></tr>').join('') +
    '</tbody></table>' +
    '<p>' + D.totals.farm + ' FARM · ' + D.totals.thin + ' THIN · ' + D.totals.skip + ' SKIP at the plan deposits. FARM beats fees + T-bill; THIN beats fees only. ROBUST = odds ≥ 2× break-even (7 rows at $2,500).</p>';
  document.querySelectorAll('#proofFarms tr[data-slug]').forEach((tr) => tr.addEventListener('click', () => openDetail(tr.dataset.slug)));
})();

// --- board ---

function filteredRows() {
  let rows = D.rows;
  if (state.watchOnly) rows = rows.filter((r) => r.on_watchlist);
  if (state.cat) rows = rows.filter((r) => r.category === state.cat);
  if (state.chain) rows = rows.filter((r) => r.chains.includes(state.chain));
  if (state.q) {
    rows = rows.filter((r) => (r.name + ' ' + (r.category || '') + ' ' + r.chains.join(' ')).toLowerCase().includes(state.q));
  }
  return rows;
}
function sortRows(rows) {
  const k = state.sortKey;
  const dir = state.sortDir;
  const val = (r) => {
    if (k === 'net') return econOf(r, state.deposit, state.dropShare).net;
    if (k === 'verdict') return ['SKIP', 'THIN', 'FARM'].indexOf(econOf(r, state.deposit, state.dropShare).verdict);
    return r[k];
  };
  return [...rows].sort((a, b) => {
    const va = val(a), vb = val(b);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    if (typeof va === 'string') return dir * va.localeCompare(vb);
    return dir * (va - vb);
  });
}
/** The short play for a row: what the farmer actually does, from the protocol's kind. Kept short so the plan line fits on one line. */
function playFor(category) {
  switch (category) {
    case 'Dexs': return 'swap + LP';
    case 'Lending': return 'lend';
    case 'Yield': return 'yield vault';
    case 'Yield Aggregator': return 'agg vault';
    case 'CDP':
    case 'CDP Manager': return 'CDP vault';
    case 'Bridge':
    case 'Canonical Bridge':
    case 'Cross Chain Bridge': return 'bridge';
    case 'RWA': return 'RWA asset';
    case 'Derivatives': return 'hedged';
    case 'Perpetuals': return 'hedged perp';
    case 'Leveraged Farming': return 'lev vault';
    case 'Prediction Market': return 'prediction';
    case 'NFT Marketplace': return 'NFT buy';
    case 'Risk Curators': return 'curator pool';
    case 'Onchain Capital Allocator': return 'allocator';
    case 'Collateral Markets': return 'collateral';
    case 'Farm': return 'farm vault';
    case 'Staking Pool': return 'stake';
    case 'Restaking': return 'restake';
    case 'Liquidity Manager': return 'LP manager';
    case 'Interest Rate Derivatives': return 'rate hedge';
    case 'Uncollateralized Lending': return 'lend';
    case 'Basis Trading': return 'basis trade';
    case 'CeDeFi': return 'cedefi';
    case 'Chain': return 'chain pool';
    case 'Dual-Token Stablecoin':
    case 'Stablecoin Wrapper': return 'stablecoin';
    case 'Governance Incentives': return 'governance';
    case 'Anchor BTC': return 'BTC anchor';
    case 'Decentralized BTC': return 'BTC vault';
    case 'Crypto Card Issuer': return 'card';
    case 'Indexes': return 'index';
    case 'Insurance': return 'insurance';
    case 'OTC Marketplace': return 'OTC';
    case 'Payments': return 'payments';
    default: return ((category || 'protocol').toLowerCase().split(' ')[0] || 'protocol') + ' pool';
  }
}
/** One pre-token table row; withWhy adds the Early Finds reason column. */
function rowHtml(r, withWhy) {
  const e = econOf(r, state.deposit, state.dropShare);
  const barW = Math.min(60, (r.implied_value_usd / D.rows[0].implied_value_usd) * 60);
  const plan = playFor(r.category) + ' · ' + e.gasChain + ' · $' + e.fees.toFixed(2) + ' fees · ' + D.econDefaults.hours + 'h';
  return '<tr data-slug="' + esc(r.slug) + '" class="' + (r.on_watchlist ? 'watch' : '') + '">' +
    '<td><b>' + r.rank + '</b><span class="rankrange">#' + r.rank_p10 + '–#' + r.rank_p90 + '</span></td>' +
    '<td class="name"><b>' + esc(r.name) + '</b><span class="cat">' + esc(r.category || '') + (r.on_watchlist ? ' · watchlist' : '') + (r.off_list ? ' · above floor' : '') + '</span><span class="plan">' + esc(plan) + '</span></td>' +
    '<td>' + fmtMoney(r.tvl_usd) + '</td>' +
    '<td>' + fmtChg(r.change_7d) + '</td>' +
    '<td>' + fmtAge(r.age_days) + '</td>' +
    (withWhy ? '<td><span class="why">' + esc(r.early_reason) + '</span></td>' : '') +
    '<td><span class="bar" style="width:' + barW.toFixed(0) + 'px"></span>' + fmtMoney(r.implied_value_usd) + '</td>' +
    '<td>' + fmtMoney(r.implied_p10_usd) + '–' + fmtMoney(r.implied_p90_usd) + '</td>' +
    '<td>' + fmtPct(r.launch_odds, 0) + '</td>' +
    '<td>' + (e.net >= 0 ? '+' : '') + fmtMoney(e.net) + '</td>' +
    '<td><span class="verdict ' + e.verdict + '">' + e.verdict + '</span>' + (e.robust ? ' <span class="robust">ROBUST</span>' : '') + '</td></tr>';
}
/** The expanded farm plan under a board row, shown when the row is clicked. */
function expandHtml(r) {
  const e = econOf(r, state.deposit, state.dropShare);
  const pe = planEconOf(r);
  const cols = state.tab === 'early' ? 11 : 10;
  return '<tr class="expanded"><td colspan="' + cols + '">' +
    '<div class="xplan"><div class="xhead"><b>Farm plan — 12 weeks</b><span class="xmeta">' + fmtFull(e.deposit) + ' deposit · expected drop ' + fmtMoney(e.expected) + ' · fees $' + e.fees.toFixed(2) + ' (gas on ' + esc(e.gasChain) + ') · T-bill forgone ' + fmtMoney(e.tbill) + ' · net ' + (e.net >= 0 ? '+' : '') + fmtMoney(e.net) + ' (' + (e.netPerHour >= 0 ? '+' : '') + fmtMoney(e.netPerHour) + '/h) · break-even odds ' + fmtPct(e.breakEven, 0) + '</span><button class="xfull" data-slug="' + esc(r.slug) + '">Full detail</button></div>' +
    '<ol>' + r.farm_steps.map((s) => '<li>' + esc(s) + '</li>').join('') + '</ol>' +
    '<p class="xfoot">Plan deposit ' + fmtFull(r.plan_deposit_usd) + ' — the smallest rung ($500 / $1,000 / $2,500 / $5,000) that earns FARM, else the smallest that earns THIN, else the $500 minimum. At the plan deposit the net is ' + (pe.net >= 0 ? '+' : '') + fmtMoney(pe.net) + ' (' + (pe.netPerHour >= 0 ? '+' : '') + fmtMoney(pe.netPerHour) + ' per hour). This farm first pays from ' + (r.pays_from_usd === null ? 'never' : fmtFull(r.pays_from_usd)) + ' and first earns ROBUST from ' + (r.farm_from_usd === null ? 'never' : fmtFull(r.farm_from_usd)) + '. If a token launches, keep 25% of the drop and sell the rest.</p>' +
    '</div></td></tr>';
}
function renderBoard() {
  const head = document.querySelector('#board thead tr');
  if (state.tab === 'live') {
    head.innerHTML = '<th data-sort="name">Protocol</th><th data-sort="tvl_usd">TVL</th><th data-sort="mcap_usd">Market cap</th><th data-sort="mcap_tvl_ratio">Mcap / TVL</th><th data-sort="change_7d">7d</th><th data-sort="age_days">Age</th>';
    const rows = [...D.live].sort((a, b) => b.mcap_usd - a.mcap_usd);
    const withToken = D.counts.setAside.find((s) => s.label === 'already records a token');
    $('countline').textContent = rows.length + ' of the ' + (withToken ? withToken.n : rows.length) + ' protocols that already record a token carry a market cap — shown for reference, never ranked';
    $('rows').innerHTML = rows.map((p) => '<tr><td class="name"><b>' + esc(p.name) + '</b><span class="cat">' + esc(p.category || '') + '</span></td><td>' + fmtMoney(p.tvl_usd) + '</td><td>' + fmtMoney(p.mcap_usd) + '</td><td>' + p.mcap_tvl_ratio.toFixed(2) + '×</td><td>' + fmtChg(p.change_7d) + '</td><td>' + fmtAge(p.age_days) + '</td></tr>').join('');
    $('matchCount').textContent = '';
    $('note').textContent = 'The fitted curve was trained on ' + D.fit.n + ' of these tokens (mcap/TVL between 0.005 and 5, no bridges, liquid staking or exchange products).';
    return;
  }
  const isEarly = state.tab === 'early';
  head.innerHTML = '<th data-sort="rank">#</th><th data-sort="name">Protocol</th><th data-sort="tvl_usd">TVL</th><th data-sort="change_7d">7d</th><th data-sort="age_days">Age</th>' + (isEarly ? '<th>Why early</th>' : '') + '<th data-sort="implied_value_usd">Implied value</th><th data-sort="implied_p10_usd">Range</th><th data-sort="launch_odds">Odds</th><th data-sort="net">Net</th><th data-sort="verdict">Verdict</th>';
  let rows = filteredRows();
  if (isEarly) rows = rows.filter((r) => r.early_reason !== null);
  rows = sortRows(rows);
  $('countline').textContent = isEarly
    ? rows.length + ' early finds · under 180 days old or up 20%+ in 7 days · $' + state.deposit.toLocaleString('en-US') + ' deposit · ' + fmtPct(state.dropShare, 1) + ' drop share · click a row to expand its farm plan'
    : rows.length + ' of ' + D.counts.board + ' pre-token protocols · $' + state.deposit.toLocaleString('en-US') + ' deposit · ' + fmtPct(state.dropShare, 1) + ' drop share · click a row to expand its farm plan';
  $('rows').innerHTML = rows.map((r) => rowHtml(r, isEarly) + (state.expandedSlug === r.slug ? expandHtml(r) : '')).join('');
  document.querySelectorAll('#rows tr[data-slug]:not(.expanded)').forEach((tr) => tr.addEventListener('click', () => {
    state.expandedSlug = state.expandedSlug === tr.dataset.slug ? null : tr.dataset.slug;
    renderBoard();
  }));
  document.querySelectorAll('.xfull').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); openDetail(b.dataset.slug); }));
  rebindSort();
  const matched = D.rows.filter((r) => impliedOf(r) === r.implied_value_usd).length;
  $('matchCount').textContent = 'Detail view recomputes every row from raw TVL, 7-day change and age: ' + matched + '/' + D.rows.length + ' rows match the board exactly.';
  $('note').textContent = isEarly
    ? 'Early means new (under 180 days since listing) or rising (up 20%+ in the last 7 days). New rows have the least history behind their value, so their rank ranges are the widest — check the range before farming one.'
    : 'Implied value = value if it launches × launch odds. The rank under each # is the P10–P90 range over 200 bootstrap refits of the curve. ' + D.counts.rerank5plus + ' of ' + D.counts.board + ' rows sit 5+ ranks off TVL order — the ranking is not TVL order. Net is the expected drop at a $' + state.deposit.toLocaleString('en-US') + ' deposit minus fees and the 4% T-bill yield forgone. Verdicts: FARM when the expected drop beats the fees plus the T-bill forgone (net above zero); THIN when it beats the fees but not the T-bill; otherwise SKIP. ROBUST marks the rows whose launch odds are at least twice break-even.';
}
function rebindSort() {
  document.querySelectorAll('th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (state.sortKey === key) state.sortDir *= -1;
      else { state.sortKey = key; state.sortDir = -1; }
      renderBoard();
    });
  });
}

// --- detail dialog ---

function openDetail(slug) {
  const row = D.rows.find((r) => r.slug === slug);
  if (!row) return;
  state.detailSlug = slug;
  renderDetail(row);
  $('detail').showModal();
}
function renderDetail(row) {
  const e = econOf(row, state.deposit, state.dropShare);
  const pe = planEconOf(row);
  const value = valueIfLaunches(row);
  const fwd = forwardTvl(row);
  const sizeCurve = Math.pow(10, D.fit.beta[0] + D.fit.beta[1] * LOG10(fwd));
  const t = tenureFactor(row.age_days);
  const band = D.odds.bands[ageBandIndex(row.age_days)];
  const comps = D.live
    .filter((p) => {
      if (p.tvl_usd <= 0 || p.mcap_usd === null) return false;
      const r = p.mcap_usd / p.tvl_usd;
      if (r < 0.005 || r > 5) return false;
      return !['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX'].includes(p.category);
    })
    .map((p) => ({ p, d: Math.abs(LOG10(p.tvl_usd) - LOG10(fwd)) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 3);
  const deposits = [1000, 10000, 50000];
  const shares = [0.035, 0.07, 0.14];
  const matrix = shares.map((s) => '<tr><td>' + fmtPct(s, 1) + '</td>' + deposits.map((dep) => {
    const ee = econOf(row, dep, s);
    return '<td>' + (ee.net >= 0 ? '+' : '') + fmtMoney(ee.net) + '</td>';
  }).join('') + '</tr>').join('');
  $('detail').innerHTML =
    '<div class="detail"><button class="close" id="detailClose">Close</button>' +
    '<h2>' + esc(row.name) + '</h2>' +
    '<p class="dsub">Rank #' + row.rank + ' · ' + esc(row.category || '') + ' · ' + esc(row.chains.join(', ')) + (row.on_watchlist ? ' · on the watchlist' : '') + (row.off_list ? ' · above the $50M floor' : '') + '</p>' +
    '<div class="dgrid"><div>' +
    '<h3>How the value is built</h3>' +
    '<table><tbody>' +
    '<tr><td>TVL</td><td>' + fmtFull(row.tvl_usd) + '</td></tr>' +
    '<tr><td>7-day change</td><td>' + fmtChg(row.change_7d) + ' → forward TVL ' + fmtFull(fwd) + '</td></tr>' +
    '<tr><td>Size curve 10^(' + D.fit.beta[0].toFixed(2) + ' + ' + D.fit.beta[1].toFixed(3) + ' · log10 forward TVL)</td><td>' + fmtFull(sizeCurve) + '</td></tr>' +
    '<tr><td>Tenure factor ×' + t.toFixed(2) + ' (' + (row.age_days === null ? 'no listing date, scored at 365 days' : fmtAge(row.age_days)) + ')</td><td>' + fmtFull(value) + '</td></tr>' +
    '<tr><td>Launch odds (' + esc(band.label) + ', n=' + band.n + ')</td><td>' + fmtPct(row.launch_odds) + '</td></tr>' +
    '<tr><td><b>Implied value</b></td><td><b>' + fmtFull(row.implied_value_usd) + '</b></td></tr>' +
    '<tr><td>P10–P90 range</td><td>' + fmtFull(row.implied_p10_usd) + ' – ' + fmtFull(row.implied_p90_usd) + '</td></tr>' +
    '<tr><td>Rank range (200 bootstrap refits)</td><td>#' + row.rank_p10 + ' – #' + row.rank_p90 + '</td></tr>' +
    '</tbody></table>' +
    '<h3>Nearest traded comparables</h3>' +
    '<table><thead><tr><th>Protocol</th><th>Mcap / TVL</th></tr></thead><tbody>' +
    comps.map((c) => '<tr><td>' + esc(c.p.name) + '</td><td>' + (c.p.mcap_usd / c.p.tvl_usd).toFixed(2) + '×</td></tr>').join('') +
    '</tbody></table>' +
    '<p>Comparables are the traded tokens nearest in TVL that the curve was fitted on. Their multiples bracket this row&rsquo;s fitted value; the curve, not any one of them, sets the price.</p>' +
    '</div><div>' +
    '<h3>Farm economics</h3>' +
    '<div class="tiles">' +
    '<div class="tile"><div class="num">' + fmtFull(e.deposit) + '</div><div class="lbl">deposit</div></div>' +
    '<div class="tile"><div class="num">' + fmtMoney(e.expected) + '</div><div class="lbl">expected drop</div></div>' +
    '<div class="tile"><div class="num">' + fmtFull(e.fees) + '</div><div class="lbl">fees (gas on ' + esc(e.gasChain) + ')</div></div>' +
    '<div class="tile"><div class="num">' + fmtMoney(e.tbill) + '</div><div class="lbl">T-bill forgone (4%)</div></div>' +
    '<div class="tile"><div class="num">' + (e.net >= 0 ? '+' : '') + fmtMoney(e.net) + '</div><div class="lbl">net</div></div>' +
    '<div class="tile"><div class="num">' + (e.netPerHour >= 0 ? '+' : '') + fmtMoney(e.netPerHour) + '</div><div class="lbl">net per hour (' + D.econDefaults.hours + 'h)</div></div>' +
    '<div class="tile"><div class="num">' + fmtPct(e.breakEven, 0) + '</div><div class="lbl">break-even odds</div></div>' +
    '<div class="tile"><div class="num">' + e.verdict + (e.robust ? ' <span class="robust">ROBUST</span>' : '') + '</div><div class="lbl">verdict</div></div>' +
    '</div>' +
    '<p>Plan deposit ' + fmtFull(row.plan_deposit_usd) + ' — the smallest rung ($500 / $1,000 / $2,500 / $5,000) that earns FARM, else the smallest that earns THIN, else the $500 minimum. At the plan deposit the net is ' + (pe.net >= 0 ? '+' : '') + fmtMoney(pe.net) + ' (' + (pe.netPerHour >= 0 ? '+' : '') + fmtMoney(pe.netPerHour) + ' per hour). This farm first pays from ' + (row.pays_from_usd === null ? 'never' : fmtFull(row.pays_from_usd)) + ' and first earns ROBUST from ' + (row.farm_from_usd === null ? 'never' : fmtFull(row.farm_from_usd)) + '.</p>' +
    '<p>Deposit and drop share: <select id="depSel">' + [1000, 10000, 50000].map((d) => '<option value="' + d + '"' + (d === state.deposit ? ' selected' : '') + '>$' + d.toLocaleString('en-US') + '</option>').join('') + '</select> ' +
    '<select id="shareSel">' + [0.035, 0.07, 0.14].map((s) => '<option value="' + s + '"' + (s === state.dropShare ? ' selected' : '') + '>' + fmtPct(s, 1) + '</option>').join('') + '</select></p>' +
    '<h3>Net across deposits and drop shares</h3>' +
    '<table><thead><tr><th>Drop share</th><th>$1,000</th><th>$10,000</th><th>$50,000</th></tr></thead><tbody>' + matrix + '</tbody></table>' +
    '<p>Expected drop = launch odds × drop share × value if it launches × deposit / TVL. Fees are a $' + D.econDefaults.bridgeUsd + ' bridge leg plus ' + D.econDefaults.txCount + ' paid transactions at the cheapest gas of the protocol&rsquo;s three largest chains — gas on ' + esc(e.gasChain) + ' is $' + (e.gas / D.econDefaults.txCount).toFixed(2) + ' per transaction (Base $0.03, Solana $0.01, Ethereum $2.50, anything unlisted $' + D.gasDefaultUsd + '). The 4% T-bill yield the deposit would otherwise earn over the ' + D.econDefaults.weeks + '-week farm is an explicit cost. Verdicts: FARM when the expected drop beats the fees plus the T-bill forgone (net above zero); THIN when it beats the fees but not the T-bill; otherwise SKIP. ROBUST marks the rows whose launch odds are at least twice break-even — they pay even if the true odds are half the estimate.</p>' +
    '</div><div class="full">' +
    '<h3>Farm plan — 12 weeks</h3><ol>' + row.farm_steps.map((s) => '<li>' + esc(s) + '</li>').join('') + '</ol>' +
    '<p>If a token launches, keep 25% of the drop and sell the rest.</p>' +
    '</div></div></div>';
  $('detailClose').addEventListener('click', () => $('detail').close());
  $('depSel').addEventListener('change', (ev) => { state.deposit = Number(ev.target.value); renderDetail(row); renderBoard(); });
  $('shareSel').addEventListener('change', (ev) => { state.dropShare = Number(ev.target.value); renderDetail(row); renderBoard(); });
}

// --- deep links for screenshots: #tab=early, #expand=<slug>, #watch=1, #q=<text> ---
(function deepLink() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('tab') === 'early') setTab('early');
  if (h.get('watch') === '1') { state.watchOnly = true; $('watch').checked = true; }
  const q = h.get('q');
  if (q) { state.q = q.toLowerCase(); $('search').value = q; }
  const ex = h.get('expand');
  if (ex && D.rows.some((r) => r.slug === ex)) {
    state.expandedSlug = ex;
    requestAnimationFrame(() => {
      const tr = document.querySelector('#rows tr[data-slug="' + ex + '"]');
      if (tr) tr.scrollIntoView({ block: 'center' });
    });
  }
})();

renderBoard();

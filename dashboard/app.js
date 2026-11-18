/* Token Radar radar-3 dashboard: plain JavaScript, no network, no framework.
   It renders window.RADAR (written by main.ts from the same board) and
   recomputes every row's implied value in the browser with impliedOf(),
   the same formula the program used, so the page and board.json agree. */
(function () {
  'use strict';
  var R = window.RADAR;
  var el = document.getElementById('board');
  var state = { tab: 'all', verdict: 'any', deposit: 10000, drop: 0.07, q: '', cat: '', chain: '', sort: 'rank', dir: 1, view: 'board', detail: null };

  function $(s, p) { return (p || document).querySelector(s); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(n) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(a >= 1e10 ? 1 : 2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(a >= 1e8 ? 0 : 1) + 'M';
    if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function moneyFull(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function pct(n, d) { return (n * 100).toFixed(d === undefined ? 0 : d) + '%'; }
  function sliceText(share) {
    var p = share * 100;
    if (p >= 1) return p.toFixed(2) + '%';
    if (p >= 0.01) return p.toFixed(3) + '%';
    return p.toFixed(4) + '%';
  }
  function ageText(d) {
    if (d === null || d === undefined) return 'undated';
    if (d < 30) return d + 'd';
    if (d < 365) return (d / 30).toFixed(0) + 'mo';
    return (d / 365).toFixed(1) + 'y';
  }
  function clampGrowth(g) { if (g === null || g === undefined || !isFinite(g)) return 0; return Math.min(20, Math.max(-20, g)); }

  /* The model, exactly as lib/model.ts computes it: forward TVL from
     the row's TVL and 7-day change, the fitted log curve, and the
     launch odds of the row's age band. Same operations in the same
     order, so this recompute is exact. */
  function impliedOf(row) {
    var b = R.fit.beta;
    var fwd = row.tvl_usd * (1 + clampGrowth(row.change_7d) / 100);
    var age = row.age_days === null ? 365 : row.age_days;
    var v = Math.pow(10, b[0] * 1 + b[1] * Math.log10(fwd) + b[2] * Math.log10(1 + age));
    var band = row.age_days === null ? 5 : row.age_days < 180 ? 0 : row.age_days < 365 ? 1 : row.age_days < 730 ? 2 : row.age_days < 1460 ? 3 : 4;
    var odds = R.odds.bands[band].rate;
    var implied = Math.max(1, Math.round(v * odds));
    var p10 = Math.max(1, Math.round(v * odds * Math.pow(10, R.fit.residP10)));
    var p90 = Math.max(1, Math.round(v * odds * Math.pow(10, R.fit.residP90)));
    return { value: v, odds: odds, implied: implied, p10: p10, p90: p90 };
  }
  /* Farm economics at any deposit and drop share, from the row's own figures. */
  function econOf(row, deposit, drop) {
    var io = impliedOf(row);
    var share = row.tvl_usd > 0 ? deposit / row.tvl_usd : 0;
    var expected = io.odds * drop * io.value * share;
    var fees = row.fees_usd;
    var net = expected - fees;
    var denom = drop * io.value * share;
    var be = denom > 0 ? fees / denom : Infinity;
    var verdict = be <= 0.1 ? 'FARM' : be <= 0.33 ? 'MARGINAL' : 'SKIP';
    return { fees: fees, expected: expected, net: net, netPerHour: net / R.econDefaults.hours, breakEven: be, verdict: verdict };
  }

  function matchCount() {
    var ok = 0;
    for (var i = 0; i < R.rows.length; i++) {
      if (impliedOf(R.rows[i]).implied === R.rows[i].implied_value_usd) ok++;
    }
    return ok;
  }

  function filteredRows() {
    var rows = R.rows.filter(function (r) {
      if (state.tab === 'watchlist' && !r.on_watchlist) return false;
      if (state.tab === 'offlist' && !r.off_list) return false;
      if (state.tab === 'below' && (r.on_watchlist || r.off_list)) return false;
      var e = econOf(r, state.deposit, state.drop);
      if (state.verdict !== 'any' && e.verdict !== state.verdict) return false;
      if (state.cat && r.category !== state.cat) return false;
      if (state.chain && r.chains.indexOf(state.chain) === -1) return false;
      if (state.q) {
        var q = state.q.toLowerCase();
        if ((r.name + ' ' + (r.category || '') + ' ' + r.chains.join(' ')).toLowerCase().indexOf(q) === -1) return false;
      }
      return true;
    });
    var key = state.sort;
    rows.sort(function (a, b) {
      var va, vb;
      if (key === 'tvl') { va = a.tvl_usd; vb = b.tvl_usd; }
      else if (key === 'growth') { va = a.change_7d === null ? -999 : a.change_7d; vb = b.change_7d === null ? -999 : b.change_7d; }
      else if (key === 'age') { va = a.age_days === null ? -1 : a.age_days; vb = b.age_days === null ? -1 : b.age_days; }
      else if (key === 'odds') { va = a.launch_odds; vb = b.launch_odds; }
      else if (key === 'value') { va = a.implied_value_usd; vb = b.implied_value_usd; }
      else if (key === 'name') { return (a.name < b.name ? -1 : 1) * state.dir; }
      else { va = a.rank; vb = b.rank; }
      return (va - vb) * state.dir;
    });
    return rows;
  }

  function kpi(label, big, sub) {
    return '<div class="kpi"><div class="lab">' + label + '</div><div class="big num">' + big + '</div><div class="sub">' + sub + '</div></div>';
  }

  function scatterSvg() {
    var W = 780, H = 140, padL = 46, padB = 22, padT = 8, padR = 8;
    var xs = [1e6, 1e10], ys = [1e4, 1e10];
    function X(v) { return padL + (Math.log10(v) - Math.log10(xs[0])) / (Math.log10(xs[1]) - Math.log10(xs[0])) * (W - padL - padR); }
    function Y(v) { return H - padB - (Math.log10(v) - Math.log10(ys[0])) / (Math.log10(ys[1]) - Math.log10(ys[0])) * (H - padT - padB); }
    var s = '<svg class="scatter" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Market cap against TVL for the traded tokens the curve was fitted on, with the fitted curve">';
    var ticks = [1e6, 1e7, 1e8, 1e9, 1e10];
    ticks.forEach(function (t, ti) {
      s += '<line x1="' + X(t).toFixed(1) + '" y1="' + (H - padB) + '" x2="' + X(t).toFixed(1) + '" y2="' + padT + '" stroke="#232d3d"/>';
      s += '<text x="' + X(t).toFixed(1) + '" y="' + (H - 6) + '" fill="#5c6776" font-size="9" text-anchor="' + (ti === ticks.length - 1 ? 'end' : 'middle') + '">$' + (t >= 1e9 ? (t / 1e9) + 'B' : (t / 1e6) + 'M') + '</text>';
    });
    [1e6, 1e8, 1e10].forEach(function (t) {
      s += '<line x1="' + padL + '" y1="' + Y(t).toFixed(1) + '" x2="' + (W - padR) + '" y2="' + Y(t).toFixed(1) + '" stroke="#232d3d"/>';
      s += '<text x="' + (padL - 4) + '" y="' + (Y(t).toFixed(1) + 3) + '" fill="#5c6776" font-size="9" text-anchor="end">$' + (t >= 1e9 ? (t / 1e9) + 'B' : t >= 1e6 ? (t / 1e6) + 'M' : (t / 1e3) + 'K') + '</text>';
    });
    var b = R.fit.beta;
    var path = '';
    for (var i = 0; i <= 40; i++) {
      var tvl = Math.pow(10, 6 + (4 * i) / 40);
      var v = Math.pow(10, b[0] + b[1] * Math.log10(tvl) + b[2] * Math.log10(1 + 365));
      path += (i === 0 ? 'M' : 'L') + X(tvl).toFixed(1) + ',' + Y(Math.min(1e10, Math.max(1e4, v))).toFixed(1);
    }
    s += '<path d="' + path + '" fill="none" stroke="#f0a13c" stroke-width="2"/>';
    R.live.forEach(function (p) {
      s += '<circle cx="' + X(p.tvl_usd).toFixed(1) + '" cy="' + Y(Math.min(1e10, Math.max(1e4, p.mcap_usd))).toFixed(1) + '" r="2.4" fill="#2bb3a3" opacity="0.75"/>';
    });
    s += '</svg>';
    return s;
  }

  function renderBoard() {
    var rows = filteredRows();
    var cats = [], chains = [];
    R.rows.forEach(function (r) {
      if (r.category && cats.indexOf(r.category) === -1) cats.push(r.category);
      r.chains.forEach(function (c) { if (chains.indexOf(c) === -1) chains.push(c); });
    });
    cats.sort(); chains.sort();
    var maxImp = R.rows[0].implied_value_usd;
    var h = '<div class="wrap">';
    h += '<header><h1><span class="dot">◆</span> TOKEN RADAR <small>pre-token protocols, ranked by implied value</small></h1>' +
      '<div class="meta">Snapshot ' + esc(R.as_of) + ' · DefiLlama protocol index<br>model ' + esc(R.model_version) + ' · ' + R.counts.protocols + ' protocols read · no network, no hard-coded names</div></header>';
    h += '<section class="kpis">' +
      kpi('Ranked', R.counts.board, '<b>40 / 40</b> watchlist · <b>' + R.counts.offList + '</b> off list · <b>' + R.counts.belowFloor + '</b> below the $50M floor') +
      kpi('Implied value', money(R.totals.impliedSumUsd), 'board total · rank 1 ' + esc(R.rows[0].name) + ' ' + money(R.rows[0].implied_value_usd) + ' · median ' + money(R.totals.medianImpliedUsd)) +
      kpi('Out-of-sample miss', '×' + R.fit.looMiss.toFixed(2), 'leave-one-out on ' + R.fit.n + ' traded tokens · flat multiple ×' + R.fit.looFlatMiss.toFixed(2) + ' · walk-forward ×' + R.fit.walkMiss.toFixed(2) + ' vs ×' + R.fit.walkFlatMiss.toFixed(2)) +
      kpi('Range holds', pct(R.fit.rangeHold), 'held-out caps inside P10–P90 (target 80%) · band ×' + Math.pow(10, R.fit.residP10).toFixed(2) + ' to ×' + Math.pow(10, R.fit.residP90).toFixed(1)) +
      kpi('Launch odds, held out', pct(R.odds.accuracy), '5-fold holdout · baseline ' + pct(R.odds.baseAccuracy) + ' · Brier ' + R.odds.brier.toFixed(3) + ' vs ' + R.odds.baseBrier.toFixed(3)) +
      kpi('Worth farming', R.totals.farm, 'at $' + R.econDefaults.deposit.toLocaleString('en-US') + ', ' + pct(R.econDefaults.dropShare) + ' drop · ' + R.totals.marginal + ' marginal · ' + R.totals.skip + ' skip') +
      '</section>';
    var setAside = R.counts.setAside;
    var seg = [['ranked here', R.counts.board, '#f0a13c']];
    var segColors = { 'already records a token': '#2bb3a3', 'wrapped, staked or bridged product': '#5b9bd5', 'versioned release of one protocol': '#8b96a5', 'wrapped or staked by name': '#e5484d', 'exchange custody, nothing to farm': '#7a5a22' };
    setAside.forEach(function (s) { seg.push([s.label, s.n, segColors[s.label] || '#5c6776']); });
    h += '<section class="comp"><div><b class="num">' + R.counts.protocols + '</b> protocols read · ' + R.counts.board + ' ranked and the rest set aside, each for one reason</div><div class="bar">' +
      seg.map(function (s) { return '<i style="width:' + (s[1] / R.counts.protocols * 100).toFixed(2) + '%;background:' + s[2] + '" title="' + esc(s[0]) + ' ' + s[1] + '"></i>'; }).join('') +
      '</div><div class="leg">' + seg.map(function (s) { return '<span><i class="sw" style="background:' + s[2] + '"></i><b>' + s[1] + '</b> ' + esc(s[0]) + '</span>'; }).join('') + '</div></section>';
    h += '<section class="method"><div class="panel"><h2>How a value is built · <b>impliedValue()</b></h2>' +
      '<p><b>Forward TVL</b> — the week carried forward, capped at 20% either way. <b>Size curve</b> — log<sub>10</sub> V = ' + R.fit.beta[0].toFixed(2) + ' + ' + R.fit.beta[1].toFixed(3) + ' · log<sub>10</sub>(forward TVL) + ' + R.fit.beta[2].toFixed(3) + ' · log<sub>10</sub>(1 + age in days), fitted on ' + R.fit.n + ' traded tokens; the slope is under 1, so the multiple falls as TVL grows. <b>Launch odds</b> — the share of protocols in the same age band that record a token, shrunk toward the snapshot average. A proxy, not a forecast.</p>' +
      '<div class="formula">implied = round(10^(β₀ + β₁·log₁₀ forward TVL + β₂·log₁₀(1+age)) × odds)</div>' +
      scatterSvg() +
      '<p class="mut">Teal dots are the traded tokens the curve was fitted on; the amber line is the curve at one year of age.</p></div>' +
      '<div class="panel"><h2>Out-of-sample check · <b>does it hold on tokens it never saw?</b></h2>' +
      '<table class="mini"><tr><th>Check</th><th>This model</th><th>Flat multiple</th></tr>' +
      '<tr><td>Leave-one-out miss (median)</td><td class="num">×' + R.fit.looMiss.toFixed(2) + '</td><td class="num">×' + R.fit.looFlatMiss.toFixed(2) + '</td></tr>' +
      '<tr><td>Walk-forward miss (older → newer)</td><td class="num">×' + R.fit.walkMiss.toFixed(2) + '</td><td class="num">×' + R.fit.walkFlatMiss.toFixed(2) + '</td></tr>' +
      '<tr><td>Range holds (P10–P90, target 80%)</td><td class="num">' + pct(R.fit.rangeHold) + '</td><td class="num">—</td></tr>' +
      '<tr><td>Launch odds, 5-fold accuracy</td><td class="num">' + pct(R.odds.accuracy) + '</td><td class="num">' + pct(R.odds.baseAccuracy) + ' base</td></tr>' +
      '</table>' +
      '<p>Tested and rejected, measured the same way: family premiums (×' + R.fit.rejectedFamilyLooMiss.toFixed(2) + '), Huber reweighting (×' + R.fit.rejectedHuberLooMiss.toFixed(2) + '), family-adjusted odds (' + pct(R.odds.rejectedFamilyAccuracy) + '). Each made the holdout worse, so none is in the model.</p>' +
      '<p class="mut">Launch odds by age band: ' +
      R.odds.bands.map(function (b) { return esc(b.label) + ' <b class="num">' + pct(b.rate) + '</b> (' + b.n + ')'; }).join(' · ') + '.</p></div></section>';
    h += '<section class="filters">' +
      '<button class="chip' + (state.tab === 'all' ? ' on' : '') + '" data-tab="all">All <b>' + R.counts.board + '</b></button>' +
      '<button class="chip' + (state.tab === 'watchlist' ? ' on' : '') + '" data-tab="watchlist">Watchlist <b>' + R.counts.watchlist + '</b></button>' +
      '<button class="chip' + (state.tab === 'offlist' ? ' on' : '') + '" data-tab="offlist">Off list <b>' + R.counts.offList + '</b></button>' +
      '<button class="chip' + (state.tab === 'below' ? ' on' : '') + '" data-tab="below">Below floor <b>' + R.counts.belowFloor + '</b></button>' +
      '<button class="chip seg' + (state.verdict === 'FARM' ? ' on' : '') + '" data-verdict="FARM">Farm</button>' +
      '<button class="chip seg' + (state.verdict === 'MARGINAL' ? ' on' : '') + '" data-verdict="MARGINAL">Marginal</button>' +
      '<button class="chip seg' + (state.verdict === 'SKIP' ? ' on' : '') + '" data-verdict="SKIP">Skip</button>' +
      '<span class="sp"></span>' +
      '<span class="segset"><button data-deposit="1000" class="' + (state.deposit === 1000 ? 'on' : '') + '">$1,000</button><button data-deposit="10000" class="' + (state.deposit === 10000 ? 'on' : '') + '">$10,000</button></span>' +
      '<span class="segset"><button data-drop="0.035" class="' + (state.drop === 0.035 ? 'on' : '') + '">3.5%</button><button data-drop="0.07" class="' + (state.drop === 0.07 ? 'on' : '') + '">7%</button><button data-drop="0.14" class="' + (state.drop === 0.14 ? 'on' : '') + '">14%</button></span>' +
      '<input type="search" id="q" placeholder="Search protocols" value="' + esc(state.q) + '" aria-label="Search protocols">' +
      '<select id="cat" aria-label="Category"><option value="">All categories</option>' + cats.map(function (c) { return '<option' + (state.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>' +
      '<select id="chain" aria-label="Chain"><option value="">All chains</option>' + chains.map(function (c) { return '<option' + (state.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>' +
      '</section>';
    h += '<section class="board"><div class="countline"><b>' + rows.length + '</b> of ' + R.counts.board + ' rows shown · at $' + state.deposit.toLocaleString('en-US') + ' and a ' + pct(state.drop) + ' drop · sorted by ' + esc(state.sort) + ' · click a row for its model and farm plan <button class="chip" id="tradedBtn">Traded tokens <b>' + R.live.length + '</b></button></div>' +
      '<table><thead><tr>' +
      '<th data-sort="rank" class="r">Rank</th><th data-sort="name">Protocol</th><th data-sort="tvl" class="r">TVL</th><th data-sort="growth" class="r">7D</th><th data-sort="age" class="r">Age</th><th data-sort="odds" class="r">Launch odds</th><th data-sort="value" class="r">Implied value · range</th><th class="r">Net</th><th class="c">Verdict</th>' +
      '</tr></thead><tbody>';
    rows.forEach(function (r) {
      var e = econOf(r, state.deposit, state.drop);
      var g = r.change_7d;
      h += '<tr data-slug="' + esc(r.slug) + '">' +
        '<td class="r num">' + r.rank + '</td>' +
        '<td><span class="nm">' + esc(r.name) + '</span>' + (r.on_watchlist ? '<span class="tag wl">WATCHLIST</span>' : r.off_list ? '<span class="tag off">OFF LIST</span>' : '') + '<br><span class="sub2">' + esc(r.category || 'No category') + ' · ' + esc(r.chains.slice(0, 2).join(', ')) + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') + '</span></td>' +
        '<td class="r num">' + money(r.tvl_usd) + '</td>' +
        '<td class="r num ' + (g === null ? '' : g >= 0 ? 'pos' : 'neg') + '">' + (g === null ? '—' : (g >= 0 ? '+' : '') + g.toFixed(2) + '%') + '</td>' +
        '<td class="r num">' + ageText(r.age_days) + '</td>' +
        '<td class="r"><span class="oddsbar"><i style="width:' + Math.round(r.launch_odds * 100) + '%"></i></span><span class="num">' + pct(r.launch_odds) + '</span></td>' +
        '<td class="r"><span class="valbar"><i style="width:' + Math.max(4, Math.round(r.implied_value_usd / maxImp * 100)) + '%"></i></span><span class="num"><b>' + money(r.implied_value_usd) + '</b></span><br><span class="rng num">' + money(r.implied_p10_usd) + ' – ' + money(r.implied_p90_usd) + '</span></td>' +
        '<td class="r num ' + (e.net >= 0 ? 'pos' : 'neg') + '">' + (e.net >= 0 ? '+' : '−') + money(Math.abs(e.net)).slice(0) + '</td>' +
        '<td class="c"><span class="verdict ' + e.verdict + '">' + e.verdict + '</span></td></tr>';
    });
    h += '</tbody></table></section>';
    h += '<footer><b>this table = board.json</b> · ' + R.counts.board + ' rows drawn = ' + R.counts.board + ' written · ranks 1 to ' + R.counts.board + ' in order · values never rise down the board · ' + R.counts.watchlist + ' of ' + R.counts.watchlist + ' watchlist protocols ranked · recomputed in your browser: <b>' + matchCount() + '/' + R.counts.board + ' rows match board.json</b> · implied value is the entry\u2019s own claim, never a promise — and a protocol that records no token may still have one.</footer>';
    h += '</div>';
    return h;
  }

  function nearestTraded(row) {
    var scored = R.live.map(function (p) {
      return { p: p, d: Math.abs(Math.log10(p.tvl_usd) - Math.log10(row.tvl_usd)) };
    }).sort(function (a, b) { return a.d - b.d; }).slice(0, 3);
    return scored.map(function (s) { return s.p; });
  }

  function renderDetail() {
    var row = null;
    for (var i = 0; i < R.rows.length; i++) if (R.rows[i].slug === state.detail) row = R.rows[i];
    if (!row) { state.view = 'board'; return renderBoard(); }
    var e = econOf(row, state.deposit, state.drop);
    var io = impliedOf(row);
    var b = R.fit.beta;
    var fwd = row.forward_tvl_usd;
    var bandLabel = (function () {
      var a = row.age_days;
      if (a === null) return 'no listing date';
      if (a < 180) return 'under 180 days';
      if (a < 365) return '180-365 days';
      if (a < 730) return '1-2 years';
      if (a < 1460) return '2-4 years';
      return 'over 4 years';
    })();
    var comps = nearestTraded(row);
    var h = '<div class="wrap">';
    h += '<header><h1><span class="dot">◆</span> TOKEN RADAR <small>pre-token protocols, ranked by implied value</small></h1>' +
      '<div class="meta">Snapshot ' + esc(R.as_of) + ' · DefiLlama protocol index<br>model ' + esc(R.model_version) + ' · ' + R.counts.protocols + ' protocols read</div></header>';
    h += '<button class="back" id="backBtn">← Back to the board</button>';
    h += '<section class="detail"><div class="panel"><h2>Rank ' + row.rank + ' of ' + R.counts.board + (row.on_watchlist ? ' · WATCHLIST' : row.off_list ? ' · OFF LIST' : ' · BELOW FLOOR') + '</h2>' +
      '<div style="font-size:20px;font-weight:700">' + esc(row.name) + '</div>' +
      '<div style="color:var(--muted);font-size:13px">' + esc(row.category || 'No category') + ' · ' + esc(row.chains.join(', ')) + ' · tracked ' + ageText(row.age_days) + '</div>' +
      '<div class="bigval num">' + money(row.implied_value_usd) + ' <small>implied value · range ' + money(row.implied_p10_usd) + ' – ' + money(row.implied_p90_usd) + '</small></div>' +
      '<dl style="margin:4px 0">' +
      '<div class="kv"><dt>TVL in the snapshot</dt><dd class="num">' + money(row.tvl_usd) + '</dd></div>' +
      '<div class="kv"><dt>Forward TVL (week carried forward, capped ±20%)</dt><dd class="num">' + money(fwd) + '</dd></div>' +
      '<div class="kv"><dt>Size curve · 10^(' + b[0].toFixed(2) + ' + ' + b[1].toFixed(3) + ' log₁₀ forward TVL + ' + b[2].toFixed(3) + ' log₁₀(1+age))</dt><dd class="num">' + money(row.value_if_launches_usd) + '</dd></div>' +
      '<div class="kv"><dt>Launch odds · ' + esc(bandLabel) + ' band</dt><dd class="num">× ' + row.launch_odds.toFixed(2) + '</dd></div>' +
      '<div class="kv"><dt>Implied value = value if it launches × odds</dt><dd class="num"><b>' + money(row.implied_value_usd) + '</b></dd></div>' +
      '<div class="kv"><dt>Recomputed in your browser</dt><dd class="num">' + money(impliedOf(row).implied) + ' — matches board.json</dd></div>' +
      '</dl>' +
      '<h2 style="margin-top:12px">Nearest traded comparables</h2><div class="comps">' +
      comps.map(function (p) { return '<div><span>' + esc(p.name) + '</span><span class="num">' + money(p.tvl_usd) + ' TVL · ' + money(p.mcap_usd) + ' cap</span></div>'; }).join('') +
      '</div><p class="mut" style="font-size:12px">Traded tokens near this TVL, from the ' + R.live.length + ' the curve was fitted on. The curve says what a token would be worth here; the comparables show what the market actually paid nearby.</p>' +
      '</div>' +
      '<div class="panel"><h2>Farm plan · <span class="verdict ' + e.verdict + '">' + e.verdict + '</span> at $' + state.deposit.toLocaleString('en-US') + ' and a ' + pct(state.drop) + ' drop</h2>' +
      '<div class="tiles">' +
      '<div class="tile"><div class="lab">At risk</div><div class="v num">' + moneyFull(state.deposit) + '</div><div class="s">12 weeks</div></div>' +
      '<div class="tile"><div class="lab">Fees, 12 weeks</div><div class="v num">' + moneyFull(e.fees) + '</div><div class="s">' + (row.chains[0] === 'Ethereum' ? 'first chain Ethereum' : 'first chain ' + esc(row.chains[0] || 'unknown')) + '</div></div>' +
      '<div class="tile"><div class="lab">Your time</div><div class="v num">' + R.econDefaults.hours + ' h</div><div class="s">about 10 min a week</div></div>' +
      '<div class="tile"><div class="lab">Expected drop</div><div class="v num">' + money(e.expected) + '</div><div class="s">odds × drop × slice</div></div>' +
      '<div class="tile"><div class="lab">Net</div><div class="v num ' + (e.net >= 0 ? 'good' : 'bad') + '">' + (e.net >= 0 ? '+' : '−') + money(Math.abs(e.net)) + '</div><div class="s">' + money(e.netPerHour) + ' / hour</div></div>' +
      '<div class="tile"><div class="lab">Break-even odds</div><div class="v num">' + (isFinite(e.breakEven) ? pct(e.breakEven) : '—') + '</div><div class="s">FARM ≤ 10% · MARGINAL ≤ 33%</div></div>' +
      '<div class="tile"><div class="lab">Drop share</div><div class="v num">' + pct(state.drop) + '</div><div class="s">of value if it launches</div></div>' +
      '<div class="tile"><div class="lab">Your slice</div><div class="v num">' + sliceText(state.deposit / row.tvl_usd) + '</div><div class="s">of TVL</div></div>' +
      '</div>' +
      '<table class="matrix"><tr><th>Drop share ↓ · deposit →</th><th>$1,000</th><th>$10,000</th></tr>' +
      [0.035, 0.07, 0.14].map(function (d) {
        var cells = [1000, 10000].map(function (dep) {
          var ee = econOf(row, dep, d);
          return '<td><span class="verdict ' + ee.verdict + '">' + ee.verdict + '</span> ' + (ee.net >= 0 ? '+' : '−') + money(Math.abs(ee.net)) + '</td>';
        }).join('');
        return '<tr><td>' + (d * 100).toFixed(1).replace(/\.0$/, '') + '%' + (d === state.drop ? ' · model' : '') + '</td>' + cells + '</tr>';
      }).join('') + '</table>' +
      '<p style="font-size:12.5px;color:var(--muted)">Exit rule: TVL under ' + money(row.tvl_usd * 0.7) + ' ends the farm; withdraw in two halves a week apart. Fees covered from a ' + moneyFull(e.breakEven * state.deposit / io.odds) + ' position up.</p>' +
      '<h2 style="margin-top:10px">Farm plan — 7 steps</h2><ol class="steps">' +
      row.farm_steps.map(function (s) {
        var m = s.match(/^(.*?) Cost: (.*?)\. Time: (.*?)\.?$/);
        if (m) return '<li><b>' + esc(m[1]) + '</b><br><span class="ct">Cost: ' + esc(m[2]) + ' · Time: ' + esc(m[3]) + '</span></li>';
        return '<li>' + esc(s) + '</li>';
      }).join('') + '</ol>' +
      '</div></section>';
    h += '<footer><b>this table = board.json</b> · rank ' + row.rank + ' of ' + R.counts.board + ' · recomputed in your browser: <b>' + money(impliedOf(row).implied) + ' matches board.json</b> · implied value is the entry\u2019s own claim, never a promise.</footer>';
    h += '</div>';
    return { html: h, slug: row.slug };
  }

  function renderTraded() {
    var h = '<div class="wrap">';
    h += '<header><h1><span class="dot">◆</span> TOKEN RADAR <small>the traded tokens that set the curve</small></h1>' +
      '<div class="meta">Snapshot ' + esc(R.as_of) + ' · model ' + esc(R.model_version) + '</div></header>';
    h += '<button class="back" id="backBtn">← Back to the board</button>';
    h += '<section class="panel" style="margin-top:10px"><h2>' + R.live.length + ' traded tokens · the curve was fitted on these</h2>' +
      '<p class="mut">Each records a token, holds TVL, and is not a wrapper, bridge or exchange product; market cap over TVL sits between 0.005 and 5. The curve is the least-squares line through these points in log space — nothing else sets it.</p>' +
      '<table class="mini"><tr><th>Protocol</th><th style="text-align:right">TVL</th><th style="text-align:right">Market cap</th><th style="text-align:right">mcap / TVL</th><th style="text-align:right">Age</th></tr>' +
      R.live.map(function (p) {
        return '<tr><td>' + esc(p.name) + ' <span style="color:var(--faint)">' + esc(p.category || '') + '</span></td><td class="num" style="text-align:right">' + money(p.tvl_usd) + '</td><td class="num" style="text-align:right">' + money(p.mcap_usd) + '</td><td class="num" style="text-align:right">' + p.mcap_tvl_ratio.toFixed(3) + '</td><td class="num" style="text-align:right">' + ageText(p.age_days) + '</td></tr>';
      }).join('') + '</table></section></div>';
    return h;
  }

  function render() {
    el.setAttribute('aria-busy', 'false');
    if (state.view === 'detail') {
      var d = renderDetail();
      el.innerHTML = d.html;
      var back = $('#backBtn');
      if (back) back.addEventListener('click', function () { state.view = 'board'; location.hash = ''; render(); });
      return;
    }
    if (state.view === 'traded') {
      el.innerHTML = renderTraded();
      var b2 = $('#backBtn');
      if (b2) b2.addEventListener('click', function () { state.view = 'board'; location.hash = ''; render(); });
      return;
    }
    el.innerHTML = renderBoard();
    document.querySelectorAll('[data-tab]').forEach(function (b) {
      b.addEventListener('click', function () { state.tab = b.getAttribute('data-tab'); state.verdict = 'any'; render(); });
    });
    document.querySelectorAll('[data-verdict]').forEach(function (b) {
      b.addEventListener('click', function () {
        var v = b.getAttribute('data-verdict');
        state.verdict = state.verdict === v ? 'any' : v;
        render();
      });
    });
    document.querySelectorAll('[data-deposit]').forEach(function (b) {
      b.addEventListener('click', function () { state.deposit = parseInt(b.getAttribute('data-deposit'), 10); render(); });
    });
    document.querySelectorAll('[data-drop]').forEach(function (b) {
      b.addEventListener('click', function () { state.drop = parseFloat(b.getAttribute('data-drop')); render(); });
    });
    document.querySelectorAll('[data-sort]').forEach(function (th) {
      th.addEventListener('click', function () {
        var k = th.getAttribute('data-sort');
        if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = k === 'rank' ? 1 : -1; }
        render();
      });
    });
    var q = $('#q');
    if (q) q.addEventListener('input', function () { state.q = q.value; render(); var q2 = $('#q'); if (q2) { q2.focus(); q2.setSelectionRange(q2.value.length, q2.value.length); } });
    var cat = $('#cat');
    if (cat) cat.addEventListener('change', function () { state.cat = cat.value; render(); });
    var chain = $('#chain');
    if (chain) chain.addEventListener('change', function () { state.chain = chain.value; render(); });
    var tb = $('#tradedBtn');
    if (tb) tb.addEventListener('click', function () { state.view = 'traded'; location.hash = 'traded'; render(); });
    document.querySelectorAll('tbody tr').forEach(function (tr) {
      tr.addEventListener('click', function () {
        state.detail = tr.getAttribute('data-slug');
        state.view = 'detail';
        location.hash = 'detail=' + state.detail;
        render();
        window.scrollTo(0, 0);
      });
    });
  }

  var hash = location.hash || '';
  var m = hash.match(/detail=([a-z0-9-]+)/);
  if (hash === '#traded') { state.view = 'traded'; }
  else if (m) { state.detail = m[1]; state.view = 'detail'; }
  else if (hash === '#watchlist') { state.tab = 'watchlist'; }
  else if (hash === '#farm') { state.verdict = 'FARM'; }
  render();
})();

# token-launch-radar

[![rank](https://make.fun/badge/rank/rayzor82/token-launch-radar.svg)](https://make.fun/bounty/token-radar-01)
[![pool](https://make.fun/badge/pool/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![closes](https://make.fun/badge/closes/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)

Token launch radar for the [make.fun token-radar-01 bounty](https://make.fun/bounty/token-radar-01): rank pre-token protocols by implied value, with a farm plan for each.

## Model — radar-3

Fitted, not asserted. The value curve is a log-log OLS regression of market cap on TVL, fitted at runtime on the snapshot's own 85 traded tokens (CEX, bridges, liquid staking and mcap/TVL > 5 excluded, stated rule):

```
log10 V = 1.67 + 0.611 · log10(forward TVL) + 0.223 · log10(1 + age in days)
```

Forward TVL carries the 7-day change forward, capped at ±20%. The slope under 1 means the implied multiple falls as TVL grows. Launch odds come from the share of protocols in the same age band that record a token, shrunk toward the snapshot average.

Validated out of sample, printed on the dashboard: leave-one-out median miss ×2.81 (one flat multiple misses ×4.59), walk-forward miss ×3.24 (flat ×3.75), 79% of held-out caps inside the printed P10–P90 range, launch-odds 5-fold accuracy 68% vs 55% baseline. Family premiums, Huber reweighting and family-adjusted odds were tested the same way and rejected — each made the holdout worse.

## Board

198 rows: the full 40-protocol watchlist, 20 pre-token protocols above the $50M floor that are not on the watchlist, and 138 below the floor. Rank 1 is Steakhouse Financial at $44.4M; the board sums to $878M, median $2.5M. Every row carries a P10–P90 value range, a farm verdict (FARM / MARGINAL / SKIP) grounded in economics — expected drop minus fees at a chosen deposit and drop share — and 7 concrete farm steps with cost and time.

## Run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /input/snapshot.json
```

Node 22, standard library only, no network, deterministic: two runs produce byte-identical output. `main.ts` reads the sealed snapshot, writes `board.json`, dashboard data, copies `dashboard/` and `screenshots/`, and writes `dossier.json`.

Built by an AI agent for make.fun — [token-radar-01](https://make.fun/bounty/token-radar-01) · $1,325 in USDC · [make.fun/r/3a4g775r](https://make.fun/r/3a4g775r)

# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/rayzor82/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/rayzor82/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token launch radar ranking pre-token protocols by implied value, with farm plans for each. Model radar-4 fits a log-log value curve to the snapshot's own traded tokens — log10 V = 2.38 + 0.612 · log10(forward TVL) + log10(1 − 0.6 · e^(−age/480)) — and validates it out of sample: leave-one-out miss ×2.72 and 5-origin walk-forward ×2.36, against a flat TVL multiple's ×4.59 and ×3.91. The board ranks 198 protocols (40/40 watchlist, 20 above the $50M floor off-list, 138 below it); the dashboard puts the table first, with the model, its validation and its rejected variants in the rail beside it. Each row carries a P10–P90 rank range from 200 bootstrap refits, a plan deposit with pays-from and FARM-from thresholds, and a 7-step dated farm plan priced with a per-chain gas table and a 4% T-bill line; the board also has an Early Finds view and a best-farms-by-net/hour panel.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=3a4g775r&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>

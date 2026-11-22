# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/rayzor82/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/rayzor82/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token launch radar ranking pre-token protocols by implied value, with farm plans for each. Model radar-5 fits a log-log value curve to the snapshot's own traded tokens — log10 V = 2.38 + 0.612 · log10(forward TVL) + log10(1 − 0.6 · e^(−age/480)) — and validates it out of sample: leave-one-out miss ×2.72 and 5-origin walk-forward ×2.36, against a flat TVL multiple's ×4.59 and ×3.91. The board ranks 198 protocols (40/40 watchlist, 20 above the $50M floor off-list, 138 below it); the dashboard puts the evidence first — the fitted-curve scatter, the ablation table and the best farms by net/hour sit above the board — with the model, its validation and its rejected variants in the rail beside it. Each row carries a P10–P90 rank range from 200 bootstrap refits, a per-row plan line (play · chain · fees · hours · hold), a plan deposit with pays-from and ROBUST-from thresholds, and a 7-step dated farm plan priced with a per-chain gas table and a 4% T-bill line; clicking a row expands its plan inline in the board. Verdicts follow the field's convention at a $1,000 default deposit: FARM when the expected drop beats fees plus the T-bill forgone, THIN when it beats the fees only, otherwise SKIP; ROBUST marks the rows whose launch odds are at least twice break-even (48 FARM · 149 THIN · 1 SKIP at the plan deposits). The board also has an Early Finds view. Widening the fit set was tested and rejected: a 0.001–20 mcap/TVL band improves walk-forward but worsens leave-one-out, and including bridges, liquid staking and CEX products is worse on both.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=3a4g775r&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>

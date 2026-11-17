# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/rayzor82/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/rayzor82/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Pre-token protocols ranked by implied value, from the sealed DefiLlama snapshot (`as_of` 2026-11-14). Model radar-2, in `lib/model.ts` (`impliedValue`):

```
implied = round( tvl_usd x 0.22
  x category tilt (0.95–1.12)
  x (1 + clamp(change_7d, -50, 80) / 100 x 0.7)
  x age factor (inverted-U, peaks at 2 years)
  x chain breadth (0.92–1.10)
  x size factor (tvl^-0.05, 0.85–1.12) )
```

Board: all 40 watchlist protocols + all 138 rankable pre-token protocols below the $50M floor = 178 rows. Live-token protocols are set aside with their market caps. Every row carries a 7-step farm plan with cost and time. The dashboard is sortable and filterable, with a detail view for each protocol.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /input/snapshot.json
```

Node 22+, standard library only, no network, deterministic.

---

<sub>Entered on [make.fun](https://make.fun/?ref=3a4g775r&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>

# Token Radar — radar-2

Pre-token protocols ranked by implied value, from the sealed
DefiLlama snapshot (`as_of` 2026-11-14). Model radar-2, in
`lib/model.ts` (`impliedValue`):

```
implied = round( tvl_usd x 0.22
  x category tilt (0.95–1.12)
  x (1 + clamp(change_7d, -50, 80) / 100 x 0.7)
  x age factor (inverted-U, peaks at 2 years)
  x chain breadth (0.92–1.10)
  x size factor (tvl^-0.05, 0.85–1.12) )
```

Board: all 40 watchlist protocols + all 138 rankable pre-token
protocols below the $50M floor = 178 rows. Live-token protocols are
set aside with their market caps. Every row carries a 7-step farm
plan with cost and time.

Run it:

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Node 22+, standard library only, no network, deterministic.

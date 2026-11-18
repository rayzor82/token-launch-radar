// Token Radar, program radar-4.
//
// Reads the sealed snapshot, fits the value curve to its own traded
// tokens, ranks every rankable pre-token protocol, and writes the
// board, the dashboard data, the dashboard files, the screenshots,
// and the dossier the make.fun gate checks.
//
//   node main.ts --input /input/snapshot.json
//   MAKEFUN_OUTPUT_DIR=out node main.ts --input /input/snapshot.json
//
// Stdlib only, no network, deterministic: the same input writes the
// same bytes every time. The output directory defaults to /output
// when MAKEFUN_OUTPUT_DIR is unset.

import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRadar, parseSnapshot, boardIssue, dataScript, MODEL_VERSION } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

/** Read one --flag value from the argument list. */
function flag(args: string[], name: string): string | null {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1]! : null;
}

/** Copy a directory's files into a fresh directory, file by file. */
function copyDir(src: string, dst: string): void {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src)) {
    const from = join(src, entry);
    if (statSync(from).isDirectory()) {
      copyDir(from, join(dst, entry));
    } else {
      copyFileSync(from, join(dst, entry));
    }
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const input = flag(args, '--input');
  if (input === null) {
    throw new Error('usage: node main.ts --input /input/snapshot.json');
  }
  const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  const root = dirname(fileURLToPath(import.meta.url));

  const raw = JSON.parse(readFileSync(input, 'utf8'));
  const snapshot = parseSnapshot(raw);
  const { rows, data } = buildRadar(snapshot);

  const issue = boardIssue(rows, snapshot);
  if (issue !== null) throw new Error(`board failed its own check: ${issue}`);

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows }, null, 2)}\n`);
  writeFileSync(join(out, 'data.js'), dataScript(data));

  const dashSrc = join(root, 'dashboard');
  const dashDst = join(out, 'dashboard');
  copyDir(dashSrc, dashDst);
  copyFileSync(join(out, 'data.js'), join(dashDst, 'data.js'));

  const shotSrc = join(root, 'screenshots');
  if (existsSync(shotSrc)) {
    copyDir(shotSrc, join(out, 'screenshots'));
  } else {
    mkdirSync(join(out, 'screenshots'), { recursive: true });
  }

  const dossier = buildDossier(out, { text_max_bytes: 65536 });
  writeFileSync(join(out, 'dossier.json'), dossier);

  const top = rows[0]!;
  const watch = new Set(snapshot.watchlist);
  const onBoard = rows.filter((r) => watch.has(r.slug)).length;
  console.log(`model ${MODEL_VERSION}: ${rows.length} rows, watchlist ${onBoard}/${snapshot.watchlist.length}`);
  console.log(`top: ${top.name} $${top.implied_value_usd.toLocaleString('en-US')}`);
  console.log(`median implied: $${data.totals.medianImpliedUsd.toLocaleString('en-US')}`);
  console.log(`fit: n=${data.fit.n} LOO x${data.fit.looMiss.toFixed(2)} (flat x${data.fit.looFlatMiss.toFixed(2)})`);
  console.log(`walk-forward 5 origins: x${data.fit.walk5Miss.toFixed(2)} (flat x${data.fit.walk5FlatMiss.toFixed(2)})`);
  console.log(`dossier: ${dossier.length} bytes`);
}

main();

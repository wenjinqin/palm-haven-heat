// Palm Haven Heat — the hand-in program.
//
// What this file does, and all it does: take the finished game (the static
// files under game/) and its screenshots (under screenshots/), copy them
// into the output directory the grader points at, and write the dossier
// the judge reads, using the kit's own dossier library so the bytes match
// what the gate rebuilds for itself.
//
//   node main.ts                          → writes to /output
//   MAKEFUN_OUTPUT_DIR=out node main.ts   → writes to ./out (local check)
//
// The caps below are the scorer's, restated: if the game ever outgrows
// them this program refuses loudly instead of handing in a dead entry.

import { existsSync, mkdirSync, readdirSync, statSync, copyFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const CAPS = {
  textBytes: 163840,        // dossier text cap the judge's outline is cut from
  maxShots: 4,              // screenshots the dossier may carry
  shotBytes: 262144,        // 256 KiB per screenshot
  gameFiles: 993,           // files + directories under game/
  gameBytes: 50331648,      // 48 MiB of game in all
  gamePathBytes: 1000,      // longest single path under game/
};

const root = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** Copy a directory tree file by file, counting entries as we go. */
function copyTree(fromDir: string, toDir: string, counter: { files: number; bytes: number }): void {
  mkdirSync(toDir, { recursive: true });
  for (const name of readdirSync(fromDir)) {
    const from = join(fromDir, name);
    const to = join(toDir, name);
    const info = statSync(from);
    if (info.isDirectory()) {
      counter.files += 1;
      copyTree(from, to, counter);
    } else if (info.isFile()) {
      counter.files += 1;
      counter.bytes += info.size;
      copyFileSync(from, to);
    }
  }
}

function main(): void {
  const gameDir = join(root, 'game');
  const shotsDir = join(root, 'screenshots');
  if (!existsSync(join(gameDir, 'index.html'))) {
    throw new Error('game/index.html is missing: there is no game to hand in');
  }

  mkdirSync(outDir, { recursive: true });

  const gameCount = { files: 0, bytes: 0 };
  copyTree(gameDir, join(outDir, 'game'), gameCount);
  if (gameCount.files > CAPS.gameFiles) throw new Error(`game/ holds ${gameCount.files} entries, over the ${CAPS.gameFiles} cap`);
  if (gameCount.bytes > CAPS.gameBytes) throw new Error(`game/ is ${gameCount.bytes} bytes, over the ${CAPS.gameBytes} cap`);

  const shotCount = { files: 0, bytes: 0 };
  if (existsSync(shotsDir)) {
    copyTree(shotsDir, join(outDir, 'screenshots'), shotCount);
  }

  const dossier = buildDossier(outDir, {
    text_max_bytes: CAPS.textBytes,
    screenshots: { max: CAPS.maxShots, max_bytes: CAPS.shotBytes },
    game_max_files: CAPS.gameFiles,
    game_max_bytes: CAPS.gameBytes,
    game_path_max_bytes: CAPS.gamePathBytes,
  });
  writeFileSync(join(outDir, 'dossier.json'), dossier);
  console.log(`handed in: ${gameCount.files} game files (${gameCount.bytes} bytes), ${shotCount.files} screenshots, dossier ${dossier.length} bytes → ${outDir}`);
}

main();

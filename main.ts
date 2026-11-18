// Palm Haven Heat — hand-in program (Node 22, standard library only).
//
// What this does, and all it does: take the finished game that lives in
// game/ beside this file, plus the maker's screenshots/ folder, copy
// both into the output directory the grader points at, and write the
// dossier the judge reads, using the kit's own buildDossier library so
// the bytes match the scorer's rebuild exactly.
//
//   node main.ts                          -> writes to /output
//   MAKEFUN_OUTPUT_DIR=out node main.ts   -> writes to ./out instead
//
// The grader runs this twice and compares the two outputs byte for
// byte, so the copy below first removes whatever a previous run left
// in the game/ and screenshots/ corners of the output: a clean slate
// every time, no stale file can leak from one run into the next.

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The caps the gate enforces, mirrored here so buildDossier refuses
// early — with a clear error — anything the scorer would refuse later.
const GATE_CAPS = {
  text_max_bytes: 163_840,
  screenshots: { max: 4, max_bytes: 262_144 },
  game_max_files: 993,
  game_max_bytes: 50_331_648,
  game_path_max_bytes: 1_000,
};

function repoRoot(): string {
  // This file sits at the repository root; game/ and screenshots/ are
  // its neighbours.
  return fileURLToPath(new URL('.', import.meta.url));
}

function outputDir(): string {
  return process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
}

function copyTreeFresh(from: string, to: string): void {
  // Remove the destination first: the second grader run must produce
  // exactly the bytes the first one did.
  rmSync(to, { recursive: true, force: true });
  mkdirSync(to, { recursive: true });
  if (existsSync(from)) {
    cpSync(from, to, { recursive: true });
  }
}

function main(): void {
  const root = repoRoot();
  const out = outputDir();
  mkdirSync(out, { recursive: true });

  copyTreeFresh(join(root, 'game'), join(out, 'game'));
  copyTreeFresh(join(root, 'screenshots'), join(out, 'screenshots'));

  const dossier = buildDossier(out, GATE_CAPS);
  writeFileSync(join(out, 'dossier.json'), dossier);
}

main();

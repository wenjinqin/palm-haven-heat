# palm-haven-heat

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/wenjinqin/palm-haven-heat/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/wenjinqin/palm-haven-heat/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Palm Haven Heat** is an open-world crime game that runs in a desktop browser from
static files — no build step, no network, no assets to download. You are Dax Marlin,
a wheelman new in the sun-soaked coastal city of Palm Haven, taking jobs from fixer
Lola Ferreira: steal the coupe, run the hot package, beat the clock, collect the
debts, and pull off the sunset getaway while the Palm Haven PD does its best to
introduce itself.

What's in the city:

- A procedural coastal city — nine-by-six blocks of pastel towers, parking lots,
  palm-lined avenues, a boardwalk, a beach and a pier — generated from one seed.
- Free roam on foot and by car, with traffic that drives the grid, brakes and
  turns, and pedestrians who stroll, hail rides, flee gunfire and dive from cars.
- Stealable, drivable cars (sedans, coupes, vans, taxis) with arcade physics,
  damage, and a synthesized engine note.
- A heat-based wanted system: crimes raise your stars, police interceptors hunt
  you across the grid, foot officers pile out to make the arrest, and hiding
  lets the heat cool.
- Gunplay, a five-mission story chain, taxi fares and courier cases for cash,
  a HUD with a live minimap, and a local save so the story waits for you.
- Every sound is synthesized live with Web Audio — engine, sirens, gunfire,
  and a slow synthwave loop. The only library is three.js, vendored minified.

## Run it

```sh
node serve.ts        # serves game/ at http://localhost:8080
# or hand it in the way the grader does:
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Then open the served page in desktop Chrome and click **New Game**.

Controls: **WASD** move/drive · **Shift** sprint · **E** enter/exit car ·
**mouse drag** camera · **hold click** aim + shoot · **R** reload ·
**Space** handbrake · **P** pause · **M** mute.

## Layout

- `main.ts` — the hand-in program: copies `game/` and `screenshots/` to the
  output directory and writes `dossier.json` with the kit's library.
- `game/index.html` — the page, HUD and screens.
- `game/src/` — the game itself, one job per file: `city.js` builds Palm Haven,
  `vehicle.js` + `traffic.js` are the cars and their drivers, `peds.js` the
  crowds, `player.js` Dax on foot, `police.js` the wanted system and the PD,
  `missions.js` the story and side jobs, `hud.js` the HUD and minimap,
  `audio.js` the synthesized sound, `save.js` the local save, `shots.js` the
  screenshot staging, `main.js` the assembly.
- `game/vendor/three.min.js` — three.js, vendored.

MIT licensed. All names, places, characters and art are original to this game.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>

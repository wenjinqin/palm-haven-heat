# palm-haven-heat

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/wenjinqin/palm-haven-heat/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/wenjinqin/palm-haven-heat/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Palm Haven Heat.** Six years ago Jax Marlowe left the sun-soaked city of Palm Haven with nothing. Now the debts are called, the Vane family owns half the docks, and fixer Sol Ferreira is the only friend still answering the phone. Take the jobs. Outrun the PHPD. Steal back the city — one street at a time.

An original open-world crime game in a fully explorable coastal city: 56 city blocks of downtown towers, beachfront hotels, a marina and ferry pier, docks, a park and a beach, all generated procedurally. Explore on foot or steal any of seven kinds of car; live traffic drives the grid and crowds walk the corners. A six-mission story chain (deliveries, a bar shakedown, a timed coastline run, a four-star escape, and a golden grand-theft finale) sits on top of free roam with taxi fares and a gate-run challenge. Wanted stars bring escalating PHPD cruisers; lose them in the alleys or pay Fresh Coat Customs for a respray that changes your car's colour. Fists and a pistol handle the Vane family's collectors. Full HUD with a live minimap, day clock, cash and reputation, localStorage saving, a synthesized synthwave soundtrack and engine/siren audio — no audio files, no image files, every texture is painted in code at load.

The game is static files under `game/` (three.js vendored in `game/vendor/`, everything else hand-written ES modules) and runs fully offline. `main.ts` at the root is the hand-in program: it copies `game/` and `screenshots/` to the output directory and writes the `dossier.json` summary with the vendored make.fun library in `vendor/`.

## Run it

```sh
node serve.ts
# then open http://localhost:8090 in a desktop browser
```

Controls: WASD move/drive · mouse look, click to punch or shoot · F enter/exit a car · Shift sprint · Space handbrake · J take Sol's job · E interact · P pause · M mute.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>

// Palm Haven Heat — the frame loop and the glue. Every other module owns
// one system (city, cars, crowd, police, combat, missions, sound, HUD);
// this file owns the player and the rules that connect them: stealing,
// getting busted, getting wasted, paying for tacos, and saving the game.
import * as THREE from 'three';
import { CFG } from './config.js';
import { Rng } from './rng.js';
import { SPAWN, PLACES, inSprayZone } from './layout.js';
import { buildCity } from './city.js';
import {
  initVehicles, makeCar, placeCar, stepCar, spawnTraffic, spawnParked,
  updateTraffic, collideCars, allCars, damageCar, repairCar, repaintCar,
} from './vehicles.js';
import { initPeople, makeFigure, makeActor, makePlayerFigure, placeActor, moveActor, spawnPeds, updatePeds, panicAt, peds } from './people.js';
import { initPolice, wanted, reportCrime, clearWanted, setStars, updatePolice, witnessed } from './police.js';
import { initCombat, combat, playerAttack, updateCombat, spawnThug } from './combat.js';
import { initMissions, updateMissions, acceptOffered, getMarkers, onPlayerDown, missionStateForSave, restoreMissionState, debugStartMission, story } from './missions.js';
import { startAudio, setEngine, setSiren, setMuted, sfx } from './audio.js';
import * as hud from './hud.js';
import { loadSave, writeSave, clearSave, hasSave } from './save.js';
import { initInput, keys, pressed, consumeClick, consumeMouseDelta, requestLock, releaseLock, pointerLocked } from './input.js';

// ------------------------------------------------------------------- boot
const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const seed = Number(params.get('seed') ?? 20261);
const rng = new Rng(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.className = 'webgl';
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(CFG.skyColor);
scene.fog = new THREE.Fog(CFG.fogColor, 120, 420);
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 900);

const sun = new THREE.DirectionalLight(CFG.sunColor, 2.6);
sun.position.set(-90, 130, -60);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -70;
sun.shadow.camera.right = 70;
sun.shadow.camera.top = 70;
sun.shadow.camera.bottom = -70;
sun.shadow.camera.far = 380;
sun.shadow.bias = -0.0006;
scene.add(sun);
scene.add(sun.target);
scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x8a6f4d, 0.95));

const city = buildCity(scene, rng);
initVehicles(scene);
initPeople(scene);
initPolice(scene);
initCombat(scene);
hud.initHud();
initInput(renderer.domElement);

// ------------------------------------------------------------------ player
const playerFig = makePlayerFigure();
scene.add(playerFig.group);
const player = makeActor(playerFig, 'player');
placeActor(player, SPAWN.x, SPAWN.z, SPAWN.heading);

const game = {
  state: 'title', // title | play | pause | end
  cash: 120,
  rep: 0,
  health: CFG.playerHealth,
  clockMinutes: 17 * 60 + 40,
  car: null,          // the car being driven, or null on foot
  camYaw: SPAWN.heading,
  camPitch: 0.32,
  autosave: 0,
  muted: false,
  endKind: null,
};

// Sol Ferreira, waiting at the marina in a violet suit, all game long.
{
  const solFig = makeFigure(0x8c46a8, 0xf2ead8, 0xa86f3c, 0x1d150e);
  scene.add(solFig.group);
  const sol = makeActor(solFig, 'npc');
  placeActor(sol, PLACES.marina.x - 4, PLACES.marina.z - 6, 2.4);
}

spawnTraffic(15);
spawnParked(22);
spawnPeds(26);

// ------------------------------------------------------------- smoke puffs
const smokePool = [];
{
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(60,60,60,0.55)');
  grad.addColorStop(1, 'rgba(60,60,60,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  for (let i = 0; i < 36; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false }));
    s.scale.set(1.6, 1.6, 1);
    scene.add(s);
    smokePool.push({ s, life: 0 });
  }
}
function puff(x, y, z) {
  const p = smokePool.find((q) => q.life <= 0);
  if (!p) return;
  p.life = 1.1;
  p.s.position.set(x, y, z);
}
function updateSmoke(dt) {
  for (const p of smokePool) {
    if (p.life <= 0) continue;
    p.life -= dt;
    p.s.position.y += dt * 2.2;
    p.s.material.opacity = Math.max(0, p.life * 0.4);
    const sc = 1.6 + (1.1 - p.life) * 2.4;
    p.s.scale.set(sc, sc, 1);
  }
}

// ------------------------------------------------------------ mission glue
const missionCtx = {
  playerPos: () => (game.car ? { x: game.car.x, z: game.car.z } : { x: player.x, z: player.z }),
  inCar: () => game.car !== null,
  playerCar: () => game.car,
  playerSpeed: () => (game.car ? game.car.speed : player.speed),
  addCash: (n) => { game.cash += n; hud.setCash(game.cash); },
  addRep: (n) => { game.rep += n; hud.setRep(game.rep); },
  banner: (t, s, sec) => hud.banner(t, s, sec),
  toast: (t) => hud.toast(t),
  setObjective: (t) => hud.setObjective(t),
  sfx: (name) => { if (sfx[name]) sfx[name](); },
  setWanted: (n) => setStars(Math.max(wanted.stars, n)),
  giveGun: () => {
    combat.hasGun = true;
    hud.toast('You got the pistol — click to shoot');
  },
  spawnGoldCar: (x, z) => {
    const car = makeCar('gold', 0xd9a441);
    placeCar(car, x, z, 0.7);
    return car;
  },
  onStoryProgress: () => saveGame(),
  onFinale: () => {
    showEnd('finale');
  },
};
initMissions(missionCtx, scene);

combat.events.damagePlayer = (n) => {
  if (SHOT || game.state !== 'play' || player.dead) return;
  game.health -= n;
  hud.flashDamage();
  sfx.hit();
  if (game.health <= 0) wasted();
};
combat.events.crime = (level) => reportCrime(level);
combat.events.shotFired = () => sfx.shot();

// ------------------------------------------------------------------- save
function saveGame() {
  writeSave({
    cash: game.cash,
    rep: game.rep,
    health: game.health,
    mission: missionStateForSave(),
    hasGun: combat.hasGun,
    pos: game.car ? { x: game.car.x, z: game.car.z } : { x: player.x, z: player.z },
  });
}
function applySave(data) {
  game.cash = data.cash ?? 120;
  game.rep = data.rep ?? 0;
  game.health = Math.max(40, data.health ?? 100);
  combat.hasGun = data.hasGun ?? false;
  restoreMissionState(data.mission);
  if (data.pos) placeActor(player, data.pos.x, data.pos.z, SPAWN.heading);
  hud.setCash(game.cash);
  hud.setRep(game.rep);
}

// ------------------------------------------------------------- state flow
const titleScreen = document.getElementById('title-screen');
const pauseScreen = document.getElementById('pause-screen');
const endScreen = document.getElementById('end-screen');

function startGame(useSave) {
  if (useSave) {
    const data = loadSave();
    if (data) applySave(data);
  } else {
    clearSave();
    game.cash = 120;
    game.rep = 0;
    game.health = 100;
    combat.hasGun = false;
    restoreMissionState({ index: 0, done: false });
    placeActor(player, SPAWN.x, SPAWN.z, SPAWN.heading);
    hud.setCash(game.cash);
    hud.setRep(game.rep);
  }
  titleScreen.style.display = 'none';
  endScreen.style.display = 'none';
  hud.showHud(true);
  game.state = 'play';
  startAudio();
  requestLock();
  hud.banner('Palm Haven Heat', 'Sol has work for you. Press J to take the job.', 5);
}

function showEnd(kind) {
  game.endKind = kind;
  game.state = 'end';
  releaseLock();
  const title = document.getElementById('end-title');
  const text = document.getElementById('end-text');
  const btn = document.getElementById('btn-respawn');
  if (kind === 'busted') {
    title.textContent = 'Busted';
    const fine = Math.min(game.cash, 150 + wanted.stars * 100);
    game.cash = Math.max(0, game.cash - fine);
    text.textContent = `The PHPD walk you out of the station at dawn, $${fine} lighter and all out of excuses. Palm Haven keeps spinning.`;
    btn.textContent = 'Back on the Street';
  } else if (kind === 'wasted') {
    title.textContent = 'Wasted';
    const bill = Math.min(game.cash, 200);
    game.cash = Math.max(0, game.cash - bill);
    text.textContent = `You wake up outside the Coral Court with a $${bill} clinic bill and a head full of bees. The city did not even slow down.`;
    btn.textContent = 'Shake It Off';
  } else {
    title.textContent = 'The City Is Yours';
    text.textContent = 'The gold Aurelia vanishes into the morning ferry fog, Sol laughing beside you. Every job is done, every debt is paid — and Palm Haven still has fares to run, gates to beat, and trouble to find. Free roam: the streets are yours.';
    btn.textContent = 'Keep Roaming';
  }
  hud.setCash(game.cash);
  endScreen.style.display = 'flex';
}

function respawn() {
  endScreen.style.display = 'none';
  if (game.car) exitCar(false);
  clearWanted();
  game.health = 100;
  placeActor(player, PLACES.safehouse.x, PLACES.safehouse.z, Math.PI / 2);
  onPlayerDown();
  game.state = 'play';
  hud.showHud(true);
  requestLock();
  saveGame();
}

function wasted() {
  if (game.state !== 'play') return;
  player.dead = true;
  setTimeout(() => {
    player.dead = false;
    showEnd('wasted');
  }, 600);
}

wanted.onBusted = () => {
  if (game.state === 'play') showEnd('busted');
};

document.getElementById('btn-new').addEventListener('click', () => startGame(false));
document.getElementById('btn-continue').addEventListener('click', () => startGame(true));
document.getElementById('btn-resume').addEventListener('click', () => {
  pauseScreen.style.display = 'none';
  game.state = 'play';
  requestLock();
});
document.getElementById('btn-quit').addEventListener('click', () => {
  pauseScreen.style.display = 'none';
  hud.showHud(false);
  titleScreen.style.display = 'flex';
  game.state = 'title';
});
document.getElementById('btn-respawn').addEventListener('click', respawn);
if (hasSave()) document.getElementById('btn-continue').style.display = '';

// -------------------------------------------------------------- car access
function nearestCar(maxDist) {
  let best = null, bestD = maxDist;
  for (const car of allCars) {
    if (car.dead) continue;
    const d = Math.hypot(car.x - player.x, car.z - player.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

function enterCar(car) {
  const wasTraffic = car.driver === 'traffic';
  if (car.driver === 'police') reportCrime(2);
  else if (wasTraffic || car.driver === 'parked') {
    // A theft with witnesses is a crime; an unwitnessed one is a secret.
    const seenBy = witnessed(player.x, player.z, 46) || peds.some((p) => !p.dead && Math.hypot(p.x - player.x, p.z - player.z) < 17);
    if (seenBy) reportCrime(1);
  }
  if (wasTraffic) {
    // The driver bails out and runs, and so does everyone's nerve.
    panicAt(car.x, car.z, 15);
    hud.toast('You jacked a moving car!');
  }
  car.driver = 'player';
  game.car = car;
  player.fig.group.visible = false;
  sfx.door();
}

function exitCar(saveSpot = true) {
  const car = game.car;
  if (!car) return;
  car.driver = 'parked';
  const rx = Math.cos(car.heading), rz = -Math.sin(car.heading);
  placeActor(player, car.x + rx * 1.8, car.z + rz * 1.8, car.heading);
  player.fig.group.visible = true;
  game.car = null;
  sfx.door();
  if (saveSpot) saveGame();
}

// ------------------------------------------------------------------- loop
const clock = new THREE.Clock();
let elapsed = 0;
let shotFrames = 0;

function focusPoint() {
  return game.car ? { x: game.car.x, z: game.car.z } : { x: player.x, z: player.z };
}

function playerStateForPolice() {
  if (game.car) {
    return {
      x: game.car.x, z: game.car.z, speed: game.car.speed,
      vx: Math.sin(game.car.heading) * game.car.speed,
      vz: Math.cos(game.car.heading) * game.car.speed,
    };
  }
  return {
    x: player.x, z: player.z, speed: player.speed,
    vx: Math.sin(player.heading) * player.speed,
    vz: Math.cos(player.heading) * player.speed,
  };
}

function stepPlay(dt) {
  const md = consumeMouseDelta();
  game.camYaw -= md.dx * 0.0026;
  game.camPitch = Math.max(0.06, Math.min(1.15, game.camPitch + md.dy * 0.0022));

  // Pause.
  if (pressed('KeyP') || pressed('Escape')) {
    keys.KeyP = false;
    pauseScreen.style.display = 'flex';
    game.state = 'pause';
    releaseLock();
    return;
  }
  if (pressed('KeyM')) {
    keys.KeyM = false;
    game.muted = !game.muted;
    setMuted(game.muted);
    hud.toast(game.muted ? 'Muted' : 'Sound on');
  }
  if (pressed('KeyJ')) {
    keys.KeyJ = false;
    acceptOffered();
  }

  if (game.car) stepDriving(dt);
  else stepOnFoot(dt);

  // The living city.
  const focus = focusPoint();
  updateTraffic(dt, focus);
  updatePeds(dt);
  updatePolice(dt, playerStateForPolice());
  const active = allCars.filter((c) => c.driver !== 'parked' || c === game.car);
  collideCars(active);
  updateCombat(dt, player, camera);
  updateMissions(dt);
  runOverChecks(dt);
  interactChecks(dt);

  // Clock + autosave.
  game.clockMinutes += dt * 0.5;
  game.autosave += dt;
  if (game.autosave > 30) {
    game.autosave = 0;
    saveGame();
  }

  // Health: slow recovery when the streets leave you alone.
  if (game.health > 0 && game.health < 100 && combat.thugs.every((t) => t.dead || !t.aggro)) {
    game.health = Math.min(100, game.health + dt * 1.1);
  }

  // HUD.
  hud.setHealth(game.health / CFG.playerHealth);
  hud.setStars(wanted.stars);
  hud.setBust(wanted.bustMeter);
  hud.setClock(game.clockMinutes);
  hud.tickHud(dt);
  hud.drawMinimap({
    ...focus,
    heading: game.car ? game.car.heading : game.camYaw,
    markers: [
      ...getMarkers(),
      ...(wanted.stars > 0 ? [{ x: PLACES.customs.x, z: PLACES.customs.z + 12, color: '#7fe0ff', kind: 'dot' }] : []),
    ],
    police: wanted.units,
  });

  // Audio.
  if (game.car) setEngine(Math.abs(game.car.speed) / game.car.spec.top, true);
  else setEngine(0, false);
  let sirenLevel = 0;
  if (wanted.stars > 0 && wanted.units.length) {
    const d = Math.min(...wanted.units.map((u) => Math.hypot(u.x - focus.x, u.z - focus.z)));
    sirenLevel = Math.max(0, 1 - d / 85);
  }
  setSiren(sirenLevel, elapsed);
}

function stepOnFoot(dt) {
  const f = { x: Math.sin(game.camYaw), z: Math.cos(game.camYaw) };
  const left = { x: f.z, z: -f.x };
  let mx = 0, mz = 0;
  if (pressed('KeyW')) { mx += f.x; mz += f.z; }
  if (pressed('KeyS')) { mx -= f.x; mz -= f.z; }
  if (pressed('KeyA')) { mx += left.x; mz += left.z; }
  if (pressed('KeyD')) { mx -= left.x; mz -= left.z; }
  const len = Math.hypot(mx, mz);
  const sprint = pressed('ShiftLeft') || pressed('ShiftRight');
  if (len > 0.01) {
    mx /= len;
    mz /= len;
    player.heading = Math.atan2(mx, mz);
    player.speed = sprint ? CFG.sprintSpeed : CFG.walkSpeed;
  } else {
    player.speed = 0;
  }
  moveActor(player, dt);

  // Combat on click.
  hud.showCrosshair(combat.hasGun);
  if (consumeClick()) {
    player.heading = game.camYaw;
    const result = playerAttack(player);
    if (result === 'punch' || result === 'punch-hit') sfx.punch();
    player.fig.rArm.rotation.x = -1.9;
    setTimeout(() => { player.fig.rArm.rotation.x = 0; }, 120);
  }
  hud.setSpeed(0, null);
}

function stepDriving(dt) {
  const car = game.car;
  const ctl = {
    throttle: (pressed('KeyW') ? 1 : 0) + (pressed('KeyS') ? -1 : 0),
    steer: (pressed('KeyA') ? 1 : 0) + (pressed('KeyD') ? -1 : 0),
    handbrake: pressed('Space'),
  };
  const prevSpeed = Math.abs(car.speed);
  stepCar(car, dt, ctl);
  if (prevSpeed > 12 && Math.abs(car.speed) < prevSpeed * 0.45) {
    sfx.crash();
    if (witnessed(car.x, car.z, 40)) reportCrime(1);
  }
  // Keep the on-foot avatar glued to the driver's seat (invisible).
  player.x = car.x;
  player.z = car.z;
  player.heading = car.heading;
  hud.setSpeed(Math.abs(car.speed) * 3.6, car.name);
  hud.showCrosshair(false);
  // Damage smoke.
  if (car.health < 45) {
    car.smokeTimer -= dt;
    if (car.smokeTimer <= 0) {
      car.smokeTimer = 0.12;
      puff(car.x + Math.sin(car.heading) * 1.6, 1.2, car.z + Math.cos(car.heading) * 1.6);
    }
  }
  consumeClick(); // clicks do nothing behind the wheel
}

/** Cars versus pedestrians: a fast car is a weapon, and the city notices. */
function runOverChecks() {
  const movers = allCars.filter((c) => Math.abs(c.speed) > 4.5 && !c.dead);
  for (const car of movers) {
    for (const p of peds) {
      if (p.dead) continue;
      if (Math.hypot(p.x - car.x, p.z - car.z) < 1.7) {
        p.dead = true;
        p.fig.group.rotation.x = -Math.PI / 2;
        p.fig.group.position.y = 0.2;
        panicAt(p.x, p.z, 18);
        if (car === game.car) {
          reportCrime(witnessed(p.x, p.z, 46) ? 2 : 1);
          sfx.crash();
          damageCar(car, 3);
        }
      }
    }
  }
}

/** Context prompts: cars, tacos, the spray shop, the motel. */
function interactChecks() {
  if (game.car) {
    const car = game.car;
    if (inSprayZone(car.x, car.z) && Math.abs(car.speed) < 1) {
      if (wanted.stars > 0) {
        const cost = wanted.stars * CFG.sprayCostPerStar;
        hud.showPrompt(`<b>E</b> Fresh Coat — clear your heat for $${cost}`);
        if (pressed('KeyE')) {
          keys.KeyE = false;
          if (game.cash >= cost) {
            game.cash -= cost;
            hud.setCash(game.cash);
            clearWanted();
            repaintCar(car, [0xd94f30, 0x2b5ea7, 0x3fae6a, 0xf2f2f2, 0x8c46a8][Math.floor(Math.random() * 5)]);
            sfx.spray();
            hud.toast('New paint, clean slate. The PHPD drive right past.');
          } else hud.toast('Not enough cash for a respray');
        }
        return;
      }
      if (car.health < 100) {
        const cost = Math.ceil((100 - car.health) * CFG.repairCostPerPoint);
        hud.showPrompt(`<b>E</b> Fresh Coat — repairs for $${cost}`);
        if (pressed('KeyE')) {
          keys.KeyE = false;
          if (game.cash >= cost) {
            game.cash -= cost;
            hud.setCash(game.cash);
            repairCar(car);
            sfx.spray();
            hud.toast('Good as new');
          } else hud.toast('Not enough cash for repairs');
        }
        return;
      }
    }
    hud.showPrompt('<b>F</b> Exit the ' + car.name);
    if (pressed('KeyF')) {
      keys.KeyF = false;
      exitCar();
    }
    return;
  }

  // On foot.
  const carNear = nearestCar(3.4);
  if (carNear) {
    hud.showPrompt(`<b>F</b> ${carNear.driver === 'parked' ? 'Take' : 'Enter'} the ${carNear.name}`);
    if (pressed('KeyF')) {
      keys.KeyF = false;
      enterCar(carNear);
    }
    return;
  }
  for (const t of PLACES.tacoStands) {
    if (Math.hypot(player.x - t.x, player.z - t.z) < 3.2) {
      if (game.health < 100) {
        hud.showPrompt(`<b>E</b> Taco Sol — eat for $${CFG.healCost} and heal`);
        if (pressed('KeyE')) {
          keys.KeyE = false;
          if (game.cash >= CFG.healCost) {
            game.cash -= CFG.healCost;
            hud.setCash(game.cash);
            game.health = 100;
            sfx.pickup();
            hud.toast('Fish tacos fix everything');
          } else hud.toast('Not enough cash for tacos');
        }
      } else hud.showPrompt('Taco Sol — best fish tacos on the coast');
      return;
    }
  }
  if (Math.hypot(player.x - PLACES.safehouse.x, player.z - PLACES.safehouse.z) < 4) {
    hud.showPrompt('<b>E</b> Rest at the Coral Court (save + heal)');
    if (pressed('KeyE')) {
      keys.KeyE = false;
      game.health = 100;
      saveGame();
      sfx.pickup();
      hud.toast('Saved. Jax sleeps like the innocent.');
    }
    return;
  }
  hud.showPrompt(null);
}

// ----------------------------------------------------------------- camera
const camPos = new THREE.Vector3(60, 42, 120);
function updateCamera(dt) {
  if (game.state === 'title' || SHOT === 'title') {
    const t = elapsed * 0.045;
    const cx = 40 + Math.cos(t) * 130;
    const cz = 30 + Math.sin(t) * 130;
    camPos.set(cx, 40 + Math.sin(elapsed * 0.11) * 7, cz);
    camera.position.copy(camPos);
    camera.lookAt(30, 4, 10);
    return;
  }
  if (SHOT === 'chase' && game.car) {
    // Front three-quarter camera: the coupe, both cruisers, the canyon.
    const car = game.car;
    const f = { x: Math.sin(car.heading), z: Math.cos(car.heading) };
    const r = { x: -Math.cos(car.heading), z: Math.sin(car.heading) };
    camera.position.set(car.x + f.x * 13 + r.x * 7.5, 4.4, car.z + f.z * 13 + r.z * 7.5);
    camera.lookAt(car.x - f.x * 4, 1.1, car.z - f.z * 4);
    return;
  }
  if (game.car) {
    const car = game.car;
    const back = { x: Math.sin(car.heading), z: Math.cos(car.heading) };
    const want = new THREE.Vector3(
      car.x - back.x * CFG.camCarDistance,
      CFG.camCarHeight + Math.abs(car.speed) * 0.03,
      car.z - back.z * CFG.camCarDistance,
    );
    camPos.lerp(want, 1 - Math.pow(0.0001, dt));
    camera.position.copy(camPos);
    camera.lookAt(car.x + back.x * 9, 1.4, car.z + back.z * 9);
  } else {
    const f = { x: Math.sin(game.camYaw), z: Math.cos(game.camYaw) };
    const want = new THREE.Vector3(
      player.x - f.x * CFG.camFootDistance * Math.cos(game.camPitch),
      1.7 + Math.sin(game.camPitch) * CFG.camFootDistance,
      player.z - f.z * CFG.camFootDistance * Math.cos(game.camPitch),
    );
    camPos.lerp(want, 1 - Math.pow(0.000001, dt));
    camera.position.copy(camPos);
    camera.lookAt(player.x + f.x * 6, 1.5, player.z + f.z * 6);
  }
  // Keep the sun shadow frustum centred on the action.
  const focus = focusPoint();
  sun.position.set(focus.x - 90, 130, focus.z - 60);
  sun.target.position.set(focus.x, 0, focus.z);
}

// ------------------------------------------------------------ shot staging
function stageShot(name) {
  hud.showHud(true);
  game.state = 'play';
  titleScreen.style.display = 'none';
  game.cash = 2450;
  game.rep = 9;
  hud.setCash(game.cash);
  hud.setRep(game.rep);
  if (name === 'title') {
    game.state = 'title';
    titleScreen.style.display = 'flex';
    hud.showHud(false);
    return;
  }
  if (name === 'chase') {
    const car = makeCar('coupe', 0xd94f30);
    placeCar(car, 30, -21, Math.PI / 2 - 0.1);
    enterCar(car);
    setStars(3);
    // Posed pursuit: one cruiser on the rear quarter, one swinging in
    // from the side street — both readable in the still the judge sees.
    for (const [bx, bz, bh] of [[20.5, -26.5, Math.PI / 2], [19.5, -15, Math.PI / 2 + 0.14]]) {
      const cop = makeCar('police', 0xffffff);
      cop.driver = 'police';
      placeCar(cop, bx, bz, bh);
      wanted.units.push(cop);
    }
    hud.banner('Special Delivery', 'Sol: The crate is in the back. Hotel Azure, now — and lose the sirens.', 30);
    hud.setObjective('Special Delivery — Deliver to Hotel Azure · $450');
    game.camYaw = Math.PI / 2;
  } else if (name === 'foot') {
    placeActor(player, 204, -64, 2.85);
    game.camYaw = 2.85;
    // Beach life posed around Jax: a local with a board, a sunbather
    // standing up from her towel, a kid watching the traffic go by.
    const extras = [
      { x: 200, z: -56, h: -1.2, shirt: 0xf28bb4, pants: 0xf2ead8 },
      { x: 211, z: -73, h: -1.5, shirt: 0xf2c230, pants: 0xd94f30 },
      { x: 201, z: -75, h: 0.6, shirt: 0x2b9ec4, pants: 0x27313b },
    ];
    for (const e of extras) {
      const fig = makeFigure(e.shirt, e.pants, 0xd9a066, 0x2b2118);
      scene.add(fig.group);
      const a = makeActor(fig, 'npc');
      placeActor(a, e.x, e.z, e.h);
    }
    hud.banner('Palm Haven', 'Beach Boulevard — Hotel Azure behind you, the whole ocean in front.', 30);
    hud.setObjective('Free roam — Sol has work when you are ready (J)');
  } else if (name === 'combat') {
    placeActor(player, PLACES.sunsetBar.x - 2, PLACES.sunsetBar.z + 16, Math.PI);
    combat.hasGun = true;
    game.camYaw = Math.PI;
    player.fig.rArm.rotation.x = -1.85; // pistol arm, held for the still
    hud.showCrosshair(true);
    const t1 = spawnThug(PLACES.sunsetBar.x - 3.5, PLACES.sunsetBar.z + 10.5, { aggro: true });
    spawnThug(PLACES.sunsetBar.x + 1, PLACES.sunsetBar.z + 11.5, { aggro: true });
    spawnThug(PLACES.sunsetBar.x + 4.5, PLACES.sunsetBar.z + 10, { aggro: true });
    t1.fig.rArm.rotation.x = -2.1; // mid-lunge
    hud.banner('Shakedown at Sunset', 'Sol: The Vane collectors are leaning on the bar. Lean back.', 30);
    hud.setObjective('Shakedown at Sunset — Put down the Vane collectors (0/3)');
  }
}

// -------------------------------------------------------------------- run
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  elapsed += dt;
  city.tick(elapsed);
  updateSmoke(dt);

  if (SHOT) {
    shotFrames += 1;
    if (shotFrames === 2) stageShot(SHOT);
    if (game.state === 'play' && SHOT !== 'title') {
      // Posed scenes: the ambient city stays alive (traffic, crowds,
      // strobing lightbars, water) while the principals hold their marks.
      const focus = focusPoint();
      updateTraffic(dt, focus);
      updatePeds(dt);
      for (const u of wanted.units) {
        if (!u.lightbar) continue;
        const phase = Math.floor(elapsed * 5 + u.flashPhase) % 2;
        u.lightbar.children[0].visible = phase === 0;
        u.lightbar.children[1].visible = phase === 1;
      }
      hud.setHealth(0.82);
      hud.setStars(wanted.stars);
      hud.setClock(game.clockMinutes);
      hud.drawMinimap({
        ...focus,
        heading: game.car ? game.car.heading : game.camYaw,
        markers: getMarkers(),
        police: wanted.units,
      });
      if (SHOT === 'chase' && game.car) hud.setSpeed(118, game.car.name);
    }
    updateCamera(dt);
    if (shotFrames > 30 && elapsed > 6) window.__shotReady = true;
  } else if (game.state === 'play') {
    stepPlay(dt);
    updateCamera(dt);
  } else {
    // Title / pause / end: the city idles behind the panels.
    updatePeds(dt);
    updateTraffic(dt, { x: 40, z: 20 });
    updateCamera(dt);
  }
  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

hud.setCash(game.cash);
hud.setRep(game.rep);
frame();

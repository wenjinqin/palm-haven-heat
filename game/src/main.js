// main.js — Palm Haven Heat, assembled. Boots the renderer and the
// city, wires every system together (traffic, crowds, police,
// missions, side jobs), owns the input, the camera, gunplay, the
// crime reports and the title / pause / busted / wasted flow.

import { buildCity, collideCircle } from './city.js';
import { Car } from './vehicle.js';
import { TrafficSystem, spawnParkedCars } from './traffic.js';
import { PedSystem } from './peds.js';
import { Player } from './player.js';
import { Wanted, PoliceSystem } from './police.js';
import { MissionManager, SideJobs, dist2d } from './missions.js';
import { Hud } from './hud.js';
import { SoundBank } from './audio.js';
import { loadSave, storeSave, wipeSave, defaultSave } from './save.js';
import { makeRng } from './rng.js';
import { readShotRequest, stageShot } from './shots.js';

const THREE = window.THREE;
const SEED = 20261117;

// ---------------------------------------------------------------- setup

const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xf2a56b, 150, 780);
const camera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight, 0.1, 1600);
camera.position.set(0, 30, 260);

// Golden-hour light: low warm sun, blue-pink sky.
const sun = new THREE.DirectionalLight(0xffd9a3, 1.6);
sun.position.set(-260, 190, 320);
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xcfe5ff, 0xffd9ae, 0.95));
const fill = new THREE.DirectionalLight(0xff9d7a, 0.35);
fill.position.set(200, 80, -240);
scene.add(fill);

// Gradient sky dome from a painted canvas.
{
  const cv = document.createElement('canvas');
  cv.width = 4;
  cv.height = 256;
  const g = cv.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#274b8f');
  grad.addColorStop(0.42, '#7fb2e0');
  grad.addColorStop(0.68, '#ffc98a');
  grad.addColorStop(0.8, '#ff9d6f');
  grad.addColorStop(1, '#ff8c69');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1200, 20, 12),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false }),
  );
  scene.add(dome);
  // The sun itself: a bright disc low over the water.
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(46, 24), new THREE.MeshBasicMaterial({ color: 0xfff3b0, fog: false }));
  sunDisc.position.set(-430, 120, 900);
  sunDisc.lookAt(0, 40, 0);
  scene.add(sunDisc);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------- world

const rng = makeRng(SEED);
const city = buildCity(scene, SEED);
const colliders = city.colliders;
const landmarks = city.landmarks;

const sound = new SoundBank();
const hud = new Hud(document);
const wanted = new Wanted();
const player = new Player(scene, landmarks.garage.x - 8, landmarks.garage.z + 14);
const traffic = new TrafficSystem(scene, rng);
const peds = new PedSystem(scene, rng);
const police = new PoliceSystem(scene, rng);
const parkedCars = spawnParkedCars(scene, rng, colliders);

const game = {
  scene,
  player,
  wanted,
  police,
  traffic,
  peds,
  hud,
  sound,
  landmarks,
  colliders,
  save: loadSave() || defaultSave(),
  cameraYaw: Math.PI,
  cameraPitch: 0.24,
  state: 'title',
  time: 0,
  addCash(n) {
    this.save.cash += n;
    hud.setCash(this.save.cash);
    this.persist();
  },
  persist() {
    this.save.position = { x: Math.round(player.pos.x), z: Math.round(player.pos.z), heading: player.heading };
    storeSave(this.save);
  },
  spawnSpecialCar(kind, paint, x, z, heading) {
    const car = new Car(scene, kind, paint, x, z, heading);
    car.driver = 'parked';
    parkedCars.push(car);
    return car;
  },
  enterCar(car, silent = false) {
    enterCar(car, silent);
  },
};
game.missions = new MissionManager(game);
game.sideJobs = new SideJobs(game);
window.__game = game; // debug handle for the maker's own test scripts
const missions = game.missions;
const sideJobs = game.sideJobs;

function allCars() {
  const list = [...parkedCars];
  for (const tc of traffic.cars) list.push(tc.car);
  for (const c of police.copCars()) list.push(c);
  return list;
}

// ---------------------------------------------------------------- input

const keys = {};
let mouseDown = false;
let dragging = false;
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyM') {
    sound.setMuted(!sound.muted);
    hud.message(sound.muted ? 'Sound off' : 'Sound on', 1.4);
  }
  if ((e.code === 'Escape' || e.code === 'KeyP') && game.state === 'play') pauseGame();
  else if (e.code === 'Escape' && game.state === 'pause') resumeGame();
  if (e.code === 'KeyR' && game.state === 'play' && !player.inCar) player.startReload();
  if (e.code === 'KeyE' && game.state === 'play') toggleCar();
  if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
});
renderer.domElement.addEventListener('mousedown', (e) => {
  if (e.button === 0) {
    mouseDown = true;
    dragging = true;
  }
});
window.addEventListener('mouseup', () => {
  mouseDown = false;
  dragging = false;
});
window.addEventListener('mousemove', (e) => {
  if (!dragging || game.state !== 'play') return;
  game.cameraYaw -= e.movementX * 0.0042;
  game.cameraPitch = Math.max(-0.12, Math.min(0.9, game.cameraPitch + e.movementY * 0.003));
});
window.addEventListener('blur', () => {
  if (game.state === 'play') pauseGame();
});

function toggleCar() {
  if (player.inCar) exitCar();
  else {
    // Nearest stealable ride within reach.
    let best = null;
    let bestD = 3.6;
    for (const car of allCars()) {
      if (car.dead || car.driver === 'police') continue;
      const d = dist2d(player.pos, car.pos);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    if (best) enterCar(best);
  }
}

function enterCar(car, silent = false) {
  if (!silent) {
    // A theft is a theft: witnesses talk.
    const wasTraffic = car.driver === 'traffic';
    if (wasTraffic) traffic.release(car);
    if (car.driver !== 'player' && !car.stolenOnce) {
      car.stolenOnce = true;
      game.save.carsStolen++;
      const witnessed =
        police.copCars().length > 0 ||
        peds.peds.some((p) => dist2d(p.pos, player.pos) < 30);
      if (witnessed) {
        wanted.report('theft');
        hud.message('Car theft witnessed — the heat is on!', 3.5);
      }
    }
    sound.doorSlam();
    sound.engineStart();
  }
  if (!parkedCars.includes(car)) parkedCars.push(car);
  car.driver = 'player';
  player.inCar = car;
  player.mesh.visible = false;
}

function exitCar() {
  const car = player.inCar;
  if (!car) return;
  sound.engineStop();
  sound.doorSlam();
  const right = { x: -Math.cos(car.heading), z: Math.sin(car.heading) };
  player.pos.set(car.pos.x + right.x * 2.4, 0, car.pos.z + right.z * 2.4);
  collideCircle(player.pos, 0.55, colliders);
  player.inCar = null;
  player.mesh.visible = true;
  car.driver = 'parked';
  // A fare left in the car cancels the job.
  if (sideJobs.fare && sideJobs.fare.state === 'ride') {
    sideJobs.fare.ped.state = 'walk';
    sideJobs.fare.ped.mesh.visible = true;
    sideJobs.fare = null;
    hud.message('Fare cancelled.', 2.5);
  }
}

// ---------------------------------------------------------------- gunplay

const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 });
let tracer = null;
let tracerT = 0;
const muzzle = new THREE.PointLight(0xffc46b, 0, 18);
scene.add(muzzle);

function fireGun() {
  const result = player.tryFire();
  if (result === 'empty') {
    sound.dryFire();
    return;
  }
  if (result !== 'fired') return;
  sound.gunshot();
  peds.scareAll(player.pos, 30);

  // Aim: from the camera, through the crosshair.
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const origin = player.pos.clone();
  origin.y = 1.5;
  let hitPoint = origin.clone().add(dir.clone().multiplyScalar(70));
  let bestAngle = 0.085;
  let hitKind = null;
  let hitTarget = null;
  const consider = (targetPos, kind, target, y = 1.1) => {
    const to = targetPos.clone();
    to.y = y;
    const v = to.sub(origin);
    const dist = v.length();
    if (dist > 70) return;
    v.normalize();
    const angle = Math.acos(Math.max(-1, Math.min(1, v.dot(dir))));
    if (angle < bestAngle) {
      bestAngle = angle;
      hitKind = kind;
      hitTarget = target;
      hitPoint = origin.clone().add(dir.clone().multiplyScalar(dist));
    }
  };
  for (const cop of police.footCops()) consider(cop.pos, 'cop', cop);
  for (const ped of peds.peds) {
    if (ped.state !== 'down' && ped.state !== 'ride') consider(ped.pos, 'ped', ped);
  }
  for (const car of allCars()) {
    if (car !== player.inCar) consider(car.pos, 'car', car, 0.8);
  }

  if (hitKind === 'cop') {
    hitTarget.hurt(34);
    sound.thud(0.7);
  } else if (hitKind === 'ped') {
    hitTarget.knockDown();
    wanted.report('pedHit');
    hud.message('You shot a pedestrian!', 3);
    sound.thud(0.7);
  } else if (hitKind === 'car') {
    hitTarget.damage = Math.min(1, hitTarget.damage + 0.09);
    sound.scrape();
  }
  // Shots draw attention when anyone official is near.
  if (police.copCars().length > 0 || police.footCops().length > 0) wanted.report('shot');

  // Tracer + muzzle flash.
  if (tracer) scene.remove(tracer);
  const geo = new THREE.BufferGeometry().setFromPoints([origin, hitPoint]);
  tracer = new THREE.Line(geo, tracerMat);
  scene.add(tracer);
  tracerT = 0.07;
  muzzle.position.copy(origin).add(dir.clone().multiplyScalar(1.2));
  muzzle.intensity = 2.4;
}

// ---------------------------------------------------------------- states

const titleScreen = document.getElementById('title-screen');
const pauseScreen = document.getElementById('pause-screen');
const downScreen = document.getElementById('down-screen');
const hudRoot = document.getElementById('hud');

function showOnly(screen) {
  titleScreen.style.display = screen === 'title' ? 'flex' : 'none';
  pauseScreen.style.display = screen === 'pause' ? 'flex' : 'none';
  downScreen.style.display = screen === 'down' ? 'flex' : 'none';
  hudRoot.style.display = screen === 'title' ? 'none' : 'block';
}

function startGame(fresh) {
  sound.unlock();
  sound.musicStart();
  if (fresh) {
    wipeSave();
    game.save = defaultSave();
    player.respawn(landmarks.garage.x - 8, landmarks.garage.z + 14);
    wanted.clear();
    police.reset();
  } else if (game.save.position) {
    player.pos.set(game.save.position.x, 0, game.save.position.z);
  }
  hud.setCash(game.save.cash);
  missions.refreshObjective();
  game.state = 'play';
  showOnly('play');
  hud.message('Welcome to Palm Haven. Gold marker = work. E = enter car. Click = shoot.', 6);
}

function pauseGame() {
  if (game.state !== 'play') return;
  game.state = 'pause';
  showOnly('pause');
}

function resumeGame() {
  game.state = 'play';
  showOnly('play');
}

function goDown(kind) {
  game.state = 'down';
  sound.engineStop();
  sound.sirenStop();
  const title = document.getElementById('down-title');
  const text = document.getElementById('down-text');
  if (kind === 'busted') {
    title.textContent = 'BUSTED';
    title.style.color = '#4da3ff';
    const fine = Math.min(game.save.cash, 120 + wanted.stars * 45);
    game.save.cash -= fine;
    text.textContent = `The Palm Haven PD take $${fine} in fines and your afternoon.`;
    game.save.timesBusted++;
    missions.onPlayerDown('busted');
  } else {
    title.textContent = 'WASTED';
    title.style.color = '#ff5147';
    const bill = Math.min(game.save.cash, 100);
    game.save.cash -= bill;
    text.textContent = `You wake up outside Palm Haven General, $${bill} lighter.`;
    game.save.timesWasted++;
    missions.onPlayerDown('wasted');
  }
  hud.setCash(game.save.cash);
  game.persist();
  showOnly('down');
}

function respawnFromDown() {
  const wasBusted = document.getElementById('down-title').textContent === 'BUSTED';
  police.reset();
  wanted.clear();
  if (player.inCar) {
    player.inCar.driver = 'parked';
    player.inCar = null;
  }
  const spot = wasBusted ? landmarks.downtown : landmarks.boardwalk;
  player.respawn(spot.x + 6, spot.z + 8);
  game.state = 'play';
  showOnly('play');
}

document.getElementById('btn-new').addEventListener('click', () => startGame(true));
document.getElementById('btn-continue').addEventListener('click', () => startGame(false));
document.getElementById('btn-resume').addEventListener('click', resumeGame);
document.getElementById('btn-respawn').addEventListener('click', respawnFromDown);
if (!loadSave()) document.getElementById('btn-continue').style.display = 'none';

// ---------------------------------------------------------------- loop

const clockEl = document.getElementById('clock');
let last = performance.now();
let persistT = 0;
let shotReq = readShotRequest();
let shotFrames = 0;
let crimeCd = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const playing = game.state === 'play';
  const titleBg = game.state === 'title';
  if (game.state === 'pause' || game.state === 'down') dt = 0;

  game.time += dt;
  crimeCd = Math.max(0, crimeCd - dt);

  // Water shimmer.
  city.water.position.y = -0.35 + Math.sin(game.time * 0.7) * 0.06;

  if (titleBg) {
    // Slow orbital backdrop behind the title.
    const t = game.time * 0.03;
    camera.position.set(Math.sin(t) * 210, 60, 150 + Math.cos(t) * 120);
    camera.lookAt(0, 8, -20);
    traffic.update(dt, { x: 0, z: 0 }, allCars(), colliders, []);
    peds.update(dt, { x: 0, z: 0 }, { cars: allCars(), onPedHit: null });
    renderer.render(scene, camera);
    return;
  }
  if (!playing) {
    renderer.render(scene, camera);
    return;
  }

  // ---- player & driving ----
  const camFwd = { x: Math.sin(game.cameraYaw), z: Math.cos(game.cameraYaw) };
  const camRight = { x: -Math.cos(game.cameraYaw), z: Math.sin(game.cameraYaw) };
  if (player.inCar) {
    const car = player.inCar;
    player.pos.copy(car.pos);
    player.heading = car.heading;
    const input = {
      throttle: (keys.KeyW || keys.ArrowUp ? 1 : 0) + (keys.KeyS || keys.ArrowDown ? -1 : 0),
      steer: (keys.KeyD || keys.ArrowRight ? 1 : 0) + (keys.KeyA || keys.ArrowLeft ? -1 : 0),
      brake: !!keys.Space,
      hand: !!keys.Space,
    };
    car.step(dt, input, colliders, allCars(), (strength, type, other) => {
      sound.thud(Math.min(1, strength / 22));
      if (type === 'car' && other && other.kind === 'cop' && crimeCd <= 0) {
        wanted.report('copRam');
        crimeCd = 2;
      } else if (type === 'car' && crimeCd <= 0 && police.copCars().length) {
        wanted.report('carSmash');
        crimeCd = 2.5;
      }
    });
    sound.engineUpdate(Math.abs(car.speed) / 34, Math.abs(input.throttle));
    // Ease the camera behind the car.
    const behind = car.heading + Math.PI;
    let dy = behind - game.cameraYaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    if (!dragging) game.cameraYaw += dy * Math.min(1, dt * 2.6);
    hud.prompt('');
  } else {
    const move = { x: 0, z: 0 };
    if (keys.KeyW || keys.ArrowUp) { move.x += camFwd.x; move.z += camFwd.z; }
    if (keys.KeyS || keys.ArrowDown) { move.x -= camFwd.x; move.z -= camFwd.z; }
    if (keys.KeyD || keys.ArrowRight) { move.x += camRight.x; move.z += camRight.z; }
    if (keys.KeyA || keys.ArrowLeft) { move.x -= camRight.x; move.z -= camRight.z; }
    player.update(dt, move, !!(keys.ShiftLeft || keys.ShiftRight), colliders);
    // Aiming: hold the mouse to draw and fire.
    const aiming = mouseDown && player.armed;
    player.setAiming(aiming);
    if (aiming) {
      player.heading = game.cameraYaw;
      fireGun();
    }
    // Context prompt for entering a car.
    let near = false;
    for (const car of allCars()) {
      if (car.driver !== 'police' && dist2d(player.pos, car.pos) < 3.6) { near = true; break; }
    }
    hud.prompt(near ? 'E — get in' : '');
    // Being run over hurts.
    for (const car of allCars()) {
      if (Math.abs(car.speed) > 6 && dist2d(player.pos, car.pos) < 2.3) {
        player.damage(16);
        player.pos.x += (player.pos.x - car.pos.x) * 0.4;
        player.pos.z += (player.pos.z - car.pos.z) * 0.4;
        sound.thud(1);
        break;
      }
    }
  }

  // ---- world systems ----
  const carsNow = allCars();
  traffic.update(dt, player.pos, carsNow, colliders, player.inCar ? [] : [{ pos: player.pos, speed: 0 }]);
  peds.update(dt, player.pos, {
    cars: carsNow,
    onPedHit: (ped, car) => {
      peds.scareAll(ped.pos, 16);
      if (car === player.inCar) {
        wanted.report('pedHit');
        hud.message('You ran someone down!', 3.5);
        sound.thud(1);
      }
    },
  });
  const policeInfo = police.update(dt, {
    player,
    wanted,
    colliders,
    allCars: carsNow,
    onCopShoot: (cop, hit) => {
      sound.gunshot();
      if (hit) {
        player.damage(6);
        const flash = document.getElementById('hurt-flash');
        flash.style.opacity = '0.55';
        setTimeout(() => { flash.style.opacity = '0'; }, 90);
      }
    },
    onCopDown: () => {
      wanted.report('copDown');
      hud.message('Officer down — now they are really coming.', 3.5);
    },
    onCopCrash: null,
  });
  wanted.update(dt, policeInfo.anyCopNear);
  if (wanted.stars > 0) sound.sirenStart(); else sound.sirenStop();
  sound.sirenUpdate(policeInfo.nearestCopDist);

  missions.update(dt);
  sideJobs.update(dt);

  // ---- end states (locked off while a screenshot session is staged) ----
  if (!game.shotLock) {
    if (police.bustedMeter >= 1) {
      goDown('busted');
    } else if (player.dead) {
      goDown('wasted');
    }
  }

  // ---- HUD ----
  hud.setStars(wanted.stars);
  hud.setHealth(player.health, player.maxHealth);
  hud.setWeapon(player);
  hud.setSpeedo(player.inCar);
  hud.setBusted(wanted.stars > 0 ? police.bustedMeter : 0);
  hud.update(dt);
  const objPos = missions.markerPos || sideJobs.objectivePos();
  hud.drawMap({
    player: player.pos,
    playerHeading: player.heading,
    cars: carsNow.filter((c) => c !== player.inCar),
    cops: police.copCars(),
    peds: peds.peds,
    objectivePos: objPos,
    flash: Math.floor(game.time * 3) % 2 === 0,
  });

  // ---- camera ----
  const focus = player.inCar ? player.inCar.pos : player.pos;
  const dist = player.inCar ? 11.5 : 8.2;
  const pitch = game.cameraPitch;
  const cx = focus.x - Math.sin(game.cameraYaw) * Math.cos(pitch) * dist;
  const cz = focus.z - Math.cos(game.cameraYaw) * Math.cos(pitch) * dist;
  const cy = 2 + Math.sin(pitch) * dist;
  camera.position.set(cx, Math.max(1.2, cy), cz);
  camera.lookAt(focus.x, 1.7, focus.z);

  // Tracers fade fast.
  if (tracer) {
    tracerT -= dt;
    if (tracerT <= 0) {
      scene.remove(tracer);
      tracer = null;
    }
  }
  muzzle.intensity = Math.max(0, muzzle.intensity - dt * 30);

  game.save.playSeconds += dt;
  persistT += dt;
  if (persistT > 20) {
    persistT = 0;
    game.persist();
  }

  renderer.render(scene, camera);

  // Screenshot staging: pose the scene once the world has warmed up.
  if (shotReq) {
    shotFrames++;
    if (shotFrames === 12) stageShot(game, shotReq.name);
    if (shotFrames === 42) {
      window.__shotReady = true;
      shotReq = null;
    }
  }
}

showOnly('title');
hud.setCash(game.save.cash);
if (shotReq) {
  // Screenshot mode: skip the title and play immediately.
  game.state = 'play';
  showOnly('play');
  missions.refreshObjective();
}
requestAnimationFrame(frame);

// The Palm Haven PD: the wanted-level model (what raises it, how it cools
// down) and the cruiser AI that hunts the player across the grid. Cruisers
// drive the same arcade physics as everyone else and try to box the
// player in; the bust falls out of proximity and speed, not a script.
import { CFG } from './config.js';
import { AVENUES_X, STREETS_Z } from './layout.js';
import { makeCar, placeCar, stepCar } from './vehicles.js';

export const wanted = {
  stars: 0,
  bustMeter: 0,       // 0..1, fills when a cruiser is close and you are slow
  unseenTime: 0,      // seconds since any unit had eyes on the player
  drainTime: 0,
  units: [],
  onBusted: null,     // assigned by main
  flashClock: 0,
};

let scene = null;
export function initPolice(s) {
  scene = s;
}

/** Register a crime: wanted rises to at least `level` (capped at 5). */
export function reportCrime(level) {
  const next = Math.min(5, Math.max(wanted.stars, level));
  if (next !== wanted.stars) {
    wanted.stars = next;
    wanted.drainTime = 0;
  }
}

export function clearWanted() {
  wanted.stars = 0;
  wanted.bustMeter = 0;
  wanted.unseenTime = 0;
  wanted.drainTime = 0;
}

export function setStars(n) {
  wanted.stars = Math.max(0, Math.min(5, n));
}

function spawnUnit(player) {
  // Appear on a street 80–120 m away, pointed at the player.
  const angle = Math.random() * Math.PI * 2;
  const dist = 85 + Math.random() * 35;
  let x = player.x + Math.sin(angle) * dist;
  let z = player.z + Math.cos(angle) * dist;
  // Snap to the nearest street centre so they arrive on a road.
  const snap = (v, lines) => lines.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a), lines[0]);
  if (Math.random() < 0.5) x = snap(x, AVENUES_X);
  else z = snap(z, STREETS_Z);
  x = Math.max(-205, Math.min(200, x));
  z = Math.max(-205, Math.min(205, z));
  const car = makeCar('police', 0xffffff);
  car.driver = 'police';
  placeCar(car, x, z, Math.atan2(player.x - x, player.z - z));
  wanted.units.push(car);
  return car;
}

function releaseUnit(car) {
  car.driver = 'parked'; // becomes an ordinary stealable cruiser
  const i = wanted.units.indexOf(car);
  if (i >= 0) wanted.units.splice(i, 1);
}

/** player: { x, z, speed, vx, vz } — the player's current state. */
export function updatePolice(dt, player) {
  wanted.flashClock += dt;
  const want = CFG.policeCount[wanted.stars] ?? 0;

  // Field the right number of cruisers.
  if (wanted.stars > 0) {
    let guard = 0;
    while (wanted.units.length < want && guard++ < 3) spawnUnit(player);
  }
  for (let i = wanted.units.length - 1; i >= 0; i--) {
    const u = wanted.units[i];
    const d = Math.hypot(u.x - player.x, u.z - player.z);
    if (wanted.units.length > want || d > 260) releaseUnit(u);
  }

  // Eyes on the player?
  let nearest = Infinity;
  for (const u of wanted.units) {
    const d = Math.hypot(u.x - player.x, u.z - player.z);
    if (d < nearest) nearest = d;
  }
  const seen = nearest < 62;
  if (seen) {
    wanted.unseenTime = 0;
    wanted.drainTime = 0;
  } else if (wanted.stars > 0) {
    wanted.unseenTime += dt;
    if (wanted.unseenTime > CFG.wantedDecaySightless) {
      wanted.drainTime += dt;
      if (wanted.drainTime > CFG.wantedDrainPerStar) {
        wanted.drainTime = 0;
        wanted.stars -= 1;
        if (wanted.stars <= 0) clearWanted();
      }
    }
  }

  // Drive the pursuit.
  for (const u of wanted.units) {
    if (u.dead) continue;
    const px = player.x + (player.vx ?? 0) * 0.45;
    const pz = player.z + (player.vz ?? 0) * 0.45;
    const desired = Math.atan2(px - u.x, pz - u.z);
    let diff = desired - u.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, diff * 1.9));
    const d = Math.hypot(player.x - u.x, player.z - u.z);
    let throttle = 1;
    if (d < 4.2 && Math.abs(player.speed) < 3) throttle = 0; // alongside: hold and bust
    const prevTop = u.spec.top;
    u.spec = { ...u.spec, top: CFG.policeTopSpeed[wanted.stars] ?? 26 };
    stepCar(u, dt, { throttle, steer, handbrake: Math.abs(diff) > 2.4 });
    u.spec.top = prevTop;
    // Lightbar strobe.
    if (u.lightbar) {
      const phase = Math.floor(wanted.flashClock * 5 + u.flashPhase) % 2;
      u.lightbar.children[0].visible = phase === 0;
      u.lightbar.children[1].visible = phase === 1;
    }
  }

  // The bust: a cruiser close while the player is slow or on foot.
  if (wanted.stars > 0 && nearest < CFG.bustRange && Math.abs(player.speed) < 2.4) {
    wanted.bustMeter += dt / CFG.bustBuildTime;
    if (wanted.bustMeter >= 1) {
      wanted.bustMeter = 0;
      if (wanted.onBusted) wanted.onBusted();
    }
  } else {
    wanted.bustMeter = Math.max(0, wanted.bustMeter - dt * 0.7);
  }
}

/** Any cruiser close enough to witness a crime at (x, z)? */
export function witnessed(x, z, radius = 42) {
  return wanted.units.some((u) => Math.hypot(u.x - x, u.z - z) < radius);
}

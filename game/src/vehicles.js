// Cars: the factory that builds them, the arcade physics that moves them,
// and the traffic system that keeps Palm Haven's streets alive. Player,
// police and traffic all drive the same stepCar() so a stolen cruiser
// feels exactly like the one that was chasing you a minute ago.
import * as THREE from 'three';
import { CFG } from './config.js';
import { AVENUES_X, STREETS_Z, LANE, collideCircle } from './layout.js';
import { Rng } from './rng.js';

export const CAR_TYPES = {
  sedan: { name: 'Kestrel Sedan', len: 4.3, top: 27, accel: 13 },
  coupe: { name: 'Falcata GT', len: 4.1, top: 34, accel: 17 },
  pickup: { name: 'Tortuga Pickup', len: 4.8, top: 24, accel: 12 },
  van: { name: 'Cargo Van', len: 5.0, top: 22, accel: 11 },
  taxi: { name: 'Palm Cab', len: 4.3, top: 27, accel: 13 },
  police: { name: 'PHPD Interceptor', len: 4.5, top: 33, accel: 16 },
  gold: { name: 'Aurelia GT (one of one)', len: 4.1, top: 36, accel: 18 },
};
const PAINTS = [0xd94f30, 0x2b5ea7, 0xf2c230, 0x3fae6a, 0xe8e2d6, 0x8c46a8, 0x30a8b4, 0xe87fa8, 0x555c63, 0xf28c28];

const bodyMats = new Map();
function paintMat(hex) {
  if (!bodyMats.has(hex)) bodyMats.set(hex, new THREE.MeshLambertMaterial({ color: hex }));
  return bodyMats.get(hex);
}
const glassMat = new THREE.MeshLambertMaterial({ color: 0x1d2b33 });
const tyreMat = new THREE.MeshLambertMaterial({ color: 0x17181a });
const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
const tailMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });

let scene = null;
export const allCars = [];
export const trafficCars = [];

export function initVehicles(s) {
  scene = s;
}

/** Build one car of a type; returns the car record (not yet in allCars). */
export function makeCar(type, colorHex) {
  const spec = CAR_TYPES[type];
  const group = new THREE.Group();
  const paint = type === 'police' ? 0xf2f2f2 : type === 'taxi' ? 0xf2c230 : type === 'gold' ? 0xd9a441 : colorHex;
  const len = spec.len, wid = 1.85;

  const body = new THREE.Mesh(new THREE.BoxGeometry(wid, 0.62, len), paintMat(paint));
  body.position.y = 0.62;
  body.castShadow = true;
  group.add(body);
  const paintParts = [body];

  if (type === 'van') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(wid, 1.15, len * 0.92), paintMat(paint));
    box.position.set(0, 1.35, -0.1);
    box.castShadow = true;
    group.add(box);
    paintParts.push(box);
  } else if (type === 'pickup') {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(wid * 0.94, 0.62, len * 0.34), paintMat(paint));
    cab.position.set(0, 1.22, len * 0.22);
    group.add(cab);
    paintParts.push(cab);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(wid * 0.9, 0.4, len * 0.3), glassMat);
    glass.position.set(0, 1.28, len * 0.22);
    group.add(glass);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(wid * 0.96, 0.34, len * 0.44), paintMat(0x3a3f45));
    bed.position.set(0, 0.95, -len * 0.26);
    group.add(bed);
  } else {
    const cabinLen = len * (type === 'coupe' ? 0.42 : 0.48);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(wid * 0.88, 0.55, cabinLen), glassMat);
    cabin.position.set(0, 1.18, type === 'coupe' ? -len * 0.04 : 0);
    cabin.castShadow = true;
    group.add(cabin);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(wid * 0.8, 0.09, cabinLen * 0.8), paintMat(paint));
    roof.position.set(0, 1.5, cabin.position.z);
    group.add(roof);
    paintParts.push(roof);
  }

  const wheelGeo = new THREE.CylinderGeometry(0.37, 0.37, 0.28, 10);
  const wheels = [];
  const wx = wid / 2 - 0.05, wz = len / 2 - 0.85;
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const w = new THREE.Mesh(wheelGeo, tyreMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(sx * wx, 0.37, sz * wz);
    group.add(w);
    wheels.push(w);
  }
  const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), lightMat);
  hl.position.set(-0.55, 0.72, len / 2 + 0.01);
  group.add(hl);
  const hr = hl.clone();
  hr.position.x = 0.55;
  group.add(hr);
  const tl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.06), tailMat);
  tl.position.set(-0.55, 0.74, -len / 2 - 0.01);
  group.add(tl);
  const tr = tl.clone();
  tr.position.x = 0.55;
  group.add(tr);

  let lightbar = null;
  if (type === 'police') {
    const doors = new THREE.Mesh(new THREE.BoxGeometry(wid + 0.02, 0.5, len * 0.4), paintMat(0x22262b));
    doors.position.set(0, 0.66, 0);
    group.add(doors);
    lightbar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.x = -0.28;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), new THREE.MeshBasicMaterial({ color: 0x2266ff }));
    blue.position.x = 0.28;
    lightbar.add(red, blue);
    lightbar.position.set(0, 1.62, 0);
    group.add(lightbar);
  }
  if (type === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.3), new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
    sign.position.set(0, 1.62, 0);
    group.add(sign);
  }

  scene.add(group);
  const car = {
    type, spec, group, wheels, lightbar, paintParts, paintHex: paint,
    x: 0, z: 0, heading: 0, speed: 0,
    health: 100, driver: 'parked', dead: false,
    name: spec.name, smokeTimer: 0, flashPhase: Math.random() * 6,
  };
  group.userData.car = car;
  allCars.push(car);
  return car;
}

export function placeCar(car, x, z, heading) {
  car.x = x;
  car.z = z;
  car.heading = heading;
  car.speed = 0;
  syncCarMesh(car);
}

export function syncCarMesh(car) {
  car.group.position.set(car.x, 0, car.z);
  car.group.rotation.y = car.heading;
}

/** One arcade-physics step. ctl = { throttle, steer, handbrake }. */
export function stepCar(car, dt, ctl) {
  const spec = car.spec;
  const accel = spec.accel * (car.health < 30 ? 0.55 : 1);
  if (ctl.throttle > 0) car.speed += accel * ctl.throttle * dt;
  else if (ctl.throttle < 0) {
    car.speed += (car.speed > 0.5 ? -CFG.carBrake : -accel * 0.6) * -ctl.throttle * dt * (car.speed > 0.5 ? 1 : 1);
    if (car.speed < -CFG.carReverseMax) car.speed = -CFG.carReverseMax;
  }
  // Rolling drag + handbrake.
  const drag = CFG.carDrag + (ctl.handbrake ? CFG.handbrakeDrag : 0);
  car.speed -= car.speed * drag * dt * 0.35;
  if (ctl.throttle === 0 && Math.abs(car.speed) < 0.25) car.speed = 0;
  const top = spec.top * (car.health < 30 ? 0.6 : 1);
  if (car.speed > top) car.speed = top;

  const steerAuthority = CFG.carSteer / (1 + Math.abs(car.speed) / CFG.carGripSpeed);
  if (Math.abs(car.speed) > 0.05) {
    car.heading += ctl.steer * steerAuthority * dt * Math.sign(car.speed) * Math.min(1, Math.abs(car.speed) / 6 + 0.25);
  }
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  car.x += fx * car.speed * dt;
  car.z += fz * car.speed * dt;

  // Buildings: a circle shove-out, with damage for hard hits.
  const before = Math.abs(car.speed);
  const fixed = collideCircle(car.x, car.z, 1.7);
  if (fixed.x !== car.x || fixed.z !== car.z) {
    car.x = fixed.x;
    car.z = fixed.z;
    if (before > 9) damageCar(car, (before - 8) * 1.1);
    car.speed *= 0.35;
  }
  car.x = Math.max(-252, Math.min(300, car.x));
  car.z = Math.max(-252, Math.min(252, car.z));

  // Wheels: spin by travel, front pair shows the steering lock.
  const spin = (car.speed * dt) / 0.37;
  car.wheels.forEach((w, i) => {
    w.rotation.x += spin;
    if (i < 2) w.rotation.y = ctl.steer * 0.42;
  });
  syncCarMesh(car);
}

export function damageCar(car, amount) {
  if (car.dead) return;
  car.health = Math.max(0, car.health - amount);
  if (car.health <= 0) {
    car.dead = true;
    car.speed = 0;
  }
}

export function repairCar(car) {
  car.health = 100;
  car.dead = false;
}

/** Fresh Coat Customs' whole business: new paint, no questions. */
export function repaintCar(car, hex) {
  for (const part of car.paintParts) part.material = paintMat(hex);
  car.paintHex = hex;
}

// ------------------------------------------------------------------ traffic
const trafficRng = new Rng(20240);

/** The lane centre for a car on a vertical avenue heading dirZ (+1 south). */
function lanePoint(car) {
  // Target: a point ahead on the current leg, offset to the car's lane.
  return car.target;
}

function newLeg(car) {
  // Choose the next intersection ahead and the leg beyond it.
  const ahead = 26;
  if (car.axis === 'z') { // travelling along z on an avenue (constant x)
    const dir = car.dir;
    const nextZ = nearestLineAhead(car.z, dir, STREETS_Z);
    const exit = chooseExit(car, nextZ, 'z');
    car.target = exit;
    car.legEnd = { x: car.laneX, z: nextZ };
    car.pendingTurn = exit.turn;
    car.cruise = ahead;
  } else { // travelling along x on a street (constant z)
    const dir = car.dir;
    const nextX = nearestLineAhead(car.x, dir, AVENUES_X);
    const exit = chooseExit(car, nextX, 'x');
    car.target = exit;
    car.legEnd = { x: nextX, z: car.laneZ };
    car.pendingTurn = exit.turn;
    car.cruise = ahead;
  }
}

function nearestLineAhead(pos, dir, lines) {
  let best = null;
  for (const l of lines) {
    const d = (l - pos) * dir;
    if (d > 6 && (best === null || d < best.d)) best = { l, d };
  }
  if (best) return best.l;
  return pos + dir * 200; // edge of town: keep going, a U-turn leg follows
}

function chooseExit(car, cross, axis) {
  // At the crossing, pick straight / left / right; return the far target
  // point on the exit lane, 30 m past the intersection.
  const r = trafficRng.next();
  const turn = r < 0.55 ? 'straight' : r < 0.78 ? 'left' : 'right';
  if (axis === 'z') {
    const cx = car.avenueX;
    if (turn === 'straight') {
      return { x: car.laneX, z: cross + car.dir * 30, turn, axis: 'z', dir: car.dir, avenueX: cx };
    }
    // Turning onto the cross street: new travel along x, on that street's
    // lane for the new direction (same side convention as spawnTraffic).
    const dirX = turn === 'left' ? -car.dir : car.dir;
    const laneZ = cross + (dirX > 0 ? -LANE : LANE);
    return { x: cx + dirX * 30, z: laneZ, turn, axis: 'x', dir: dirX, streetZ: cross };
  }
  const cz = car.streetZ;
  if (turn === 'straight') {
    return { x: cross + car.dir * 30, z: car.laneZ, turn, axis: 'x', dir: car.dir, streetZ: cz };
  }
  const dirZ = turn === 'left' ? car.dir : -car.dir;
  const laneX = cross + (dirZ > 0 ? LANE : -LANE);
  return { x: laneX, z: cz + dirZ * 30, turn, axis: 'z', dir: dirZ, avenueX: cross };
}

/** Spawn the ambient traffic fleet on random avenues. */
export function spawnTraffic(count) {
  for (let i = 0; i < count; i++) {
    const type = trafficRng.pick(['sedan', 'sedan', 'coupe', 'pickup', 'van', 'taxi']);
    const car = makeCar(type, trafficRng.pick(PAINTS));
    car.driver = 'traffic';
    const vertical = trafficRng.chance(0.5);
    const dir = trafficRng.chance(0.5) ? 1 : -1;
    if (vertical) {
      const ax = trafficRng.pick(AVENUES_X);
      car.axis = 'z';
      car.dir = dir;
      car.avenueX = ax;
      car.laneX = ax + (dir > 0 ? LANE : -LANE);
      placeCar(car, car.laneX, trafficRng.range(-200, 200), dir > 0 ? 0 : Math.PI);
    } else {
      const sz = trafficRng.pick(STREETS_Z);
      car.axis = 'x';
      car.dir = dir;
      car.streetZ = sz;
      car.laneZ = sz + (dir > 0 ? -LANE : LANE);
      placeCar(car, trafficRng.range(-200, 180), car.laneZ, dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    }
    newLeg(car);
    trafficCars.push(car);
  }
}

/** Parked cars along the kerbs, waiting to be borrowed. */
export function spawnParked(count) {
  const made = [];
  for (let i = 0; i < count; i++) {
    const type = trafficRng.pick(['sedan', 'sedan', 'coupe', 'pickup', 'van']);
    const car = makeCar(type, trafficRng.pick(PAINTS));
    car.driver = 'parked';
    const vertical = trafficRng.chance(0.55);
    if (vertical) {
      const ax = trafficRng.pick(AVENUES_X);
      const side = trafficRng.chance(0.5) ? 5.6 : -5.6;
      placeCar(car, ax + side, trafficRng.range(-198, 198), trafficRng.chance(0.5) ? 0 : Math.PI);
    } else {
      const sz = trafficRng.pick(STREETS_Z);
      const side = trafficRng.chance(0.5) ? 5.6 : -5.6;
      placeCar(car, trafficRng.range(-198, 180), sz + side, trafficRng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2);
    }
    made.push(car);
  }
  return made;
}

/** Re-place a traffic car on a random street in a ring around the focus,
 *  so the streets near the player are always populated. */
function resetTrafficCar(car, focus) {
  const vertical = trafficRng.chance(0.5);
  const dir = trafficRng.chance(0.5) ? 1 : -1;
  const along = trafficRng.range(-190, 190);
  if (vertical) {
    const ax = trafficRng.pick(AVENUES_X);
    car.axis = 'z';
    car.dir = dir;
    car.avenueX = ax;
    car.laneX = ax + (dir > 0 ? LANE : -LANE);
    placeCar(car, car.laneX, focus.z + Math.max(-210, Math.min(210, along)), dir > 0 ? 0 : Math.PI);
  } else {
    const sz = trafficRng.pick(STREETS_Z);
    car.axis = 'x';
    car.dir = dir;
    car.streetZ = sz;
    car.laneZ = sz + (dir > 0 ? -LANE : LANE);
    placeCar(car, focus.x + Math.max(-210, Math.min(190, along)), car.laneZ, dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  }
  car.speed = 8;
  newLeg(car);
}

export function updateTraffic(dt, focus) {
  for (const car of trafficCars) {
    if (car.driver !== 'traffic' || car.dead) continue;
    // Far or lost traffic respawns on the ring around the action.
    const dx = car.x - focus.x, dz = car.z - focus.z;
    const dist2 = dx * dx + dz * dz;
    if (dist2 > 300 * 300 || Math.abs(car.x) > 244 || Math.abs(car.z) > 244) {
      resetTrafficCar(car, focus);
      continue;
    }

    const t = lanePoint(car);
    const toTarget = Math.hypot(t.x - car.x, t.z - car.z);
    if (toTarget < 9) {
      // Adopt the exit leg.
      car.axis = t.axis;
      car.dir = t.dir;
      if (t.axis === 'z') {
        car.avenueX = t.avenueX;
        car.laneX = car.avenueX + (car.dir > 0 ? LANE : -LANE);
        car.heading = car.dir > 0 ? 0 : Math.PI;
      } else {
        car.streetZ = t.streetZ;
        car.laneZ = car.streetZ + (car.dir > 0 ? -LANE : LANE);
        car.heading = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
      newLeg(car);
    }
    // Steer toward the target with the same physics the player gets.
    const desired = Math.atan2(t.x - car.x, t.z - car.z);
    let diff = desired - car.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, diff * 1.6));
    // Slow for the car ahead.
    let throttle = 0.75;
    for (const other of allCars) {
      if (other === car || other.dead) continue;
      const ox = other.x - car.x, oz = other.z - car.z;
      const aheadDist = ox * Math.sin(car.heading) + oz * Math.cos(car.heading);
      const sideDist = Math.abs(ox * Math.cos(car.heading) - oz * Math.sin(car.heading));
      if (aheadDist > 0 && aheadDist < 8.5 && sideDist < 1.9) {
        throttle = aheadDist < 5 ? -0.4 : 0.1;
        break;
      }
    }
    if (Math.abs(diff) > 1.1) throttle = Math.min(throttle, 0.25);
    stepCar(car, dt, { throttle, steer, handbrake: false });
    if (car.speed > 11.5) car.speed = 11.5;
  }
}

/** Car-to-car shoves for every active car (called once per frame). */
export function collideCars(active) {
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i], b = active[j];
      const dx = b.x - a.x, dz = b.z - a.z;
      const d2 = dx * dx + dz * dz;
      const min = 3.4;
      if (d2 > min * min || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const push = (min - d) / 2;
      const nx = dx / d, nz = dz / d;
      a.x -= nx * push;
      a.z -= nz * push;
      b.x += nx * push;
      b.z += nz * push;
      const impact = Math.abs(a.speed - b.speed);
      if (impact > 6) {
        damageCar(a, impact * 0.5);
        damageCar(b, impact * 0.5);
        a.speed *= 0.6;
        b.speed *= 0.6;
      } else {
        const avg = (a.speed + b.speed) / 2;
        a.speed = avg;
        b.speed = avg;
      }
      syncCarMesh(a);
      syncCarMesh(b);
    }
  }
}

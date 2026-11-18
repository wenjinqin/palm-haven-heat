// People: low-poly articulated figures with a procedural walk cycle, the
// pedestrian crowd that fills the sidewalks, and the factory every actor
// in the game (player, walkers, mission thugs) is built from.
import * as THREE from 'three';
import { AVENUES_X, STREETS_Z, collideCircle } from './layout.js';
import { Rng } from './rng.js';

const matCache = new Map();
function mat(hex) {
  if (!matCache.has(hex)) matCache.set(hex, new THREE.MeshLambertMaterial({ color: hex }));
  return matCache.get(hex);
}
const SKIN = [0xf2c9a0, 0xd9a066, 0xa86f3c, 0x7a4a24, 0xffe0bd];
const SHIRTS = [0xd94f30, 0x2b9ec4, 0xf2f2f2, 0x3fae6a, 0xf28bb4, 0xf2c230, 0x8c46a8, 0x30a8b4, 0xff8c42];
const PANTS = [0x2e3a46, 0x5c4a32, 0xd8d2c4, 0x33454f, 0x70543a, 0x46648c];

/** Build one figure. Parts pivot at the hip/shoulder so the walk cycle
 *  can swing them. Total height about 1.8 m. */
export function makeFigure(shirt, pants, skin, hair) {
  const group = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), mat(shirt));
  torso.position.y = 1.13;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.38, 0.34), mat(skin));
  head.position.y = 1.68;
  group.add(head);
  const hairCap = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.36), mat(hair));
  hairCap.position.y = 1.9;
  group.add(hairCap);

  function limb(w, l, material, x, y, z) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, l, w), material);
    m.position.y = -l / 2;
    m.castShadow = true;
    pivot.add(m);
    group.add(pivot);
    return pivot;
  }
  const lLeg = limb(0.2, 0.78, mat(pants), -0.16, 0.78, 0);
  const rLeg = limb(0.2, 0.78, mat(pants), 0.16, 0.78, 0);
  const lArm = limb(0.16, 0.68, mat(shirt), -0.4, 1.44, 0);
  const rArm = limb(0.16, 0.68, mat(shirt), 0.4, 1.44, 0);
  return { group, lLeg, rLeg, lArm, rArm, torso, head };
}

/** Advance a figure's walk cycle and place it. speed in m/s. */
export function animateFigure(fig, speed, dt, run = false) {
  fig.phase = (fig.phase ?? 0) + dt * (2.2 + speed * 1.55) * (run ? 1.25 : 1);
  const swing = Math.min(0.85, speed * 0.16) * (run ? 1.25 : 1);
  const s = Math.sin(fig.phase) * swing;
  fig.lLeg.rotation.x = s;
  fig.rLeg.rotation.x = -s;
  fig.lArm.rotation.x = -s * 0.8;
  fig.rArm.rotation.x = s * 0.8;
  fig.group.position.y = Math.abs(Math.cos(fig.phase)) * 0.05 * Math.min(1, speed);
}

/** A generic actor record around a figure. */
export function makeActor(fig, kind) {
  return {
    fig, kind,
    x: 0, z: 0, heading: 0, speed: 0,
    health: 100, dead: false, phase: Math.random() * 6,
  };
}

export function placeActor(a, x, z, heading) {
  a.x = x;
  a.z = z;
  a.heading = heading;
  a.fig.group.position.set(x, 0, z);
  a.fig.group.rotation.y = heading;
}

export function moveActor(a, dt) {
  const fx = Math.sin(a.heading), fz = Math.cos(a.heading);
  let nx = a.x + fx * a.speed * dt;
  let nz = a.z + fz * a.speed * dt;
  const fixed = collideCircle(nx, nz, 0.5);
  nx = fixed.x;
  nz = fixed.z;
  a.x = Math.max(-248, Math.min(296, nx));
  a.z = Math.max(-248, Math.min(248, nz));
  a.fig.group.position.set(a.x, 0, a.z);
  a.fig.group.rotation.y = a.heading;
  animateFigure(a.fig, Math.abs(a.speed), dt, a.speed > 6);
}

// ------------------------------------------------------------------ crowd
const pedRng = new Rng(777);
export const peds = [];
let pedScene = null;

export function initPeople(scene) {
  pedScene = scene;
}

function cornerPoint() {
  // A sidewalk corner near a random intersection.
  const ax = pedRng.pick(AVENUES_X);
  const sz = pedRng.pick(STREETS_Z);
  const ox = pedRng.pick([-8.6, 8.6]);
  const oz = pedRng.pick([-8.6, 8.6]);
  return { x: ax + ox, z: sz + oz };
}

export function spawnPeds(count) {
  for (let i = 0; i < count; i++) {
    const fig = makeFigure(pedRng.pick(SHIRTS), pedRng.pick(PANTS), pedRng.pick(SKIN), pedRng.pick([0x2b2118, 0x4a3220, 0x111111, 0x8c8c8c, 0xd9a441]));
    pedScene.add(fig.group);
    const a = makeActor(fig, 'ped');
    const start = cornerPoint();
    placeActor(a, start.x, start.z, pedRng.range(0, Math.PI * 2));
    a.target = cornerPoint();
    a.walkSpeed = pedRng.range(1.1, 2.1);
    a.flee = 0;
    a.fleeFrom = { x: 0, z: 0 };
    peds.push(a);
  }
}

/** Something frightening happened at (x, z): nearby walkers run from it. */
export function panicAt(x, z, radius = 16) {
  for (const p of peds) {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < radius) {
      p.flee = pedRng.range(2, 4);
      p.fleeFrom = { x, z };
    }
  }
}

export function updatePeds(dt) {
  for (const p of peds) {
    if (p.dead) continue;
    if (p.flee > 0) {
      p.flee -= dt;
      p.heading = Math.atan2(p.x - p.fleeFrom.x, p.z - p.fleeFrom.z);
      p.speed = 5.6;
    } else {
      const dx = p.target.x - p.x, dz = p.target.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.6) {
        p.target = cornerPoint();
      }
      p.heading = Math.atan2(dx, dz);
      p.speed = p.walkSpeed;
    }
    moveActor(p, dt);
  }
}

/** The player character: Jax Marlowe, teal shirt, dark jeans, cap. */
export function makePlayerFigure() {
  const fig = makeFigure(0x17a398, 0x27313b, 0xd9a066, 0x1d150e);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.1, 0.38), mat(0xd94f30));
  cap.position.y = 1.97;
  fig.group.add(cap);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.04, 0.24), mat(0xd94f30));
  brim.position.set(0, 1.93, 0.28);
  fig.group.add(brim);
  return fig;
}

// Combat: bare fists, a pistol when the story earns one, and the thugs
// who swing back. Hitscan with a visible tracer, knockback on punches,
// floating health pips over thugs — arcade rules, readable at a glance.
import * as THREE from 'three';
import { makeFigure, makeActor, placeActor, moveActor, panicAt } from './people.js';

export const combat = {
  hasGun: false,
  cooldown: 0,
  thugs: [],
  events: {
    damagePlayer: () => {},
    crime: () => {},
    shotFired: () => {},
    thugDown: () => {},
  },
};

let scene = null;
let tracerPool = [];
export function initCombat(s) {
  scene = s;
  for (let i = 0; i < 6; i++) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0 }));
    line.frustumCulled = false;
    scene.add(line);
    tracerPool.push({ line, life: 0 });
  }
}

function fireTracer(x, y, z, hx, hy, hz) {
  const t = tracerPool.find((p) => p.life <= 0) ?? tracerPool[0];
  const pos = t.line.geometry.attributes.position;
  pos.setXYZ(0, x, y, z);
  pos.setXYZ(1, hx, hy, hz);
  pos.needsUpdate = true;
  t.line.material.opacity = 0.95;
  t.life = 0.07;
}

/** Spawn a hostile: a debt collector, a rival runner, a guard. */
export function spawnThug(x, z, opts = {}) {
  const fig = makeFigure(opts.shirt ?? 0x8c2323, 0x22242a, 0xa86f3c, 0x111111);
  scene.add(fig.group);
  const a = makeActor(fig, 'thug');
  a.health = opts.health ?? 60;
  a.damage = opts.damage ?? 7;
  a.aggro = opts.aggro ?? false;
  a.attackCd = 0;
  a.bar = makeHealthBar();
  fig.group.add(a.bar);
  placeActor(a, x, z, Math.random() * Math.PI * 2);
  combat.thugs.push(a);
  return a;
}

function makeHealthBar() {
  const g = new THREE.Group();
  const back = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.14), new THREE.MeshBasicMaterial({ color: 0x1a1a1a, side: THREE.DoubleSide }));
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(1.04, 0.09), new THREE.MeshBasicMaterial({ color: 0xe23b2e, side: THREE.DoubleSide }));
  fill.position.z = 0.002;
  g.add(back, fill);
  g.position.y = 2.15;
  g.userData.fill = fill;
  return g;
}

export function clearThugs() {
  for (const t of combat.thugs) {
    scene.remove(t.fig.group);
  }
  combat.thugs = [];
}

function hurtThug(t, dmg, fromX, fromZ) {
  if (t.dead) return;
  t.health -= dmg;
  t.aggro = true;
  // Knockback away from the blow.
  const d = Math.max(0.6, Math.hypot(t.x - fromX, t.z - fromZ));
  t.x += ((t.x - fromX) / d) * 0.7;
  t.z += ((t.z - fromZ) / d) * 0.7;
  if (t.health <= 0) {
    t.dead = true;
    t.fig.group.rotation.x = -Math.PI / 2;
    t.fig.group.position.y = 0.25;
    if (t.bar) t.bar.visible = false;
    combat.events.thugDown(t);
  }
}

/** The player swings or fires. player: actor with heading; returns what happened. */
export function playerAttack(player) {
  if (combat.cooldown > 0 || player.dead) return 'wait';
  if (combat.hasGun) {
    combat.cooldown = 0.22;
    const fx = Math.sin(player.heading), fz = Math.cos(player.heading);
    const ox = player.x + fx * 0.5, oz = player.z + fz * 0.5;
    let best = null, bestScore = Infinity;
    for (const t of combat.thugs) {
      if (t.dead) continue;
      const dx = t.x - player.x, dz = t.z - player.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 34) continue;
      const dot = (dx * fx + dz * fz) / Math.max(0.001, dist);
      if (dot < 0.86) continue;
      if (dist < bestScore) { bestScore = dist; best = t; }
    }
    const endDist = best ? bestScore : 30;
    fireTracer(ox, 1.35, oz, player.x + fx * endDist, 1.25, player.z + fz * endDist);
    combat.events.shotFired(player.x, player.z);
    panicAt(player.x, player.z, 18);
    combat.events.crime(2);
    if (best) hurtThug(best, 34, player.x, player.z);
    return 'shot';
  }
  combat.cooldown = 0.38;
  let hit = false;
  for (const t of combat.thugs) {
    if (t.dead) continue;
    const dx = t.x - player.x, dz = t.z - player.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 2.3 && (dx * Math.sin(player.heading) + dz * Math.cos(player.heading)) > 0) {
      hurtThug(t, 26, player.x, player.z);
      hit = true;
    }
  }
  if (hit) combat.events.crime(1);
  return hit ? 'punch-hit' : 'punch';
}

export function updateCombat(dt, player, camera) {
  combat.cooldown = Math.max(0, combat.cooldown - dt);
  for (const t of tracerPool) {
    if (t.life > 0) {
      t.life -= dt;
      if (t.life <= 0) t.line.material.opacity = 0;
    }
  }
  for (const t of combat.thugs) {
    if (t.dead) continue;
    // Face the health bar at the camera.
    if (t.bar) {
      t.bar.quaternion.copy(camera.quaternion);
      const f = t.bar.userData.fill;
      const share = Math.max(0, t.health / 60);
      f.scale.x = share;
      f.position.x = -(1 - share) * 0.52;
    }
    const dx = player.x - t.x, dz = player.z - t.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 30) t.aggro = true;
    if (!t.aggro || player.dead) {
      t.speed = 0;
      moveActor(t, dt);
      continue;
    }
    t.heading = Math.atan2(dx, dz);
    t.attackCd -= dt;
    if (dist > 1.7) {
      t.speed = 4.4;
    } else {
      t.speed = 0;
      if (t.attackCd <= 0) {
        t.attackCd = 0.95;
        combat.events.damagePlayer(t.damage);
        // A visible lunge.
        t.fig.rArm.rotation.x = -2.2;
        setTimeout(() => { t.fig.rArm.rotation.x = 0; }, 130);
      }
    }
    moveActor(t, dt);
  }
}

// police.js — Palm Haven PD. A heat-based wanted system (crimes add
// heat, stars follow, hiding lets it cool) plus the response: patrol
// interceptors that hunt the player across the grid, foot officers
// who pile out near a cornered suspect, and the busted meter that
// fills when an officer is close and the player is going nowhere.

import { Car } from './vehicle.js';
import { ROAD_XS, ROAD_ZS } from './city.js';

const THREE = window.THREE;

const CRIME_HEAT = {
  theft: 2.2,
  pedHit: 2.6,
  shot: 0.7,
  copRam: 2.4,
  copDown: 4.5,
  carSmash: 0.8,
  mission: 2.0,
  brandish: 0.5,
};

export class Wanted {
  constructor() {
    this.heat = 0;
    this.sinceCrime = 99;
    this.totalCrimes = 0;
  }

  get stars() {
    if (this.heat <= 0.2) return 0;
    return Math.min(5, Math.ceil(this.heat / 2));
  }

  report(kind) {
    const add = CRIME_HEAT[kind] || 1;
    this.heat = Math.min(10, this.heat + add);
    this.sinceCrime = 0;
    this.totalCrimes++;
  }

  clear() {
    this.heat = 0;
    this.sinceCrime = 99;
  }

  update(dt, anyCopNear) {
    this.sinceCrime += dt;
    if (this.heat > 0 && this.sinceCrime > 6 && !anyCopNear) {
      this.heat = Math.max(0, this.heat - dt * (this.heat > 5 ? 0.1 : 0.2));
    }
  }
}

function buildCopMesh() {
  const g = new THREE.Group();
  const navy = new THREE.MeshLambertMaterial({ color: 0x1f3a93 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe0ac69 });
  const legGeo = new THREE.BoxGeometry(0.17, 0.8, 0.19);
  legGeo.translate(0, -0.4, 0);
  const legL = new THREE.Mesh(legGeo, navy);
  legL.position.set(-0.11, 0.82, 0);
  const legR = new THREE.Mesh(legGeo, navy);
  legR.position.set(0.11, 0.82, 0);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.64, 0.27), navy);
  torso.position.y = 1.15;
  const armGeo = new THREE.BoxGeometry(0.12, 0.62, 0.14);
  armGeo.translate(0, -0.31, 0);
  const armL = new THREE.Mesh(armGeo, navy);
  armL.position.set(-0.34, 1.42, 0);
  const armR = new THREE.Mesh(armGeo, navy);
  armR.position.set(0.34, 1.42, 0);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.35, 0.31), skin);
  head.position.y = 1.66;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.36), navy);
  cap.position.y = 1.88;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, 0.34), new THREE.MeshLambertMaterial({ color: 0x1c1e24 }));
  gun.position.set(0, -0.6, 0.12);
  armR.add(gun);
  g.add(legL, legR, torso, armL, armR, head, cap);
  g.userData.parts = { legL, legR, armL, armR };
  return g;
}

class FootCop {
  constructor(scene, x, z) {
    this.mesh = buildCopMesh();
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.pos = this.mesh.position;
    this.health = 50;
    this.shootCd = Math.random() * 0.8 + 0.4;
    this.walkPhase = Math.random() * 6;
    this.dead = false;
    this.down = false;
  }

  hurt(amount) {
    this.health -= amount;
    if (this.health <= 0 && !this.down) {
      this.down = true;
      this.mesh.rotation.x = -Math.PI / 2;
      this.mesh.position.y = 0.25;
    }
  }

  update(dt, player, stars, onShoot) {
    if (this.down) return;
    const parts = this.mesh.userData.parts;
    const dx = player.pos.x - this.pos.x;
    const dz = player.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const heading = Math.atan2(dx, dz);
    this.mesh.rotation.y = heading;
    let moving = 0;
    if (dist > 9) {
      const sp = 4.7;
      this.pos.x += (dx / dist) * sp * dt;
      this.pos.z += (dz / dist) * sp * dt;
      moving = sp;
    }
    this.walkPhase += dt * 10;
    const sw = moving > 0 ? Math.sin(this.walkPhase) * 0.5 : 0;
    parts.legL.rotation.x = sw;
    parts.legR.rotation.x = -sw;
    parts.armL.rotation.x = -sw * 0.6;
    parts.armR.rotation.x = dist <= 42 && stars >= 3 ? -1.35 : sw * 0.6;
    // Shooting: only at 3+ stars, with accuracy that fades with range.
    if (stars >= 3 && dist < 44 && !player.inCar) {
      this.shootCd -= dt;
      if (this.shootCd <= 0) {
        this.shootCd = 0.75 + Math.random() * 0.6;
        const hitChance = Math.max(0.1, 0.55 - dist * 0.011);
        onShoot(this, Math.random() < hitChance);
      }
    } else if (stars >= 3 && dist < 40 && player.inCar) {
      this.shootCd -= dt;
      if (this.shootCd <= 0) {
        this.shootCd = 0.9 + Math.random() * 0.6;
        const hitChance = Math.max(0.06, 0.4 - dist * 0.009);
        onShoot(this, Math.random() < hitChance);
      }
    }
  }

  dispose(scene) {
    scene.remove(this.mesh);
    this.dead = true;
  }
}

const COPS_BY_STARS = [0, 1, 2, 3, 4, 6];

export class PoliceSystem {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.units = []; // {car, footCop, leaving, reverseT}
    this.corpses = []; // downed officers, cleaned up on reset
    this.bustedMeter = 0;
    this.flashT = 0;
  }

  spawnUnit(playerPos) {
    // Come from a road intersection 120–175 m away.
    for (let tries = 0; tries < 10; tries++) {
      const gx = ROAD_XS[this.rng.int(0, ROAD_XS.length - 1)];
      const gz = ROAD_ZS[this.rng.int(0, ROAD_ZS.length - 1)];
      const d = Math.hypot(gx - playerPos.x, gz - playerPos.z);
      if (d > 110 && d < 190) {
        const car = new Car(this.scene, 'cop', 0x22242a, gx, gz, 0);
        car.driver = 'police';
        this.units.push({ car, footCop: null, leaving: false, reverseT: 0 });
        return;
      }
    }
  }

  update(dt, ctx) {
    const { player, wanted, colliders, allCars } = ctx;
    const stars = wanted.stars;
    const target = COPS_BY_STARS[stars];
    const active = this.units.filter((u) => !u.leaving);
    if (active.length < target) this.spawnUnit(player.pos);
    if (active.length > target && active.length > 0) {
      // The extra unit peels off and leaves the area.
      active[active.length - 1].leaving = true;
    }

    this.flashT += dt;
    const flashOn = Math.floor(this.flashT * 3.5) % 2 === 0;
    let nearestCopDist = Infinity;
    let bustPressure = false;

    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      const car = u.car;
      const distToPlayer = Math.hypot(car.pos.x - player.pos.x, car.pos.z - player.pos.z);
      nearestCopDist = Math.min(nearestCopDist, distToPlayer);

      // Flash the light bar.
      const bar = car.mesh.getObjectByName('lightbar');
      if (bar) {
        bar.children[0].visible = flashOn;
        bar.children[1].visible = !flashOn;
      }

      if (distToPlayer > 300) {
        car.dispose(this.scene);
        if (u.footCop) u.footCop.dispose(this.scene);
        this.units.splice(i, 1);
        continue;
      }

      if (u.leaving) {
        // Drive away from the player and despawn.
        const away = Math.atan2(car.pos.x - player.pos.x, car.pos.z - player.pos.z);
        const steer = steerToward(car.heading, away);
        car.step(dt, { throttle: 0.8, steer, brake: false, hand: false }, colliders, allCars, null);
        if (distToPlayer > 240) {
          car.dispose(this.scene);
          this.units.splice(i, 1);
        }
        continue;
      }

      // Deploy the foot officer when close and slow near an on-foot player.
      if (!u.footCop && !player.inCar && distToPlayer < 15 && Math.abs(car.speed) < 4) {
        u.footCop = new FootCop(this.scene, car.pos.x + 1.6, car.pos.z);
      }
      if (u.footCop) {
        u.footCop.update(dt, player, stars, ctx.onCopShoot);
        if (u.footCop.down && ctx.onCopDown) {
          ctx.onCopDown(u.footCop);
          this.corpses.push(u.footCop);
          u.footCop = null; // counted once; the body stays where it fell
        }
        // Officer re-enters when the player drives off.
        if (u.footCop && player.inCar && distToPlayer > 26) {
          u.footCop.dispose(this.scene);
          u.footCop = null;
        }
      }

      // Driving: hunt the player's predicted position.
      const lead = player.inCar ? 0.45 : 0.15;
      const tx = player.pos.x + (player.inCar ? player.inCar.forward().x * player.inCar.speed * lead : 0);
      const tz = player.pos.z + (player.inCar ? player.inCar.forward().z * player.inCar.speed * lead : 0);
      let throttle = 1;
      let steer = steerToward(car.heading, Math.atan2(tx - car.pos.x, tz - car.pos.z));
      if (u.reverseT > 0) {
        u.reverseT -= dt;
        throttle = -1;
        steer = -steer;
      } else if (car.stuck) {
        u.reverseT = 0.65;
      }
      // When alongside an on-foot player, stop to make the arrest.
      if (!player.inCar && distToPlayer < 8) throttle = 0;
      car.step(dt, { throttle, steer, brake: distToPlayer < 5 && !!player.inCar, hand: false }, colliders, allCars, ctx.onCopCrash);

      // Busted pressure: an officer (foot or car) close while the
      // player is slow or on foot.
      const playerSpeed = player.inCar ? Math.abs(player.inCar.speed) : player.speedNow;
      if (u.footCop && !u.footCop.down) {
        const fd = Math.hypot(u.footCop.pos.x - player.pos.x, u.footCop.pos.z - player.pos.z);
        if (fd < 5.5 && playerSpeed < 2.4) bustPressure = true;
      }
      if (!player.inCar && distToPlayer < 6.5 && Math.abs(car.speed) < 3 && playerSpeed < 2.4) bustPressure = true;
    }

    if (bustPressure && stars > 0) {
      this.bustedMeter = Math.min(1, this.bustedMeter + dt / 2.6);
    } else {
      this.bustedMeter = Math.max(0, this.bustedMeter - dt / 1.6);
    }
    return { nearestCopDist, anyCopNear: nearestCopDist < 48 };
  }

  reset() {
    for (const u of this.units) {
      u.car.dispose(this.scene);
      if (u.footCop) u.footCop.dispose(this.scene);
    }
    for (const body of this.corpses) body.dispose(this.scene);
    this.corpses = [];
    this.units = [];
    this.bustedMeter = 0;
  }

  // All live foot officers (for the player's gunfire and the minimap).
  footCops() {
    return this.units.map((u) => u.footCop).filter((f) => f && !f.down);
  }

  copCars() {
    return this.units.filter((u) => !u.leaving).map((u) => u.car);
  }
}

export function steerToward(heading, want) {
  let d = want - heading;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.max(-1, Math.min(1, d * 1.7));
}

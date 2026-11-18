// peds.js — the people of Palm Haven. Pedestrians stroll the
// sidewalks, cross at corners, hail taxis, run from gunfire and
// dive away from bad driving. Built from boxes, animated by code.

import { ROAD_XS, ROAD_ZS } from './city.js';

const THREE = window.THREE;

const SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
const SHIRTS = [0xef476f, 0xffd166, 0x06d6a0, 0x118ab2, 0xf78c6b, 0x9b5de5, 0xffffff, 0x3a86ff];
const PANTS = [0x2b2d42, 0x555b6e, 0x8a7f6a, 0x274156, 0xd9d9d9];

const WALK_OFF = 11.9; // sidewalk offset from a road centre-line

export function buildPedMesh(rng) {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: SKIN[rng.int(0, SKIN.length - 1)] });
  const shirt = new THREE.MeshLambertMaterial({ color: SHIRTS[rng.int(0, SHIRTS.length - 1)] });
  const pants = new THREE.MeshLambertMaterial({ color: PANTS[rng.int(0, PANTS.length - 1)] });

  const legGeo = new THREE.BoxGeometry(0.16, 0.78, 0.18);
  legGeo.translate(0, -0.39, 0);
  const legL = new THREE.Mesh(legGeo, pants);
  legL.position.set(-0.11, 0.8, 0);
  const legR = new THREE.Mesh(legGeo, pants);
  legR.position.set(0.11, 0.8, 0);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.26), shirt);
  torso.position.y = 1.12;
  const armGeo = new THREE.BoxGeometry(0.11, 0.6, 0.13);
  armGeo.translate(0, -0.3, 0);
  const armL = new THREE.Mesh(armGeo, shirt);
  armL.position.set(-0.33, 1.38, 0);
  const armR = new THREE.Mesh(armGeo, shirt);
  armR.position.set(0.33, 1.38, 0);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.3), skin);
  head.position.y = 1.62;
  g.add(legL, legR, torso, armL, armR, head);
  g.userData.parts = { legL, legR, armL, armR, torso };
  return g;
}

let nextPedId = 1;

export class Ped {
  constructor(scene, rng, x, z) {
    this.id = nextPedId++;
    this.mesh = buildPedMesh(rng);
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.pos = this.mesh.position;
    this.rng = rng;
    this.axis = rng.chance(0.5) ? 'v' : 'h';
    this.dir = rng.chance(0.5) ? 1 : -1;
    this.side = rng.chance(0.5) ? 1 : -1; // which side of the road
    this.roadIdx = this.axis === 'v' ? rng.int(0, ROAD_XS.length - 1) : rng.int(0, ROAD_ZS.length - 1);
    this.heading = 0;
    this.speed = rng.range(1.1, 1.7);
    this.state = 'walk'; // walk | flee | down | hail | ride
    this.stateT = 0;
    this.walkPhase = rng.next() * 6;
    this.fleeFrom = null;
    this.dead = false;
    this.snapToWalkLine();
  }

  lineCoord() {
    const road = this.axis === 'v' ? ROAD_XS[this.roadIdx] : ROAD_ZS[this.roadIdx];
    return road + this.side * WALK_OFF;
  }

  snapToWalkLine() {
    if (this.axis === 'v') this.pos.x = this.lineCoord();
    else this.pos.z = this.lineCoord();
    this.heading = this.axis === 'v' ? (this.dir > 0 ? 0 : Math.PI) : this.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  }

  scare(fromPos, radius = 26) {
    const d = Math.hypot(this.pos.x - fromPos.x, this.pos.z - fromPos.z);
    if (d < radius && this.state === 'walk') {
      this.state = 'flee';
      this.stateT = 0;
      this.fleeFrom = { x: fromPos.x, z: fromPos.z };
    }
  }

  knockDown() {
    if (this.state === 'down') return;
    this.state = 'down';
    this.stateT = 0;
  }

  update(dt, ctx) {
    this.stateT += dt;
    const parts = this.mesh.userData.parts;
    let moving = 0;

    if (this.state === 'down') {
      this.mesh.rotation.x = -Math.PI / 2;
      this.mesh.position.y = 0.25;
      if (this.stateT > 7) {
        // Bruised but alive: get up and hurry off.
        this.mesh.rotation.x = 0;
        this.mesh.position.y = 0;
        this.state = 'flee';
        this.stateT = 0;
        this.fleeFrom = { x: this.pos.x + this.rng.spread(10), z: this.pos.z + this.rng.spread(10) };
      }
      return;
    }
    if (this.state === 'ride') {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;

    if (this.state === 'hail') {
      // Stand at the kerb, arm up, waiting for a taxi (the player).
      parts.armR.rotation.x = -2.6;
      parts.armL.rotation.x = Math.sin(this.walkPhase * 2) * 0.08;
      this.walkPhase += dt * 2;
      return;
    }

    let vx = 0;
    let vz = 0;
    if (this.state === 'flee') {
      const dx = this.pos.x - (this.fleeFrom ? this.fleeFrom.x : this.pos.x);
      const dz = this.pos.z - (this.fleeFrom ? this.fleeFrom.z : this.pos.z);
      const d = Math.hypot(dx, dz) || 1;
      vx = (dx / d) * 3.6;
      vz = (dz / d) * 3.6;
      this.heading = Math.atan2(vx, vz);
      moving = 3.6;
      if (this.stateT > 4.5) {
        this.state = 'walk';
        this.stateT = 0;
        this.snapToWalkLine();
      }
    } else {
      // Stroll the sidewalk; at a crossing, sometimes swap lines.
      if (this.axis === 'v') {
        vz = this.dir * this.speed;
        this.pos.x += (this.lineCoord() - this.pos.x) * Math.min(1, dt * 3);
        const cross = this.nearestCross(ROAD_ZS, this.pos.z);
        if (cross !== null && Math.abs(cross - this.pos.z) < 0.8 && this.rng.chance(0.3)) {
          this.axis = 'h';
          this.roadIdx = ROAD_ZS.indexOf(cross);
          this.dir = this.rng.chance(0.5) ? 1 : -1;
          this.side = this.rng.chance(0.5) ? 1 : -1;
        }
      } else {
        vx = this.dir * this.speed;
        this.pos.z += (this.lineCoord() - this.pos.z) * Math.min(1, dt * 3);
        const cross = this.nearestCross(ROAD_XS, this.pos.x);
        if (cross !== null && Math.abs(cross - this.pos.x) < 0.8 && this.rng.chance(0.3)) {
          this.axis = 'v';
          this.roadIdx = ROAD_XS.indexOf(cross);
          this.dir = this.rng.chance(0.5) ? 1 : -1;
          this.side = this.rng.chance(0.5) ? 1 : -1;
        }
      }
      this.heading = Math.atan2(vx, vz);
      moving = this.speed;
    }

    this.pos.x += vx * dt;
    this.pos.z += vz * dt;
    this.pos.x = Math.max(-360, Math.min(360, this.pos.x));
    this.pos.z = Math.max(-285, Math.min(215, this.pos.z));

    // Being hit by a moving car is the city's main occupational hazard.
    for (const car of ctx.cars) {
      if (car.dead) continue;
      const dx = this.pos.x - car.pos.x;
      const dz = this.pos.z - car.pos.z;
      if (dx * dx + dz * dz < 2.6 && Math.abs(car.speed) > 3.5) {
        this.knockDown();
        if (ctx.onPedHit) ctx.onPedHit(this, car);
        break;
      }
    }

    // Walk cycle.
    this.walkPhase += dt * (moving > 2 ? 11 : 7);
    const sw = Math.sin(this.walkPhase) * (moving > 0.1 ? 0.55 : 0);
    parts.legL.rotation.x = sw;
    parts.legR.rotation.x = -sw;
    parts.armL.rotation.x = -sw * 0.7;
    parts.armR.rotation.x = sw * 0.7;
    this.mesh.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.05;
    this.mesh.rotation.y = this.heading;
  }

  nearestCross(roads, along) {
    let best = null;
    for (const r of roads) {
      if (best === null || Math.abs(r - along) < Math.abs(best - along)) best = r;
    }
    return best;
  }

  dispose(scene) {
    scene.remove(this.mesh);
    this.dead = true;
  }
}

export class PedSystem {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.peds = [];
  }

  update(dt, playerPos, ctx) {
    while (this.peds.length < 18) {
      const a = this.rng.next() * Math.PI * 2;
      const d = this.rng.range(50, 130);
      const x = playerPos.x + Math.cos(a) * d;
      const z = Math.min(210, playerPos.z + Math.sin(a) * d);
      if (x < -350 || x > 350 || z < -280) continue;
      this.peds.push(new Ped(this.scene, this.rng, x, z));
    }
    for (let i = this.peds.length - 1; i >= 0; i--) {
      const p = this.peds[i];
      const d = Math.hypot(p.pos.x - playerPos.x, p.pos.z - playerPos.z);
      if (d > 240) {
        p.dispose(this.scene);
        this.peds.splice(i, 1);
        continue;
      }
      p.update(dt, ctx);
    }
  }

  scareAll(fromPos, radius) {
    for (const p of this.peds) p.scare(fromPos, radius);
  }
}

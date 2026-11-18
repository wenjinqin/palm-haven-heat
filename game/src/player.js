// player.js — Dario "Dax" Marlin, the player's on-foot body: third
// person movement, sprinting, a pistol with a real magazine, health
// and the knock-down bookkeeping the rest of the game reads.

import { collideCircle, WATER_Z } from './city.js';

const THREE = window.THREE;

export function buildPlayerMesh() {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xc68642 });
  const shirt = new THREE.MeshLambertMaterial({ color: 0x0fb5ae });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2b2d42 });
  const legGeo = new THREE.BoxGeometry(0.17, 0.8, 0.19);
  legGeo.translate(0, -0.4, 0);
  const legL = new THREE.Mesh(legGeo, pants);
  legL.position.set(-0.11, 0.82, 0);
  const legR = new THREE.Mesh(legGeo, pants);
  legR.position.set(0.11, 0.82, 0);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.64, 0.27), shirt);
  torso.position.y = 1.15;
  const armGeo = new THREE.BoxGeometry(0.12, 0.62, 0.14);
  armGeo.translate(0, -0.31, 0);
  const armL = new THREE.Mesh(armGeo, shirt);
  armL.position.set(-0.34, 1.42, 0);
  const armR = new THREE.Mesh(armGeo, shirt);
  armR.position.set(0.34, 1.42, 0);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.35, 0.31), skin);
  head.position.y = 1.66;
  const shades = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.09, 0.05), new THREE.MeshLambertMaterial({ color: 0x111111 }));
  shades.position.set(0, 1.7, 0.16);
  // The pistol appears in the right hand when drawn.
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, 0.34), new THREE.MeshLambertMaterial({ color: 0x1c1e24 }));
  gun.position.set(0, -0.6, 0.12);
  gun.visible = false;
  armR.add(gun);
  g.add(legL, legR, torso, armL, armR, head, shades);
  g.userData.parts = { legL, legR, armL, armR, gun };
  return g;
}

export class Player {
  constructor(scene, x, z) {
    this.mesh = buildPlayerMesh();
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.pos = this.mesh.position;
    this.heading = Math.PI; // facing north into the city at spawn
    this.health = 100;
    this.maxHealth = 100;
    this.speedNow = 0;
    this.walkPhase = 0;
    this.inCar = null;
    this.armed = true;
    this.ammoInMag = 12;
    this.magSize = 12;
    this.reserve = 96;
    this.reloadT = 0;
    this.fireCd = 0;
    this.hurtT = 0; // time since last damage, drives health regen
    this.dead = false;
  }

  get alive() {
    return this.health > 0;
  }

  damage(amount) {
    if (this.dead) return;
    this.health = Math.max(0, this.health - amount);
    this.hurtT = 0;
    if (this.health <= 0) this.dead = true;
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  // move: {x, z} unit-ish input in world space (camera relative),
  // already computed by the caller.
  update(dt, move, sprint, colliders) {
    if (this.inCar) {
      // Ride with the car.
      this.pos.copy(this.inCar.pos);
      this.heading = this.inCar.heading;
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    const parts = this.mesh.userData.parts;
    const mag = Math.hypot(move.x, move.z);
    const speed = sprint ? 7.4 : 4.3;
    if (mag > 0.05) {
      const nx = move.x / Math.max(1, mag);
      const nz = move.z / Math.max(1, mag);
      this.pos.x += nx * speed * dt;
      this.pos.z += nz * speed * dt;
      this.heading = Math.atan2(nx, nz);
      this.speedNow = speed;
    } else {
      this.speedNow = 0;
    }
    collideCircle(this.pos, 0.55, colliders);
    this.pos.x = Math.max(-368, Math.min(368, this.pos.x));
    this.pos.z = Math.max(-288, Math.min(WATER_Z + 118, this.pos.z));
    // The sea is out of bounds except on the pier.
    if (this.pos.z > WATER_Z + 4 && Math.abs(this.pos.x) > 6) {
      this.pos.z = WATER_Z + 4;
    }
    // Walk cycle and idle sway.
    this.walkPhase += dt * (this.speedNow > 5 ? 11 : 8);
    const sw = this.speedNow > 0.1 ? Math.sin(this.walkPhase) * 0.55 : 0;
    parts.legL.rotation.x = sw;
    parts.legR.rotation.x = -sw;
    parts.armL.rotation.x = -sw * 0.7;
    if (!this.aiming) parts.armR.rotation.x = sw * 0.7;
    this.mesh.position.y = this.speedNow > 0.1 ? Math.abs(Math.sin(this.walkPhase)) * 0.05 : 0;
    this.mesh.rotation.y = this.heading;

    // Timers: reload, fire cooldown, slow health regen out of trouble.
    this.fireCd = Math.max(0, this.fireCd - dt);
    this.hurtT += dt;
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const need = this.magSize - this.ammoInMag;
        const take = Math.min(need, this.reserve);
        this.ammoInMag += take;
        this.reserve -= take;
      }
    }
    if (this.hurtT > 6 && this.health > 0) this.heal(dt * 3.2);
  }

  startReload() {
    if (this.reloadT > 0 || this.ammoInMag >= this.magSize || this.reserve <= 0) return false;
    this.reloadT = 1.1;
    return true;
  }

  // Try to fire one round. Returns 'fired' | 'empty' | 'busy'.
  tryFire() {
    if (this.fireCd > 0 || this.reloadT > 0) return 'busy';
    if (this.ammoInMag <= 0) {
      this.startReload();
      return 'empty';
    }
    this.ammoInMag--;
    this.fireCd = 0.21;
    if (this.ammoInMag === 0) this.startReload();
    return 'fired';
  }

  setAiming(on) {
    this.aiming = on;
    const parts = this.mesh.userData.parts;
    parts.gun.visible = on && this.armed;
    parts.armR.rotation.x = on ? -1.35 : 0;
  }

  respawn(x, z) {
    this.health = this.maxHealth;
    this.dead = false;
    this.inCar = null;
    this.pos.set(x, 0, z);
    this.mesh.visible = true;
  }
}

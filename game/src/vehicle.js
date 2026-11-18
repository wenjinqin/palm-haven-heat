// vehicle.js — every car in Palm Haven: one mesh builder (sedans,
// coupes, taxis, vans and police interceptors from coloured boxes) and
// one arcade physics step shared by traffic, police and the player.

import { collideCircle, WATER_Z } from './city.js';

const THREE = window.THREE;

export const CAR_PAINTS = [0xef476f, 0xffd166, 0x06d6a0, 0x118ab2, 0xf78c6b, 0x9b5de5, 0xe0e1dd, 0x3a86ff, 0xff8fa3, 0x70d6ff];

const glassMat = new THREE.MeshLambertMaterial({ color: 0x22384a });
const tyreMat = new THREE.MeshLambertMaterial({ color: 0x17181c });
const chromeMat = new THREE.MeshLambertMaterial({ color: 0xb8bec9 });
const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c9 });
const tailMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });

export function buildCarMesh(kind, paint) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: paint });
  const isVan = kind === 'van';
  const isCop = kind === 'cop';
  const len = isVan ? 5.4 : 4.6;
  const wid = 2.0;
  const bodyH = isVan ? 1.5 : 0.62;

  const body = new THREE.Mesh(new THREE.BoxGeometry(wid, bodyH, len), bodyMat);
  body.position.y = 0.55 + bodyH / 2;
  g.add(body);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(wid * 0.92, 0.22, len * 0.3), bodyMat);
  hood.position.set(0, 0.72 + bodyH, len * 0.32);
  g.add(hood);
  if (!isVan) {
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(wid * 0.84, 0.55, len * 0.42), glassMat);
    cabin.position.set(0, 0.85 + bodyH, -len * 0.05);
    g.add(cabin);
  } else {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(wid * 0.94, 0.6, 1.1), glassMat);
    cab.position.set(0, 0.85 + bodyH, len * 0.38);
    g.add(cab);
  }
  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  const wx = wid / 2 - 0.05;
  const wz = len / 2 - 0.95;
  for (const [x, z] of [[-wx, wz], [wx, wz], [-wx, -wz], [wx, -wz]]) {
    const w = new THREE.Mesh(wheelGeo, tyreMat);
    w.position.set(x, 0.38, z);
    g.add(w);
    wheels.push(w);
  }
  // Lights.
  for (const s of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.08), lightMat);
    hl.position.set(s * wid * 0.32, 0.78, len / 2 + 0.01);
    g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.08), tailMat);
    tl.position.set(s * wid * 0.32, 0.82, -len / 2 - 0.01);
    g.add(tl);
  }
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(wid + 0.06, 0.24, 0.24), chromeMat);
  bumper.position.set(0, 0.5, len / 2 + 0.05);
  g.add(bumper);

  if (isCop) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(wid + 0.03, 0.3, len * 0.96), new THREE.MeshLambertMaterial({ color: 0xf4f6f8 }));
    stripe.position.y = 0.95;
    g.add(stripe);
    const bar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2d55 }));
    red.position.x = -0.32;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.5), new THREE.MeshBasicMaterial({ color: 0x2d7dff }));
    blue.position.x = 0.32;
    bar.add(red);
    bar.add(blue);
    bar.position.set(0, 1.62, -0.2);
    bar.name = 'lightbar';
    g.add(bar);
  }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.26, 0.4), new THREE.MeshBasicMaterial({ color: 0xffe45e }));
    sign.position.set(0, 1.62, -0.2);
    g.add(sign);
  }
  g.userData.wheels = wheels;
  g.userData.len = len;
  return g;
}

let nextCarId = 1;

export class Car {
  constructor(scene, kind, paint, x, z, heading) {
    this.id = nextCarId++;
    this.kind = kind;
    this.mesh = buildCarMesh(kind, paint);
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.pos = this.mesh.position;
    this.heading = heading; // radians; forward = (sin h, 0, cos h)
    this.speed = 0;
    this.steerVis = 0;
    this.damage = 0; // 0..1
    this.driver = 'parked'; // parked | traffic | player | police
    this.occupied = false;
    this.radius = 2.1;
    this.len = this.mesh.userData.len;
    this.dead = false;
    this.honkCd = 0;
  }

  forward() {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  }

  // One arcade step. input: {throttle -1..1, steer -1..1, brake bool, hand bool}
  step(dt, input, colliders, others, onCrash) {
    const maxSpeed = this.kind === 'cop' ? 40 : this.kind === 'coupe' ? 37 : 31;
    const accel = this.kind === 'cop' ? 17 : 14;
    let s = this.speed;
    if (input.throttle > 0) s += accel * input.throttle * dt * (1 - Math.max(0, s) / (maxSpeed * 1.25));
    else if (input.throttle < 0) {
      if (s > 0.4) s -= 26 * dt; // braking
      else s = Math.max(-11, s - 9 * dt); // reverse
    }
    // Rolling drag and brake.
    s -= s * 0.55 * dt;
    if (input.brake) s -= Math.sign(s) * Math.min(Math.abs(s), 20 * dt);
    if (Math.abs(s) < 0.04 && input.throttle === 0) s = 0;
    s = Math.max(-12, Math.min(maxSpeed, s));
    this.speed = s;

    // Steering bites with speed and fades at very high speed; in
    // reverse the wheel works the other way, like a real car.
    const bite = Math.min(1, Math.abs(s) / 7) * (1 - Math.min(0.45, Math.abs(s) / 90));
    if (s !== 0) {
      this.heading -= input.steer * bite * (input.hand ? 1.7 : 1.05) * dt * Math.sign(s);
    }
    if (input.hand) this.speed -= this.speed * 1.4 * dt;

    const f = this.forward();
    const beforeX = this.pos.x;
    const beforeZ = this.pos.z;
    this.pos.x += f.x * s * dt;
    this.pos.z += f.z * s * dt;

    // Buildings: circle push-out; a hard stop costs damage.
    const hitWall = collideCircle(this.pos, this.radius * 0.82, colliders);
    if (hitWall && Math.abs(s) > 6) {
      this.damage = Math.min(1, this.damage + Math.abs(s) * 0.008);
      if (onCrash) onCrash(Math.abs(s), 'wall');
      this.speed = -s * 0.18;
    } else if (hitWall) {
      this.speed *= 0.5;
    }

    // Other cars: soft circle repulsion, crunch on speed difference.
    for (const o of others) {
      if (o === this || o.dead) continue;
      const dx = this.pos.x - o.pos.x;
      const dz = this.pos.z - o.pos.z;
      const rr = this.radius + o.radius - 0.5;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 0.001) {
        const d = Math.sqrt(d2);
        const push = (rr - d) / 2;
        const nx = dx / d;
        const nz = dz / d;
        this.pos.x += nx * push;
        this.pos.z += nz * push;
        o.pos.x -= nx * push;
        o.pos.z -= nz * push;
        const rel = Math.abs(this.speed - o.speed);
        if (rel > 7) {
          this.damage = Math.min(1, this.damage + rel * 0.006);
          o.damage = Math.min(1, o.damage + rel * 0.006);
          if (onCrash) onCrash(rel, 'car', o);
        }
        this.speed *= 0.82;
      }
    }

    // Keep the car inside the world and out of the deep water.
    this.pos.x = Math.max(-380, Math.min(380, this.pos.x));
    this.pos.z = Math.max(-300, Math.min(560, this.pos.z));
    if (this.pos.z > WATER_Z + 2 && Math.abs(this.pos.x) > 6) {
      this.pos.z = WATER_Z + 2;
      this.speed *= 0.45;
    }

    // Visuals: yaw, wheel spin and steer, damage smoke tint.
    this.mesh.rotation.y = this.heading;
    const wheels = this.mesh.userData.wheels;
    const spin = (s * dt) / 0.38;
    wheels.forEach((w, i) => {
      w.rotation.x += spin;
      if (i < 2) w.rotation.y = -input.steer * 0.42;
    });
    this.steerVis = input.steer;
    // If physics barely moved us while throttling, we are wedged.
    this.stuck = Math.abs(s) > 4 && Math.hypot(this.pos.x - beforeX, this.pos.z - beforeZ) < 0.02;
    return hitWall;
  }

  dispose(scene) {
    scene.remove(this.mesh);
    this.dead = true;
  }
}

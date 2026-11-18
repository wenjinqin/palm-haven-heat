// traffic.js — Palm Haven's everyday drivers. Traffic cars pick a lane
// on the road grid, cruise it, turn at intersections, brake for whoever
// is in front of them and (mostly) obey the fiction that this is a
// normal city. Parked cars wait at the kerb and in the lots, stealable.

import { Car, CAR_PAINTS } from './vehicle.js';
import { ROAD_XS, ROAD_ZS, blockCenterX, blockCenterZ, COLS, ROWS } from './city.js';
import { hash2 } from './rng.js';

const LANE = 4.4;

function laneCoord(road, dir) {
  // Right-hand traffic: the lane sits to the driver's right.
  return road + (dir > 0 ? -LANE : LANE);
}

function headingFor(axis, dir) {
  if (axis === 'v') return dir > 0 ? 0 : Math.PI;
  return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class TrafficCar {
  constructor(scene, rng, x, z) {
    this.axis = rng.chance(0.5) ? 'v' : 'h';
    this.dir = rng.chance(0.5) ? 1 : -1;
    this.roadIdx = this.axis === 'v' ? rng.int(0, ROAD_XS.length - 1) : rng.int(0, ROAD_ZS.length - 1);
    const kind = rng.pick(['sedan', 'sedan', 'coupe', 'taxi', 'van']);
    const paint = kind === 'taxi' ? 0xffc300 : CAR_PAINTS[rng.int(0, CAR_PAINTS.length - 1)];
    this.car = new Car(scene, kind, paint, x, z, headingFor(this.axis, this.dir));
    this.car.driver = 'traffic';
    this.cruise = rng.range(10, 14.5);
    this.turnAt = null; // intersection coordinate where we may turn
    this.rng = rng;
    this.snapToLane();
  }

  snapToLane() {
    if (this.axis === 'v') {
      this.car.pos.x = laneCoord(ROAD_XS[this.roadIdx], this.dir);
      this.car.heading = headingFor('v', this.dir);
    } else {
      this.car.pos.z = laneCoord(ROAD_ZS[this.roadIdx], this.dir);
      this.car.heading = headingFor('h', this.dir);
    }
  }

  // The next intersection ahead of us on this road, if any.
  nextCrossing() {
    const roads = this.axis === 'v' ? ROAD_ZS : ROAD_XS;
    const along = this.axis === 'v' ? this.car.pos.z : this.car.pos.x;
    let best = null;
    for (const r of roads) {
      const d = (r - along) * this.dir;
      if (d > 4 && (best === null || d < best.d)) best = { at: r, d };
    }
    return best;
  }

  computeInput(dt, obstacles) {
    const car = this.car;
    const cross = this.nextCrossing();

    // Choose a manoeuvre once per crossing, while it is still ahead.
    if (cross && cross.d < 30 && this.pendingTurn === undefined) {
      const roll = this.rng.next();
      this.pendingTurn = roll < 0.4 ? 'left' : roll < 0.8 ? 'right' : 'straight';
    }
    if (!cross || cross.d > 44) this.pendingTurn = undefined;

    let tx;
    let tz;
    const turning = cross && this.pendingTurn && this.pendingTurn !== 'straight' && cross.d < 24;
    if (turning) {
      const crossRoads = this.axis === 'v' ? ROAD_ZS : ROAD_XS;
      const crossIdx = crossRoads.indexOf(cross.at);
      let newDir;
      if (this.axis === 'v') newDir = this.pendingTurn === 'left' ? this.dir : -this.dir;
      else newDir = this.pendingTurn === 'left' ? -this.dir : this.dir;
      if (this.axis === 'v') {
        // Turning onto a horizontal road: aim past the corner, on lane.
        tx = cross.at + newDir * 16;
        tz = laneCoord(ROAD_ZS[crossIdx], newDir);
      } else {
        tx = laneCoord(ROAD_XS[crossIdx], newDir);
        tz = cross.at + newDir * 16;
      }
      if (cross.d < 2.6) {
        // On the crossing: commit to the new leg.
        this.axis = this.axis === 'v' ? 'h' : 'v';
        this.dir = newDir;
        this.roadIdx = crossIdx;
        this.pendingTurn = undefined;
      }
    } else if (this.axis === 'v') {
      tx = laneCoord(ROAD_XS[this.roadIdx], this.dir);
      tz = car.pos.z + this.dir * 26;
    } else {
      tx = car.pos.x + this.dir * 26;
      tz = laneCoord(ROAD_ZS[this.roadIdx], this.dir);
    }

    const want = Math.atan2(tx - car.pos.x, tz - car.pos.z);
    const diff = angleDiff(want, car.heading);
    const steer = Math.max(-1, Math.min(1, diff * 1.6));

    // Obstacles: anything slow or stopped in our lane ahead.
    let throttle = 0.85;
    let brake = false;
    const f = car.forward();
    for (const o of obstacles) {
      const dx = o.pos.x - car.pos.x;
      const dz = o.pos.z - car.pos.z;
      const fwd = dx * f.x + dz * f.z;
      const lat = Math.abs(dx * f.z - dz * f.x);
      if (fwd > 0.5 && fwd < 11 && lat < 2.4) {
        const oSpeed = o.speed !== undefined ? Math.abs(o.speed) : 0;
        if (fwd < 5.5) {
          throttle = 0;
          brake = true;
        } else if (Math.abs(car.speed) > oSpeed + 1) {
          throttle = 0.1;
        }
      }
    }
    // Slow for the turn itself.
    if (Math.abs(diff) > 0.35 && Math.abs(car.speed) > 7) {
      throttle = 0;
      brake = Math.abs(car.speed) > 10;
    }
    if (Math.abs(car.speed) > this.cruise) throttle = 0;
    return { throttle, steer, brake, hand: false };
  }
}

export class TrafficSystem {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.cars = []; // TrafficCar
  }

  spawnNear(playerPos) {
    // Pick a road point 70–170 m from the player.
    for (let tries = 0; tries < 12; tries++) {
      const axis = this.rng.chance(0.5) ? 'v' : 'h';
      const road = axis === 'v' ? this.rng.pick(ROAD_XS) : this.rng.pick(ROAD_ZS);
      const along = this.rng.range(-320, 320);
      const x = axis === 'v' ? road : along;
      const z = axis === 'v' ? along : road;
      const d = Math.hypot(x - playerPos.x, z - playerPos.z);
      if (d > 65 && d < 190 && z < 200) {
        const tc = new TrafficCar(this.scene, this.rng, x, z);
        tc.car.pos.x = x;
        tc.car.pos.z = z;
        tc.snapToLane();
        if (tc.axis === 'v') tc.car.pos.z = z; else tc.car.pos.x = x;
        this.cars.push(tc);
        return tc;
      }
    }
    return null;
  }

  update(dt, playerPos, allCars, colliders, extraObstacles) {
    while (this.cars.length < 13) {
      if (!this.spawnNear(playerPos)) break;
    }
    const obstacles = [...allCars, ...extraObstacles];
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const tc = this.cars[i];
      const d = Math.hypot(tc.car.pos.x - playerPos.x, tc.car.pos.z - playerPos.z);
      if (d > 260 || tc.car.dead) {
        tc.car.dispose(this.scene);
        this.cars.splice(i, 1);
        continue;
      }
      const input = tc.computeInput(dt, obstacles);
      tc.car.step(dt, input, colliders, allCars, null);
    }
  }

  // Remove a car from traffic (the player just stole it).
  release(car) {
    const i = this.cars.findIndex((tc) => tc.car === car);
    if (i >= 0) this.cars.splice(i, 1);
  }
}

// Cars parked at the kerb and in the parking-lot blocks: stealable.
export function spawnParkedCars(scene, rng, colliders) {
  const parked = [];
  const kinds = ['sedan', 'coupe', 'van', 'sedan', 'taxi'];
  // Kerbside along the coast road and downtown streets.
  for (let i = 0; i < 14; i++) {
    const onCoast = i < 6;
    const x = onCoast ? rng.range(-280, 280) : blockCenterX(rng.int(2, 6)) + rng.spread(20);
    const z = onCoast ? 209 : blockCenterZ(rng.int(1, 4)) + 33;
    const car = new Car(scene, rng.pick(kinds), CAR_PAINTS[rng.int(0, CAR_PAINTS.length - 1)], x, z, onCoast ? Math.PI / 2 : 0);
    car.driver = 'parked';
    parked.push(car);
  }
  // Two parking-lot blocks get a little fleet each.
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      // Same hash the city builder uses to choose parking-lot blocks.
      if (hash2(c * 7 + 1, r * 13 + 5) < 0.12) {
        for (let k = 0; k < 4; k++) {
          const car = new Car(
            scene,
            rng.pick(kinds),
            CAR_PAINTS[rng.int(0, CAR_PAINTS.length - 1)],
            blockCenterX(c) - 15 + k * 9,
            blockCenterZ(r) + rng.spread(6),
            Math.PI,
          );
          car.driver = 'parked';
          parked.push(car);
        }
      }
    }
  }
  return parked;
}

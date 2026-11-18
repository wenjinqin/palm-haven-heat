// city.js — Palm Haven itself: a procedural, sun-soaked coastal city.
// A seeded grid of pastel blocks above a beach and boardwalk, with a
// wooden pier, palm-lined avenues, a marina lot and a few named
// landmarks the story missions use. Everything is generated from
// boxes, cylinders and canvas textures: no model files, no images.

import { makeRng, hash2 } from './rng.js';

const THREE = window.THREE;

export const BLOCK = 54; // city block size in metres
export const ROAD = 18; // road width
export const PITCH = BLOCK + ROAD; // 72
export const COLS = 9; // blocks east-west
export const ROWS = 6; // blocks north-south

export function blockCenterX(c) { return (c - (COLS - 1) / 2) * PITCH; }
export function blockCenterZ(r) { return (r - (ROWS - 1) / 2) * PITCH; }

// Road centre-lines: vertical roads sit between block columns.
export const ROAD_XS = [];
for (let i = 0; i <= COLS; i++) ROAD_XS.push((i - COLS / 2) * PITCH);
export const ROAD_ZS = [];
for (let j = 0; j <= ROWS; j++) ROAD_ZS.push((j - ROWS / 2) * PITCH);

export const BEACH_Z = blockCenterZ(ROWS - 1) + PITCH / 2 + 6; // sand starts
export const WATER_Z = BEACH_Z + 42; // open water
export const WORLD = {
  minX: ROAD_XS[0] - 30,
  maxX: ROAD_XS[ROAD_XS.length - 1] + 30,
  minZ: ROAD_ZS[0] - 30,
  maxZ: WATER_Z + 260,
};

const PASTELS = [0xf7e3c3, 0xf9c6b8, 0xbfe3dd, 0xcfe4f7, 0xf7d774, 0xe8dff5, 0xffd9e8, 0xd8f3dc, 0xffe5b4, 0xc3e7f0];

function facadeTexture(rng, base, floors, cols) {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  // Slight vertical shading so towers do not look flat.
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255,255,255,0.16)');
  grad.addColorStop(1, 'rgba(0,0,0,0.18)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 256);
  const winW = 128 / cols;
  const winH = 256 / floors;
  for (let f = 0; f < floors; f++) {
    for (let c = 0; c < cols; c++) {
      const lit = rng.next() < 0.42;
      g.fillStyle = lit ? 'rgba(255,214,140,0.95)' : 'rgba(38,58,74,0.85)';
      g.fillRect(c * winW + 3, f * winH + 4, winW - 6, winH - 8);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function box(w, h, d, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = false;
  m.receiveShadow = false;
  return m;
}

export function buildCity(scene, seed) {
  const rng = makeRng(seed);
  const colliders = [];
  const group = new THREE.Group();
  scene.add(group);

  // ---- ground: one warm asphalt-and-concrete slab for the city ----
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x8f8a80 });
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.maxX - WORLD.minX + 500, WATER_Z - WORLD.minZ + 60),
    groundMat,
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((WORLD.minX + WORLD.maxX) / 2, -0.05, (WORLD.minZ + WATER_Z) / 2);
  group.add(ground);

  // ---- ocean and beach ----
  const waterMat = new THREE.MeshPhongMaterial({ color: 0x1b7f8e, shininess: 120, specular: 0x99ddff });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(2400, 700), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.35, WATER_Z + 320);
  water.name = 'ocean';
  group.add(water);
  const sandMat = new THREE.MeshLambertMaterial({ color: 0xf2ddae });
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.maxX - WORLD.minX + 500, WATER_Z - BEACH_Z + 90), sandMat);
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.02, (BEACH_Z + WATER_Z) / 2 + 18);
  group.add(sand);

  // ---- roads: dark strips with painted dashes, over the ground ----
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x3c4148 });
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xf5d76e });
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0xe8e8e8 });
  function roadStrip(cx, cz, len, vertical) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(vertical ? ROAD : len, vertical ? len : ROAD), roadMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(cx, 0.02, cz);
    group.add(m);
    const dashCount = Math.floor(len / 9);
    for (let i = 0; i < dashCount; i++) {
      const off = -len / 2 + 4.5 + i * 9;
      const d = new THREE.Mesh(new THREE.PlaneGeometry(vertical ? 0.35 : 3.4, vertical ? 3.4 : 0.35), dashMat);
      d.rotation.x = -Math.PI / 2;
      d.position.set(vertical ? cx : cx + off, 0.045, vertical ? cz + off : cz);
      group.add(d);
    }
    for (const side of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.PlaneGeometry(vertical ? 0.3 : len, vertical ? len : 0.3), edgeMat);
      e.rotation.x = -Math.PI / 2;
      e.position.set(vertical ? cx + side * (ROAD / 2 - 0.4) : cx, 0.04, vertical ? cz : cz + side * (ROAD / 2 - 0.4));
      group.add(e);
    }
  }
  const cityZLen = ROAD_ZS[ROAD_ZS.length - 1] - ROAD_ZS[0];
  const cityZMid = (ROAD_ZS[0] + ROAD_ZS[ROAD_ZS.length - 1]) / 2;
  for (const x of ROAD_XS) roadStrip(x, cityZMid, cityZLen + ROAD, true);
  const cityXLen = ROAD_XS[ROAD_XS.length - 1] - ROAD_XS[0];
  const cityXMid = (ROAD_XS[0] + ROAD_XS[ROAD_XS.length - 1]) / 2;
  for (const z of ROAD_ZS) roadStrip(cityXMid, z, cityXLen + ROAD, false);
  // Coast road along the boardwalk.
  roadStrip(cityXMid, BEACH_Z - 8, cityXLen + ROAD, false);

  // ---- blocks: pavement slab, then buildings, palms and props ----
  const facadeMats = [];
  for (let i = 0; i < 6; i++) {
    const tex = facadeTexture(rng, '#ffffff', 10, 6);
    facadeMats.push(new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffca7a, emissiveMap: tex, emissiveIntensity: 0.28 }));
  }
  const slabMat = new THREE.MeshLambertMaterial({ color: 0xcfc8ba });
  const roofMats = [0xb5654d, 0x8a9ba8, 0xd9a441, 0x7fb069, 0xe07a5f].map(
    (c) => new THREE.MeshLambertMaterial({ color: c }),
  );

  const downtown = (c, r) => Math.hypot(c - 4, r - 2.5);
  const blocks = [];
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const cx = blockCenterX(c);
      const cz = blockCenterZ(r);
      blocks.push({ c, r, cx, cz });
      const slab = box(BLOCK + 6, 0.3, BLOCK + 6, slabMat);
      slab.position.set(cx, 0.15, cz);
      group.add(slab);

      const roll = hash2(c * 7 + 1, r * 13 + 5);
      if (roll < 0.12) {
        // Parking lot block: painted bays, a few crates, no tower.
        const lot = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK - 4, BLOCK - 4), new THREE.MeshLambertMaterial({ color: 0x565b63 }));
        lot.rotation.x = -Math.PI / 2;
        lot.position.set(cx, 0.32, cz);
        group.add(lot);
        for (let i = 0; i < 5; i++) {
          const crate = box(2.2, 2.2, 2.2, new THREE.MeshLambertMaterial({ color: 0xa67c52 }));
          crate.position.set(cx + rng.spread(20), 1.4, cz + rng.spread(20));
          crate.rotation.y = rng.next() * 3;
          group.add(crate);
          colliders.push({ minX: crate.position.x - 1.4, maxX: crate.position.x + 1.4, minZ: crate.position.z - 1.4, maxZ: crate.position.z + 1.4 });
        }
        continue;
      }
      // One to four towers per block; downtown grows taller.
      const towers = roll < 0.4 ? 1 : roll < 0.75 ? 2 : 4;
      const cell = towers === 1 ? BLOCK - 10 : (BLOCK - 8) / 2;
      for (let t = 0; t < towers; t++) {
        const ox = towers === 1 ? 0 : (t % 2 === 0 ? -1 : 1) * (cell / 2 + 1);
        const oz = towers === 1 ? 0 : (t < 2 ? -1 : 1) * (cell / 2 + 1);
        const dist = downtown(c, r);
        const hBase = Math.max(10, 46 - dist * 8);
        const h = hBase * rng.range(0.55, 1.25) + rng.range(0, 8);
        const w = cell * rng.range(0.8, 1);
        const d = cell * rng.range(0.8, 1);
        const mat = facadeMats[Math.floor(hash2(c * 31 + t, r * 17) * facadeMats.length)];
        const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        tower.position.set(cx + ox, h / 2 + 0.3, cz + oz);
        tower.material = mat;
        group.add(tower);
        const roof = box(w + 0.6, 0.8, d + 0.6, roofMats[Math.floor(hash2(t, c + r) * roofMats.length)]);
        roof.position.set(cx + ox, h + 0.7, cz + oz);
        group.add(roof);
        // A coloured awning stripe gives each tower a little identity.
        const awn = box(w * 0.7, 1.1, 0.4, new THREE.MeshLambertMaterial({ color: PASTELS[Math.floor(hash2(c + t * 3, r) * PASTELS.length)] }));
        awn.position.set(cx + ox, 2.2, cz + oz + d / 2 + 0.2);
        group.add(awn);
        colliders.push({ minX: cx + ox - w / 2, maxX: cx + ox + w / 2, minZ: cz + oz - d / 2, maxZ: cz + oz + d / 2 });
      }
    }
  }

  // ---- palm trees: instanced trunks and fronds along beach + avenues ----
  const palmSpots = [];
  for (let x = WORLD.minX + 20; x < WORLD.maxX - 10; x += rng.range(16, 26)) {
    palmSpots.push({ x, z: BEACH_Z + rng.range(4, 26) });
  }
  for (const z of ROAD_ZS) {
    for (let x = ROAD_XS[0] + 20; x < ROAD_XS[ROAD_XS.length - 1]; x += 54) {
      if (rng.chance(0.5)) palmSpots.push({ x: x + rng.spread(3), z: z + ROAD / 2 + 3.4 });
    }
  }
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 6.4, 6);
  trunkGeo.translate(0, 3.2, 0);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x9a7b4f });
  const frondGeo = new THREE.ConeGeometry(3.4, 1.6, 8);
  frondGeo.translate(0, 6.6, 0);
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x3f9e4d });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  const fronds = new THREE.InstancedMesh(frondGeo, frondMat, palmSpots.length);
  const dummy = new THREE.Object3D();
  palmSpots.forEach((p, i) => {
    dummy.position.set(p.x, 0, p.z);
    dummy.rotation.set(rng.spread(0.06), rng.next() * Math.PI * 2, rng.spread(0.06));
    const s = rng.range(0.85, 1.3);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    fronds.setMatrixAt(i, dummy.matrix);
    colliders.push({ minX: p.x - 0.5, maxX: p.x + 0.5, minZ: p.z - 0.5, maxZ: p.z + 0.5 });
  });
  group.add(trunks);
  group.add(fronds);

  // ---- street lights along every road ----
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.09, 5.6, 5);
  poleGeo.translate(0, 2.8, 0);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x44484e });
  const lampGeo = new THREE.SphereGeometry(0.32, 6, 5);
  lampGeo.translate(0, 5.7, 0);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const lightSpots = [];
  for (const x of ROAD_XS) for (let z = ROAD_ZS[0] + 18; z < ROAD_ZS[ROAD_ZS.length - 1]; z += 48) lightSpots.push({ x: x + ROAD / 2 + 1, z });
  for (const z of ROAD_ZS) for (let x = ROAD_XS[0] + 24; x < ROAD_XS[ROAD_XS.length - 1]; x += 48) lightSpots.push({ x, z: z + ROAD / 2 + 1 });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lightSpots.length);
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, lightSpots.length);
  lightSpots.forEach((p, i) => {
    dummy.position.set(p.x, 0, p.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    poles.setMatrixAt(i, dummy.matrix);
    lamps.setMatrixAt(i, dummy.matrix);
  });
  group.add(poles);
  group.add(lamps);

  // ---- the pier: planks marching into the water, south centre ----
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6844 });
  const pier = new THREE.Group();
  const deck = box(10, 0.6, 130, pierMat);
  deck.position.set(0, 1.1, WATER_Z + 58);
  pier.add(deck);
  for (let i = 0; i < 9; i++) {
    for (const side of [-4.4, 4.4]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 3.4, 6), pierMat);
      post.position.set(side, -0.4, WATER_Z + 6 + i * 14);
      pier.add(post);
    }
  }
  const hut = box(7, 3.6, 7, new THREE.MeshLambertMaterial({ color: 0xe07a5f }));
  hut.position.set(0, 3.2, WATER_Z + 112);
  pier.add(hut);
  group.add(pier);
  colliders.push({ minX: -3.5, maxX: 3.5, minZ: WATER_Z + 108, maxZ: WATER_Z + 116 });

  // ---- beach dressing: umbrellas and a lifeguard stand ----
  const umbrellaMats = [0xef476f, 0xffd166, 0x06d6a0, 0x118ab2].map((c) => new THREE.MeshLambertMaterial({ color: c }));
  for (let i = 0; i < 16; i++) {
    const x = rng.range(WORLD.minX + 40, WORLD.maxX - 40);
    const z = BEACH_Z + rng.range(8, 30);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 5), poleMat);
    pole.position.set(x, 1.3, z);
    group.add(pole);
    const top = new THREE.Mesh(new THREE.ConeGeometry(1.9, 0.7, 8), umbrellaMats[i % umbrellaMats.length]);
    top.position.set(x, 2.7, z);
    group.add(top);
  }
  const stand = box(2.6, 3.4, 2.6, new THREE.MeshLambertMaterial({ color: 0xf4f1de }));
  stand.position.set(120, 1.7, BEACH_Z + 14);
  group.add(stand);
  colliders.push({ minX: 118.4, maxX: 121.6, minZ: BEACH_Z + 12.4, maxZ: BEACH_Z + 15.6 });

  // Named places the story uses.
  const landmarks = {
    garage: { x: blockCenterX(4), z: blockCenterZ(5) + 16, name: "Lola's Garage" },
    marina: { x: blockCenterX(0) - 10, z: blockCenterZ(4), name: 'Palm Haven Marina' },
    boardwalk: { x: -60, z: BEACH_Z - 8, name: 'The Boardwalk' },
    pierEnd: { x: 0, z: WATER_Z + 100, name: 'Pier Head' },
    hideout: { x: blockCenterX(8), z: blockCenterZ(0), name: 'Cliffside Hideout' },
    downtown: { x: blockCenterX(4), z: blockCenterZ(2), name: 'Downtown' },
    airport: { x: blockCenterX(1), z: blockCenterZ(0), name: 'Haven Airfield' },
  };

  // A glowing sign over the garage so players can find home base.
  const sign = box(13, 2.2, 0.5, new THREE.MeshBasicMaterial({ color: 0xff5d8f }));
  sign.position.set(landmarks.garage.x, 7.5, landmarks.garage.z + 7);
  group.add(sign);

  return { group, colliders, blocks, landmarks, water };
}

// Circle-vs-AABB resolution used by the player and every car: pushes
// the circle out of every collider it overlaps and reports contact.
export function collideCircle(pos, radius, colliders) {
  let hit = false;
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - nx;
    const dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * radius;
        pos.z = nz + (dz / d) * radius;
      } else {
        // Centre inside the box: leave by the shallowest face.
        const left = pos.x - c.minX;
        const right = c.maxX - pos.x;
        const top = pos.z - c.minZ;
        const bottom = c.maxZ - pos.z;
        const m = Math.min(left, right, top, bottom);
        if (m === left) pos.x = c.minX - radius;
        else if (m === right) pos.x = c.maxX + radius;
        else if (m === top) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      }
    }
  }
  return hit;
}

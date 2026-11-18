// Builds Palm Haven itself: the painted ground, the ocean, every building,
// palm, lamp and prop, and the collision footprints the actors respect.
// Buildings are merged into a handful of big geometries so the whole city
// costs a few dozen draw calls and runs anywhere.
import * as THREE from 'three';
import { BLOCKS, PLACES, PIER, world } from './layout.js';
import { makeGroundTexture, makeFacadeTexture, makeLeafTexture, makeSignTexture, makeWaterTexture } from './textures.js';

/** Concatenate non-indexed geometries that share position/normal/uv/color. */
function mergeGeoms(list) {
  let total = 0;
  for (const g of list) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  const col = new Float32Array(total * 3);
  let o3 = 0, o2 = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o3);
    nor.set(g.attributes.normal.array, o3);
    uv.set(g.attributes.uv.array, o2);
    col.set(g.attributes.color.array, o3);
    o3 += g.attributes.position.count * 3;
    o2 += g.attributes.position.count * 2;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

/** Paint a geometry one flat tint (fills its colour attribute). */
function tint(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** A box with facade UVs: the facade texture depicts a whole building
 *  face (about 19 m wide, tileH tall), so UVs scale by real metres and a
 *  short building simply shows the texture's lower floors. The roof
 *  samples the facade's plain patch so rooftops read as concrete. */
function facadeBox(w, h, d, x, y, z, tintHex, rotY = 0, tileH = 45) {
  const geo = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const uv = geo.attributes.uv;
  const faceW = [d, d, w, w, w, w]; // px, nx, py, ny, pz, nz (6 verts each)
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 6; v++) {
      const i = f * 6 + v;
      if (f === 2 || f === 3) uv.setXY(i, 0.07, 0.96);
      else uv.setXY(i, uv.getX(i) * (faceW[f] / 19), uv.getY(i) * (h / tileH));
    }
  }
  tint(geo, tintHex);
  geo.rotateY(rotY);
  geo.translate(x, y, z);
  return geo;
}

function plainBox(w, h, d, x, y, z, tintHex, rotY = 0) {
  const geo = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.07, 0.96);
  tint(geo, tintHex);
  geo.rotateY(rotY);
  geo.translate(x, y, z);
  return geo;
}

function addCollider(cx, cz, w, d) {
  world.colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
}

const TINTS = [0xf3e5cf, 0xe8d8b8, 0xdfc9a8, 0xf6efe2, 0xd9e2e4, 0xf0d5c0, 0xe6cfae, 0xfaf3e3, 0xcfdde8, 0xf3d9c8];

export function buildCity(scene, rng) {
  const dynamic = { waterMats: [] };

  // ---- ground & sea -------------------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 600),
    new THREE.MeshLambertMaterial({ map: makeGroundTexture(rng) }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(40, 0, 0);
  ground.receiveShadow = true;
  scene.add(ground);

  const waterMat = new THREE.MeshPhongMaterial({
    map: makeWaterTexture(), color: 0x9fd8e8, transparent: true, opacity: 0.94, shininess: 90,
  });
  waterMat.map.repeat.set(10, 14);
  dynamic.waterMats.push(waterMat);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(320, 640), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(234 + 158, -0.25, 0);
  scene.add(water);
  // A second sheet for the marina basin south-east corner.
  const basin = new THREE.Mesh(new THREE.PlaneGeometry(150, 130), waterMat);
  basin.rotation.x = -Math.PI / 2;
  basin.position.set(255, -0.25, 235);
  scene.add(basin);

  // Distant mainland silhouettes across the water.
  const shore = [];
  for (let i = 0; i < 9; i++) {
    const h = rng.range(14, 44);
    shore.push(plainBox(rng.range(24, 60), h, 18, 470 + rng.range(-14, 14), h / 2, -240 + i * 60 + rng.range(-8, 8), 0x7d94a6));
  }
  const shoreMesh = new THREE.Mesh(mergeGeoms(shore), new THREE.MeshLambertMaterial({ vertexColors: true }));
  scene.add(shoreMesh);

  // ---- buildings ----------------------------------------------------------
  const facade = [];   // standard facade texture bucket
  const hotel = [];    // balcony facade bucket
  const plain = [];    // untextured coloured bucket (props, warehouses trim)
  const facadeMat = new THREE.MeshLambertMaterial({ map: makeFacadeTexture(rng, 'std'), vertexColors: true });
  const hotelMat = new THREE.MeshLambertMaterial({ map: makeFacadeTexture(rng, 'hotel'), vertexColors: true });

  const special = new Set(['7,-49', '-49,63', '-161,119', '7,7']);
  for (const b of BLOCKS) {
    const key = `${b.cx},${b.cz}`;
    if (b.district === 'park' || special.has(key)) continue;
    if (b.district === 'beachfront' && b.cz === -161) continue; // Sunset Bar plot
    if (b.district === 'beachfront' && b.cz === -49) continue;  // Hotel Azure plot
    const bucket = b.district === 'beachfront' ? hotel : facade;
    if (b.district === 'docks') {
      // One or two long warehouses.
      const n = rng.int(1, 2);
      for (let i = 0; i < n; i++) {
        const w = rng.range(26, 34), d = rng.range(16, 22), h = rng.range(7, 10);
        const x = b.cx + (n === 2 ? (i === 0 ? -9 : 9) : 0) + rng.range(-2, 2);
        const z = b.cz + rng.range(-6, 6);
        bucket.push(facadeBox(w, h, d, x, h / 2, z, rng.pick(TINTS), 0, b.district === 'beachfront' ? 38 : 45));
        addCollider(x, z, w, d);
      }
      continue;
    }
    const spots = rng.int(2, 4);
    const cell = b.w / 2;
    const used = new Set();
    for (let i = 0; i < spots; i++) {
      const gx = rng.int(0, 1), gz = rng.int(0, 1);
      const id = gx * 2 + gz;
      if (used.has(id)) continue;
      used.add(id);
      const w = rng.range(13, 19), d = rng.range(13, 19);
      const x = b.cx - cell / 2 + gx * cell + rng.range(-1.5, 1.5);
      const z = b.cz - cell / 2 + gz * cell + rng.range(-1.5, 1.5);
      let h;
      if (b.district === 'downtown') h = rng.range(26, 62);
      else if (b.district === 'beachfront') h = rng.range(20, 38);
      else if (b.district === 'marina') h = rng.range(8, 17);
      else h = rng.range(9, 24);
      bucket.push(facadeBox(w, h, d, x, h / 2, z, rng.pick(TINTS), 0, b.district === 'beachfront' ? 38 : 45));
      addCollider(x, z, w, d);
    }
  }

  // Police HQ: a broad civic block with a blue band.
  {
    const { x, z } = PLACES.policeHQ;
    facade.push(facadeBox(30, 15, 24, x, 7.5, z, 0xdfe6ea));
    plain.push(plainBox(31, 2.2, 25, x, 13.5, z, 0x2b5ea7));
    addCollider(x, z, 30, 24);
  }
  // Fresh Coat Customs: garage with an open-front look and a drive-in pad.
  {
    const { x, z } = PLACES.customs;
    facade.push(facadeBox(24, 8, 18, x, 4, z - 4, 0xf3e5cf));
    plain.push(plainBox(16, 4.5, 0.8, x, 2.25, z + 5.4, 0x3a3f45)); // roller door face
    addCollider(x, z - 4, 24, 18);
    world.sprayZone = { minX: x - 8, maxX: x + 8, minZ: z + 7, maxZ: z + 17 };
  }
  // Coral Court Motel: two-storey L of rooms around the forecourt.
  {
    const { x, z } = PLACES.motelSign;
    hotel.push(facadeBox(30, 7, 10, x, 3.5, z - 10, 0xf6d9c0, 0, 38));
    hotel.push(facadeBox(10, 7, 22, x - 10, 3.5, z + 4, 0xf6d9c0, 0, 38));
    addCollider(x, z - 10, 30, 10);
    addCollider(x - 10, z + 4, 10, 22);
  }
  // Hotel Azure: the beachfront tower.
  {
    const { x, z } = PLACES.azureHotel;
    hotel.push(facadeBox(22, 44, 16, x, 22, z, 0xeaf2f5, 0, 38));
    plain.push(plainBox(23, 2, 17, x, 44.6, z, 0x2b5ea7));
    addCollider(x, z, 22, 16);
  }
  // Sunset Bar: low, wide, neon-ready.
  {
    const { x, z } = PLACES.sunsetBar;
    facade.push(facadeBox(22, 7, 16, x, 3.5, z, 0xe8b4a0));
    addCollider(x, z, 22, 16);
  }
  // Fountain Plaza: basin, water disc and benches, no buildings.
  {
    const { x, z } = PLACES.plaza;
    const basinGeo = new THREE.CylinderGeometry(7.5, 8, 1.1, 20).toNonIndexed();
    tint(basinGeo, 0xcfc4ae);
    basinGeo.translate(x, 0.55, z);
    plain.push(basinGeo);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(6.8, 20), new THREE.MeshPhongMaterial({ color: 0x63b7d6, shininess: 120 }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(x, 1.05, z);
    scene.add(disc);
    addCollider(x, z, 13, 13);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      plain.push(plainBox(2.6, 0.5, 0.7, x + Math.cos(a) * 10.5, 0.45, z + Math.sin(a) * 10.5, 0x8a6f4d, -a));
    }
  }

  const facadeMesh = new THREE.Mesh(mergeGeoms(facade), facadeMat);
  facadeMesh.castShadow = true;
  facadeMesh.receiveShadow = true;
  scene.add(facadeMesh);
  const hotelMesh = new THREE.Mesh(mergeGeoms(hotel), hotelMat);
  hotelMesh.castShadow = true;
  scene.add(hotelMesh);

  // ---- greenery: palms and park trees -------------------------------------
  const trunks = [];
  const fronds = [];
  const canopies = [];
  const leafMat = new THREE.MeshLambertMaterial({ map: makeLeafTexture(), alphaTest: 0.45, side: THREE.DoubleSide });
  function palm(x, z, s = 1) {
    const lean = rng.range(-0.09, 0.09);
    const trunk = new THREE.CylinderGeometry(0.16, 0.3, 5.6, 5).toNonIndexed();
    tint(trunk, 0x8a6f4d);
    trunk.translate(0, 2.8, 0);
    const m = new THREE.Matrix4().makeRotationZ(lean).setPosition(x, 0, z);
    trunk.applyMatrix4(m);
    trunks.push(trunk);
    for (let i = 0; i < 3; i++) {
      const frond = new THREE.PlaneGeometry(5.8, 5.8).toNonIndexed();
      const colArr = new Float32Array(frond.attributes.position.count * 3).fill(1);
      frond.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
      // A three-plane star: flat plus two tilted, so the crown reads
      // from the street, from above, and from a low camera.
      frond.rotateX(-Math.PI / 2 + (i - 1) * 0.45);
      frond.rotateY(rng.range(0, Math.PI));
      frond.translate(x - Math.sin(lean) * 5.6, 5.8 * s, z);
      fronds.push(frond);
    }
  }
  for (let z = -205; z <= 205; z += 17) {
    palm(196.5, z + rng.range(-3, 3));
    if (rng.chance(0.6)) palm(206 + rng.range(0, 16), z + rng.range(-5, 5), 0.85);
  }
  for (const b of BLOCKS) {
    if (b.district !== 'park') continue;
    for (let i = 0; i < 7; i++) palm(b.cx + rng.range(-17, 17), b.cz + rng.range(-17, 17), rng.range(0.8, 1.15));
    for (let i = 0; i < 5; i++) {
      const tx = b.cx + rng.range(-16, 16), tz = b.cz + rng.range(-16, 16);
      const trunk = new THREE.CylinderGeometry(0.22, 0.34, 2.6, 5).toNonIndexed();
      tint(trunk, 0x74563a);
      trunk.translate(tx, 1.3, tz);
      trunks.push(trunk);
      const blob = new THREE.IcosahedronGeometry(rng.range(2.2, 3.4), 0).toNonIndexed();
      tint(blob, rng.pick([0x3f7d33, 0x4c8a3a, 0x5d9c4e]));
      blob.translate(tx, rng.range(3.6, 4.6), tz);
      canopies.push(blob);
    }
  }
  const trunkMesh = new THREE.Mesh(mergeGeoms(trunks), new THREE.MeshLambertMaterial({ vertexColors: true }));
  trunkMesh.castShadow = true;
  scene.add(trunkMesh);
  const frondMesh = new THREE.Mesh(mergeGeoms(fronds), leafMat);
  scene.add(frondMesh);
  const canopyMesh = new THREE.Mesh(mergeGeoms(canopies), new THREE.MeshLambertMaterial({ vertexColors: true }));
  canopyMesh.castShadow = true;
  scene.add(canopyMesh);

  // ---- street lamps ---------------------------------------------------------
  const poles = [];
  const heads = [];
  for (const x of [-189, -133, -77, -21, 35, 91, 147]) {
    for (let z = -196; z <= 196; z += 28) {
      const px = x + (Math.round(z / 28) % 2 === 0 ? 6.4 : -6.4);
      const pole = new THREE.CylinderGeometry(0.09, 0.12, 5.4, 5).toNonIndexed();
      tint(pole, 0x3a3f45);
      pole.translate(px, 2.7, z);
      poles.push(pole);
      const head = new THREE.SphereGeometry(0.32, 6, 5).toNonIndexed();
      tint(head, 0xffe6a8);
      head.translate(px, 5.5, z);
      heads.push(head);
    }
  }
  scene.add(new THREE.Mesh(mergeGeoms(poles), new THREE.MeshLambertMaterial({ vertexColors: true })));
  scene.add(new THREE.Mesh(mergeGeoms(heads), new THREE.MeshBasicMaterial({ vertexColors: true })));

  // ---- props: docks crates, marina boats, beach umbrellas -------------------
  const props = [];
  for (let i = 0; i < 14; i++) {
    const bx = 100 + rng.range(-4, 44), bz = 152 + rng.range(-4, 22);
    const s = rng.range(2, 3.6);
    props.push(plainBox(s, s, s, bx, s / 2, bz, rng.pick([0xb0653a, 0x3a7d8c, 0x8c8c46, 0x707880]), rng.range(0, 0.6)));
    if (rng.chance(0.8)) addCollider(bx, bz, s, s);
  }
  // Taco Sol stands: a counter box with a striped canopy.
  for (const t of PLACES.tacoStands) {
    props.push(plainBox(3.4, 2.4, 2.2, t.x, 1.2, t.z, 0xf3e5cf));
    props.push(plainBox(4.2, 0.25, 3.2, t.x, 2.9, t.z, 0xd94f30));
    addCollider(t.x, t.z, 3.4, 2.2);
  }
  const propMesh = new THREE.Mesh(mergeGeoms([...plain, ...props]), new THREE.MeshLambertMaterial({ vertexColors: true }));
  propMesh.castShadow = true;
  scene.add(propMesh);

  // Boats bobbing at the marina.
  const boats = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 8), new THREE.MeshLambertMaterial({ color: rng.pick([0xf2f2f2, 0xd94f30, 0x2b5ea7, 0xf2c230]) }));
    hull.position.y = 0.4;
    boat.add(hull);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 3), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    cabin.position.set(0, 1.4, -0.6);
    boat.add(cabin);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 6), new THREE.MeshLambertMaterial({ color: 0x888888 }));
    mast.position.set(0, 3.6, 1.4);
    boat.add(mast);
    boat.position.set(248 + (i % 3) * 13, 0, 128 + Math.floor(i / 3) * 34);
    boat.rotation.y = rng.range(-0.2, 0.2);
    boats.add(boat);
  }
  scene.add(boats);
  dynamic.boats = boats;

  // Beach umbrellas.
  const umb = [];
  for (let i = 0; i < 10; i++) {
    const ux = rng.range(206, 226), uz = rng.range(-190, 190);
    const cone = new THREE.ConeGeometry(1.7, 0.8, 7).toNonIndexed();
    tint(cone, rng.pick([0xd94f30, 0xf2c230, 0x2b9ec4, 0xf28bb4]));
    cone.translate(ux, 2.1, uz);
    umb.push(cone);
    const pole = new THREE.CylinderGeometry(0.05, 0.05, 2.1, 4).toNonIndexed();
    tint(pole, 0xe8e2d6);
    pole.translate(ux, 1.05, uz);
    umb.push(pole);
  }
  scene.add(new THREE.Mesh(mergeGeoms(umb), new THREE.MeshLambertMaterial({ vertexColors: true })));

  // ---- signs ----------------------------------------------------------------
  const signs = [
    { at: PLACES.motelSign, y: 9.5, name: 'CORAL COURT', tag: 'MOTEL · VACANCY', bg: '#123a5c', fg: '#ffd98a', dy: -16 },
    { at: PLACES.customs, y: 10, name: 'FRESH COAT', tag: 'CUSTOMS · PAINT & BODY', bg: '#22262b', fg: '#7fe0a8', dy: 13 },
    { at: PLACES.azureHotel, y: 47, name: 'HOTEL AZURE', tag: 'PALM HAVEN', bg: '#0e4d64', fg: '#ffffff', dy: 0 },
    { at: PLACES.sunsetBar, y: 8.2, name: 'SUNSET BAR', tag: 'LIVE MUSIC NIGHTLY', bg: '#5c1a3a', fg: '#ffb3d1', dy: 12 },
    { at: PLACES.policeHQ, y: 17.5, name: 'POLICE', tag: 'PALM HAVEN PD', bg: '#1c2f4a', fg: '#ffffff', dy: 14 },
    { at: PLACES.marina, y: 7, name: 'MARINA', tag: 'BOAT HIRE · FERRY', bg: '#0e4d64', fg: '#ffd98a', dy: -6 },
  ];
  for (const s of signs) {
    const tex = makeSignTexture(s.name, s.tag, s.bg, s.fg);
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(11, 2.75),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }),
    );
    board.position.set(s.at.x, s.y, s.at.z + s.dy);
    scene.add(board);
  }

  dynamic.tick = (t) => {
    waterMat.map.offset.set((t * 0.008) % 1, (t * 0.005) % 1);
    boats.children.forEach((b, i) => {
      b.position.y = Math.sin(t * 0.9 + i * 1.7) * 0.12;
      b.rotation.z = Math.sin(t * 0.7 + i) * 0.02;
    });
  };
  return dynamic;
}

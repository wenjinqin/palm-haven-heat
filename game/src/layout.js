// The city plan of Palm Haven, shared by the builder, the traffic, the
// minimap and the missions so every system agrees on where things are.
// Palm Haven is a coastal grid: six avenues run inland, a beach boulevard
// fronts the sand, and the ocean takes the east edge of the map.

export const ROAD_W = 14;                 // full width of a street, kerb to kerb
export const LANE = 3.6;                  // lane offset from a street centreline

// Centreline coordinates of the avenues (constant x) and streets (constant z).
export const AVENUES_X = [-189, -133, -77, -21, 35, 91, 147, 189];
export const STREETS_Z = [-189, -133, -77, -21, 35, 91, 147];

const BLOCK_PITCH = 56;
const BLOCK_SIZE = BLOCK_PITCH - ROAD_W;  // 42 m of buildable frontage

/** Centres of the inland blocks, west to east / north to south. */
function blockCentres() {
  const out = [];
  for (let i = 0; i < 6; i++) out.push(-189 + BLOCK_PITCH / 2 + 7 + i * BLOCK_PITCH - 7);
  return out; // [-161, -105, -49, 7, 63, 119]
}
const CENTRES = blockCentres();

function districtFor(cx, cz) {
  if (cx <= -105 && cz <= -133) return 'park';            // two NW blocks are the park
  if (cz >= 119) return 'docks';                          // southern row: warehouses
  if (cx >= -49 && cx <= 7 && cz >= -49 && cz <= 7) return 'downtown';
  if (cx >= 63 && cz >= 63) return 'marina';              // south-east leisure blocks
  return 'midtown';
}

/** Every city block: { cx, cz, w, d, district }. */
export const BLOCKS = [];
for (const cx of CENTRES) {
  for (const cz of CENTRES) {
    BLOCKS.push({ cx, cz, w: BLOCK_SIZE, d: BLOCK_SIZE, district: districtFor(cx, cz) });
  }
}
// The beachfront strip between Palm Avenue and the boulevard: hotels and bars.
for (const cz of CENTRES) {
  BLOCKS.push({ cx: 168, cz, w: 26, d: BLOCK_SIZE, district: 'beachfront' });
}

export const BEACH = { sandFrom: 199, waterFrom: 234 };
export const PIER = { z: 158, fromX: 226, toX: 292, width: 10 };

/** Named places the story and the HUD refer to. */
export const PLACES = {
  safehouse: { x: -147, z: 126, name: "Coral Court Motel (Jax's room)" },
  motelSign: { x: -161, z: 119 },
  policeHQ: { x: 7, z: -49, name: 'Palm Haven Police HQ' },
  customs: { x: -49, z: 63, name: 'Fresh Coat Customs' },
  sunsetBar: { x: 168, z: -161, name: 'Sunset Bar' },
  azureHotel: { x: 168, z: -49, name: 'Hotel Azure' },
  docks: { x: 119, z: 161, name: 'South Docks warehouse' },
  plaza: { x: 7, z: 7, name: 'Fountain Plaza' },
  marina: { x: 205, z: 158, name: 'Palm Haven Marina' },
  pierEnd: { x: 284, z: 158, name: 'Ferry Pier' },
  parkGate: { x: -161, z: -140, name: 'Palmetto Park' },
  tacoStands: [
    { x: -14, z: 42, name: 'Taco Sol' },
    { x: 98, z: -14, name: 'Taco Sol' },
    { x: 154, z: 98, name: 'Taco Sol' },
  ],
};

/** Player spawn: the motel forecourt, facing the street. */
export const SPAWN = { x: -140, z: 133, heading: Math.PI / 2 };

/** Live world state filled in while the city is built. */
export const world = {
  colliders: [],   // { minX, maxX, minZ, maxZ } solid building/prop footprints
  sprayZone: null, // Fresh Coat Customs drive-in pad { minX, maxX, minZ, maxZ }
};

/** True when a point sits on a street (not inside a block). */
export function onRoad(x, z) {
  const near = (v, lines) => lines.some((c) => Math.abs(v - c) <= ROAD_W / 2);
  if (near(x, AVENUES_X) && z >= -210 && z <= 210) return true;
  if (near(z, STREETS_Z) && x >= -210 && x <= 196) return true;
  if (x >= PIER.fromX && x <= PIER.toX && Math.abs(z - PIER.z) <= PIER.width / 2) return true;
  return false;
}

/** Push a circle at (x, z) out of every collider; returns the corrected point. */
export function collideCircle(x, z, r) {
  for (const c of world.colliders) {
    const nx = Math.max(c.minX, Math.min(x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - nx;
    const dz = z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * r;
        z = nz + (dz / d) * r;
      } else {
        // Centre inside the box: leave by the shallowest face.
        const left = x - c.minX, right = c.maxX - x, top = z - c.minZ, bottom = c.maxZ - z;
        const m = Math.min(left, right, top, bottom);
        if (m === left) x = c.minX - r;
        else if (m === right) x = c.maxX + r;
        else if (m === top) z = c.minZ - r;
        else z = c.maxZ + r;
      }
    }
  }
  return { x, z };
}

export function inSprayZone(x, z) {
  const s = world.sprayZone;
  return s !== null && x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ;
}

// Every texture in Palm Haven is painted on a canvas at load: the street
// map of the whole city, the building facades, the shop signs, the palm
// fronds. No image files, no downloads — the art direction is code.
import * as THREE from 'three';
import { AVENUES_X, STREETS_Z, BLOCKS, BEACH, PIER } from './layout.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(c, repeat) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
  }
  return t;
}

// The ground plane spans x in [-260, 340], z in [-300, 300].
export const GROUND = { minX: -260, sizeX: 600, minZ: -300, sizeZ: 600, px: 2048 };
const gx = (x) => ((x - GROUND.minX) / GROUND.sizeX) * GROUND.px;
const gz = (z) => ((z - GROUND.minZ) / GROUND.sizeZ) * GROUND.px;
const gw = (w) => (w / GROUND.sizeX) * GROUND.px;

/** The whole city painted from above: roads, markings, blocks, beach, pier. */
export function makeGroundTexture(rng) {
  const [c, g] = canvas(GROUND.px, GROUND.px);
  // Scrubland base beyond the streets.
  g.fillStyle = '#b7a678';
  g.fillRect(0, 0, GROUND.px, GROUND.px);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = rng.chance(0.5) ? 'rgba(120,110,70,0.25)' : 'rgba(220,205,160,0.22)';
    g.fillRect(rng.range(0, GROUND.px), rng.range(0, GROUND.px), rng.range(2, 7), rng.range(2, 7));
  }
  // City pavement under the blocks.
  g.fillStyle = '#a49e92';
  g.fillRect(gx(-214), gz(-214), gw(414), gw(428));
  // Blocks: park green, plaza tiles, the rest warm pavement.
  for (const b of BLOCKS) {
    if (b.district === 'park') {
      g.fillStyle = '#5d9c4e';
      g.fillRect(gx(b.cx - b.w / 2), gz(b.cz - b.d / 2), gw(b.w), gw(b.d));
      g.strokeStyle = 'rgba(240,230,190,0.8)';
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(gx(b.cx - b.w / 2), gz(b.cz));
      g.lineTo(gx(b.cx + b.w / 2), gz(b.cz));
      g.moveTo(gx(b.cx), gz(b.cz - b.d / 2));
      g.lineTo(gx(b.cx), gz(b.cz + b.d / 2));
      g.stroke();
    } else if (b.cx === 7 && b.cz === 7) {
      g.fillStyle = '#cbb9a0';
      g.fillRect(gx(b.cx - b.w / 2), gz(b.cz - b.d / 2), gw(b.w), gw(b.d));
      g.fillStyle = '#7fb6c9';
      g.beginPath();
      g.arc(gx(b.cx), gz(b.cz), gw(7), 0, Math.PI * 2);
      g.fill();
    } else {
      g.fillStyle = `hsl(${rng.range(32, 44)}, ${rng.range(8, 16)}%, ${rng.range(58, 66)}%)`;
      g.fillRect(gx(b.cx - b.w / 2), gz(b.cz - b.d / 2), gw(b.w), gw(b.d));
    }
  }
  // Roads: asphalt over everything the grid claims.
  g.fillStyle = '#33373d';
  for (const x of AVENUES_X) g.fillRect(gx(x - 7), gz(-214), gw(14), gw(428));
  for (const z of STREETS_Z) g.fillRect(gx(-214), gz(z - 7), gw(414), gw(14));
  // Kerb lines.
  g.fillStyle = 'rgba(230,225,210,0.55)';
  for (const x of AVENUES_X) {
    g.fillRect(gx(x - 7), gz(-214), 2.5, gw(428));
    g.fillRect(gx(x + 7) - 2.5, gz(-214), 2.5, gw(428));
  }
  for (const z of STREETS_Z) {
    g.fillRect(gx(-214), gz(z - 7), gw(414), 2.5);
    g.fillRect(gx(-214), gz(z + 7) - 2.5, gw(414), 2.5);
  }
  // Centre dashes.
  g.fillStyle = 'rgba(245,200,90,0.85)';
  for (const x of AVENUES_X) {
    for (let z = -210; z < 214; z += 12) g.fillRect(gx(x) - 1.2, gz(z), 2.4, gw(6));
  }
  for (const z of STREETS_Z) {
    for (let x = -210; x < 200; x += 12) g.fillRect(gx(x), gz(z) - 1.2, gw(6), 2.4);
  }
  // Crosswalks at every intersection.
  g.fillStyle = 'rgba(240,240,235,0.75)';
  for (const x of AVENUES_X) {
    for (const z of STREETS_Z) {
      for (let i = -2; i <= 2; i++) {
        g.fillRect(gx(x + i * 2.6 - 0.9), gz(z - 9.5), 1.8, gw(3.4));
        g.fillRect(gx(x + i * 2.6 - 0.9), gz(z + 6.1), 1.8, gw(3.4));
        g.fillRect(gx(x - 9.5), gz(z + i * 2.6 - 0.9), gw(3.4), 1.8);
        g.fillRect(gx(x + 6.1), gz(z + i * 2.6 - 0.9), gw(3.4), 1.8);
      }
    }
  }
  // Boardwalk, sand, and the pier.
  g.fillStyle = '#9a6f43';
  g.fillRect(gx(193), gz(-214), gw(7), gw(428));
  const sand = g.createLinearGradient(gx(BEACH.sandFrom), 0, gx(BEACH.waterFrom + 8), 0);
  sand.addColorStop(0, '#f0dcab');
  sand.addColorStop(1, '#e6cf92');
  g.fillStyle = sand;
  g.fillRect(gx(BEACH.sandFrom), gz(-260), gw(BEACH.waterFrom + 20 - BEACH.sandFrom), gw(520));
  g.fillStyle = '#8a6136';
  g.fillRect(gx(PIER.fromX), gz(PIER.z - PIER.width / 2), gw(PIER.toX - PIER.fromX), gw(PIER.width));
  g.strokeStyle = 'rgba(60,40,20,0.5)';
  g.lineWidth = 2;
  for (let x = PIER.fromX; x < PIER.toX; x += 4) {
    g.beginPath();
    g.moveTo(gx(x), gz(PIER.z - PIER.width / 2));
    g.lineTo(gx(x), gz(PIER.z + PIER.width / 2));
    g.stroke();
  }
  return toTexture(c);
}

/** A building facade: window grid on a plain field; the top-left patch is
 *  left blank so roof faces can sample it as plain concrete. */
export function makeFacadeTexture(rng, style) {
  const [c, g] = canvas(256, 512);
  g.fillStyle = '#e8e2d6';
  g.fillRect(0, 0, 256, 512);
  g.fillStyle = '#d8d2c4';
  g.fillRect(0, 0, 40, 40); // roof patch
  const cols = 6, rows = style === 'hotel' ? 12 : 15;
  const lit = style === 'hotel' ? 0.42 : 0.3;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const wx = 18 + x * 38, wy = 26 + y * (style === 'hotel' ? 40 : 31);
      const ww = 24, wh = style === 'hotel' ? 20 : 17;
      g.fillStyle = rng.chance(lit) ? '#ffd98a' : '#33454f';
      g.fillRect(wx, wy, ww, wh);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(wx, wy, ww, 4);
      if (style === 'hotel') {
        g.fillStyle = 'rgba(90,80,70,0.55)';
        g.fillRect(wx - 4, wy + wh + 3, ww + 8, 4); // balcony shadow
      }
    }
  }
  // Ground floor: darker band with a door and shopfront glass.
  g.fillStyle = 'rgba(60,55,48,0.85)';
  g.fillRect(0, 478, 256, 34);
  g.fillStyle = '#9fd4e8';
  g.fillRect(20, 484, 90, 22);
  g.fillRect(150, 484, 86, 22);
  return toTexture(c, true);
}

/** Palm fronds, drawn as tapering leaflets radiating from one point. */
export function makeLeafTexture() {
  const [c, g] = canvas(256, 256);
  g.clearRect(0, 0, 256, 256);
  g.translate(128, 132);
  for (let i = 0; i < 11; i++) {
    const spread = (i / 10 - 0.5) * 2.4; // fan from -69° to +69°
    g.save();
    g.rotate(spread);
    const grad = g.createLinearGradient(0, 0, 0, -128);
    grad.addColorStop(0, '#2e7d32');
    grad.addColorStop(1, '#6fbf4a');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(13, -62, 5, -126);
    g.quadraticCurveTo(-7, -66, 0, 0);
    g.fill();
    g.restore();
  }
  const t = toTexture(c);
  return t;
}

/** A painted sign board: business name in big type, optional tagline. */
export function makeSignTexture(name, tagline, bg, fg) {
  const [c, g] = canvas(512, 128);
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = fg;
  g.lineWidth = 5;
  g.strokeRect(7, 7, 498, 114);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.font = 'bold 52px Georgia, serif';
  g.fillText(name, 256, tagline ? 62 : 82);
  if (tagline) {
    g.font = '24px Georgia, serif';
    g.fillText(tagline, 256, 102);
  }
  return toTexture(c);
}

/** Gentle repeating wave streaks for the ocean plane. */
export function makeWaterTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#1f7f9e';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(255,255,255,0.16)';
  g.lineWidth = 3;
  for (let i = 0; i < 26; i++) {
    const y = Math.random() * 256;
    g.beginPath();
    g.moveTo(Math.random() * 200, y);
    g.quadraticCurveTo(Math.random() * 256, y + 6, Math.random() * 256, y);
    g.stroke();
  }
  return toTexture(c, true);
}

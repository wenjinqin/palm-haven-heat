// The HUD: cash, health, wanted stars, the clock, mission banners and
// prompts over the 3D view — and the minimap, a live canvas plot of the
// streets around the player with mission and police blips. All DOM is
// declared in index.html; this file only drives it.
import { AVENUES_X, STREETS_Z, BLOCKS, BEACH, ROAD_W } from './layout.js';

const el = {};
let mapCtx = null;
let bannerTimer = 0;

export function initHud() {
  for (const id of ['hud', 'cash', 'rep', 'clock', 'stars', 'healthfill', 'armorfill', 'bustwrap', 'bustfill',
    'speedo', 'objective', 'banner', 'banner-title', 'banner-sub', 'prompt', 'toast', 'crosshair', 'minimap', 'vignette']) {
    el[id] = document.getElementById(id);
  }
  mapCtx = el.minimap.getContext('2d');
}

export function showHud(on) {
  el.hud.style.display = on ? 'block' : 'none';
}

export function setCash(n) {
  el.cash.textContent = '$' + Math.max(0, Math.floor(n)).toLocaleString('en-US');
}
export function setRep(n) {
  el.rep.textContent = 'REP ' + n;
}
export function setClock(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  el.clock.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
export function setStars(n) {
  el.stars.textContent = '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
  el.stars.style.color = n > 0 ? '#ffd94d' : 'rgba(255,255,255,0.25)';
}
export function setHealth(share) {
  el.healthfill.style.width = Math.max(0, share * 100) + '%';
  el.healthfill.style.background = share < 0.3 ? '#e23b2e' : '#57c84d';
}
export function setBust(meter) {
  el.bustwrap.style.display = meter > 0.02 ? 'block' : 'none';
  el.bustfill.style.width = Math.min(100, meter * 100) + '%';
}
export function setSpeed(kmh, carName) {
  if (carName === null) {
    el.speedo.style.display = 'none';
    return;
  }
  el.speedo.style.display = 'block';
  el.speedo.innerHTML = `${Math.round(kmh)}<small> km/h · ${carName}</small>`;
}
export function setObjective(text) {
  el.objective.textContent = text ?? '';
  el.objective.style.display = text ? 'block' : 'none';
}
export function showPrompt(text) {
  el.prompt.textContent = text ?? '';
  el.prompt.style.display = text ? 'block' : 'none';
}
export function showCrosshair(on) {
  el.crosshair.style.display = on ? 'block' : 'none';
}
export function banner(title, sub, seconds = 4) {
  el['banner-title'].textContent = title;
  el['banner-sub'].textContent = sub ?? '';
  el.banner.style.opacity = '1';
  bannerTimer = seconds;
}
export function toast(text, seconds = 3) {
  el.toast.textContent = text;
  el.toast.style.opacity = '1';
  el.toast.dataset.until = String(performance.now() + seconds * 1000);
}
export function flashDamage() {
  el.vignette.style.opacity = '0.55';
  setTimeout(() => { el.vignette.style.opacity = '0'; }, 90);
}
export function tickHud(dt) {
  if (bannerTimer > 0) {
    bannerTimer -= dt;
    if (bannerTimer <= 0) el.banner.style.opacity = '0';
  }
  if (el.toast.style.opacity === '1' && performance.now() > Number(el.toast.dataset.until || 0)) {
    el.toast.style.opacity = '0';
  }
}

/** Draw the minimap. view: { x, z, heading, markers: [{x, z, color, kind}], police: [{x, z}] } */
export function drawMinimap(view) {
  const g = mapCtx;
  if (!g) return;
  const S = 190, C = S / 2, RANGE = 135;
  const scale = C / RANGE;
  const px = (x) => C + (x - view.x) * scale;
  const pz = (z) => C + (z - view.z) * scale;
  g.clearRect(0, 0, S, S);
  g.fillStyle = '#274b63';
  g.fillRect(0, 0, S, S);
  // Land mass.
  g.fillStyle = '#3d4a42';
  g.fillRect(px(-260), pz(-260), 500 * scale, 520 * scale);
  // Blocks as city grain under the roads.
  g.fillStyle = '#46534a';
  for (const b of BLOCKS) {
    if (b.district === 'park') continue;
    g.fillRect(px(b.cx - b.w / 2), pz(b.cz - b.d / 2), b.w * scale, b.d * scale);
  }
  // Park blocks.
  g.fillStyle = '#3f7d33';
  for (const b of BLOCKS) {
    if (b.district !== 'park') continue;
    g.fillRect(px(b.cx - b.w / 2), pz(b.cz - b.d / 2), b.w * scale, b.d * scale);
  }
  // Sand + water edge.
  g.fillStyle = '#d9c084';
  g.fillRect(px(BEACH.sandFrom), 0, (BEACH.waterFrom - BEACH.sandFrom) * scale, S);
  // Roads.
  g.fillStyle = '#15181c';
  for (const x of AVENUES_X) g.fillRect(px(x - ROAD_W / 2), 0, ROAD_W * scale, S);
  for (const z of STREETS_Z) g.fillRect(0, pz(z - ROAD_W / 2), S, ROAD_W * scale);
  // Mission + side-job markers.
  for (const m of view.markers ?? []) {
    const mx = Math.max(8, Math.min(S - 8, px(m.x)));
    const mz = Math.max(8, Math.min(S - 8, pz(m.z)));
    g.fillStyle = m.color;
    if (m.kind === 'target') {
      g.save();
      g.translate(mx, mz);
      g.rotate(Math.PI / 4);
      g.fillRect(-5, -5, 10, 10);
      g.restore();
    } else {
      g.beginPath();
      g.arc(mx, mz, 4.5, 0, Math.PI * 2);
      g.fill();
    }
  }
  // Police blips flash blue/red.
  const flash = Math.floor(performance.now() / 280) % 2 === 0;
  for (const u of view.police ?? []) {
    g.fillStyle = flash ? '#3b82f6' : '#ef4444';
    g.fillRect(px(u.x) - 3.5, pz(u.z) - 3.5, 7, 7);
  }
  // Player arrow.
  g.save();
  g.translate(C, C);
  g.rotate(view.heading);
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(0, -8);
  g.lineTo(5.5, 6);
  g.lineTo(0, 3);
  g.lineTo(-5.5, 6);
  g.closePath();
  g.fill();
  g.restore();
}

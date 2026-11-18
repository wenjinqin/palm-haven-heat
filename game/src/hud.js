// hud.js — everything drawn over the 3D world: cash and wanted stars,
// health bars, the live minimap, objective banners, phone-style
// messages, subtitles for story dialogue, and the centre-screen
// notices (mission passed, busted pressure, hints).

import { ROAD_XS, ROAD_ZS, BEACH_Z, WATER_Z, WORLD } from './city.js';

export class Hud {
  constructor(root) {
    this.el = {};
    for (const id of [
      'hud', 'cash', 'stars', 'health-fill', 'armour-fill', 'weapon',
      'objective', 'objective-title', 'message', 'subtitle', 'sub-name',
      'centre', 'busted-wrap', 'busted-fill', 'minimap', 'speedo',
      'prompt', 'clock',
    ]) {
      this.el[id] = root.querySelector('#' + id);
    }
    this.mapCtx = this.el.minimap.getContext('2d');
    this.messageT = 0;
    this.subtitleT = 0;
    this.centreT = 0;
  }

  setCash(amount) {
    this.el.cash.textContent = '$' + amount.toLocaleString('en-US');
  }

  setStars(n) {
    let s = '';
    for (let i = 0; i < 5; i++) s += i < n ? '★' : '☆';
    this.el.stars.textContent = s;
    this.el.stars.style.opacity = n > 0 ? '1' : '0.25';
  }

  setHealth(health, max) {
    this.el['health-fill'].style.width = Math.max(0, (health / max) * 100) + '%';
    this.el['health-fill'].style.background = health < 30 ? '#ff3b30' : '#3ddc84';
  }

  setWeapon(player) {
    if (!player.armed) {
      this.el.weapon.textContent = 'UNARMED';
      return;
    }
    const reloading = player.reloadT > 0 ? ' RELOADING' : '';
    this.el.weapon.textContent = `PISTOL ${player.ammoInMag} / ${player.reserve}${reloading}`;
  }

  setSpeedo(car) {
    if (!car) {
      this.el.speedo.textContent = '';
      return;
    }
    const kmh = Math.round(Math.abs(car.speed) * 3.6);
    this.el.speedo.textContent = kmh + ' km/h';
  }

  setClock(text) {
    this.el.clock.textContent = text || '';
  }

  objective(title, text) {
    if (!title) {
      this.el.objective.style.display = 'none';
      return;
    }
    this.el.objective.style.display = 'block';
    this.el['objective-title'].textContent = title;
    this.el.objective.querySelector('.obj-text').textContent = text || '';
  }

  message(text, seconds = 4) {
    this.el.message.textContent = text;
    this.el.message.style.opacity = '1';
    this.messageT = seconds;
  }

  subtitle(name, text, seconds = 4.5) {
    this.el['sub-name'].textContent = name;
    this.el.subtitle.querySelector('.sub-text').textContent = text;
    this.el.subtitle.style.opacity = '1';
    this.subtitleT = seconds;
  }

  centre(text, seconds = 2.6) {
    this.el.centre.textContent = text;
    this.el.centre.style.opacity = '1';
    this.centreT = seconds;
  }

  prompt(text) {
    this.el.prompt.textContent = text || '';
    this.el.prompt.style.opacity = text ? '1' : '0';
  }

  setBusted(meter) {
    this.el['busted-wrap'].style.display = meter > 0.02 ? 'block' : 'none';
    this.el['busted-fill'].style.width = meter * 100 + '%';
  }

  update(dt) {
    if (this.messageT > 0) {
      this.messageT -= dt;
      if (this.messageT <= 0) this.el.message.style.opacity = '0';
    }
    if (this.subtitleT > 0) {
      this.subtitleT -= dt;
      if (this.subtitleT <= 0) this.el.subtitle.style.opacity = '0';
    }
    if (this.centreT > 0) {
      this.centreT -= dt;
      if (this.centreT <= 0) this.el.centre.style.opacity = '0';
    }
  }

  // The minimap: a north-up plan of Palm Haven with live blips.
  drawMap(view) {
    const ctx = this.mapCtx;
    const W = this.el.minimap.width;
    const H = this.el.minimap.height;
    const range = 190; // metres across the map
    const scale = W / range;
    const px = view.player.x;
    const pz = view.player.z;
    const toMap = (x, z) => [W / 2 + (x - px) * scale, H / 2 + (z - pz) * scale];

    ctx.fillStyle = '#274b63';
    ctx.fillRect(0, 0, W, H);
    // Land mass.
    ctx.fillStyle = '#3d5a45';
    const [lx, lz] = toMap(WORLD.minX, WORLD.minZ);
    ctx.fillRect(lx, lz, (WORLD.maxX - WORLD.minX) * scale, (WATER_Z - WORLD.minZ) * scale);
    // Beach.
    ctx.fillStyle = '#d9c184';
    const [, bz] = toMap(0, BEACH_Z);
    ctx.fillRect(0, bz, W, (WATER_Z - BEACH_Z) * scale);
    // Roads.
    ctx.strokeStyle = '#15181d';
    ctx.lineWidth = Math.max(2, 9 * scale);
    ctx.beginPath();
    for (const x of ROAD_XS) {
      const [mx] = toMap(x, 0);
      ctx.moveTo(mx, 0);
      ctx.lineTo(mx, H);
    }
    for (const z of ROAD_ZS) {
      const [, mz] = toMap(0, z);
      ctx.moveTo(0, mz);
      ctx.lineTo(W, mz);
    }
    ctx.stroke();

    const blip = (x, z, color, r = 3) => {
      const [mx, mz] = toMap(x, z);
      if (mx < -6 || mx > W + 6 || mz < -6 || mz > H + 6) return;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(mx, mz, r, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const c of view.cars) blip(c.pos.x, c.pos.z, '#e8e8e8', 2.2);
    for (const c of view.cops) blip(c.pos.x, c.pos.z, view.flash ? '#ff4757' : '#3742fa', 3);
    for (const p of view.peds) blip(p.pos.x, p.pos.z, '#ffd166', 1.6);
    if (view.objectivePos) {
      const [ox, oz] = toMap(view.objectivePos.x, view.objectivePos.z);
      // Clamp the objective blip to the map edge so it always guides.
      const cx = Math.max(10, Math.min(W - 10, ox));
      const cy = Math.max(10, Math.min(H - 10, oz));
      ctx.fillStyle = '#ffd60a';
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    // Player arrow, centre, rotated to heading.
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-view.playerHeading + Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.4, 5);
    ctx.lineTo(0, 2.4);
    ctx.lineTo(-4.4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

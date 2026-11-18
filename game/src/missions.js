// The story of Palm Haven Heat, and the work that pays for it.
// Jax Marlowe is home after six years away. Fixer Sol Ferreira has jobs:
// six story missions that escalate from a lift to the marina to the score
// of the decade, plus street work (cab fares, gate runs) that never dries
// up. A small stage engine drives them all: every stage is a place to
// reach, a car to be in, a timer to beat, or a crew to put down.
import * as THREE from 'three';
import { PLACES } from './layout.js';
import { spawnThug, clearThugs, combat } from './combat.js';
import { Rng } from './rng.js';

const sideRng = new Rng(4242);

export const story = {
  index: 0,          // next story mission to offer
  active: null,       // the running mission record
  stageAt: 0,
  stageTimer: null,   // seconds left when a stage is timed
  offered: false,     // a new-job banner has been shown for `index`
  done: false,        // the finale is complete
};

let ctx = null;
let scene = null;
let beacon = null;
let goldCar = null;

export function initMissions(c, s) {
  ctx = c;
  scene = s;
  const geo = new THREE.CylinderGeometry(2.4, 2.4, 34, 18, 1, true);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffd94d, transparent: true, opacity: 0.33, side: THREE.DoubleSide,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  beacon = new THREE.Mesh(geo, mat);
  beacon.position.y = 17;
  beacon.visible = false;
  scene.add(beacon);
}

function setBeacon(x, z, color) {
  beacon.visible = true;
  beacon.position.x = x;
  beacon.position.z = z;
  beacon.material.color.setHex(color);
}
function hideBeacon() {
  beacon.visible = false;
}

// ---------------------------------------------------------------- missions
const MISSIONS = [
  {
    id: 'homecoming',
    title: 'Homecoming',
    from: 'Sol',
    intro: 'Jax. Six years and you still owe me a drink. Grab some wheels and meet me at the Marina — I have work.',
    reward: 200, rep: 1,
    stages: [
      { type: 'enterCar', label: 'Get into a car (F near one)' },
      { type: 'gotoCar', at: 'marina', r: 9, label: 'Drive to the Marina' },
    ],
    outro: 'Sol: Same old Jax. The city missed you. I did not. Much.',
  },
  {
    id: 'delivery',
    title: 'Special Delivery',
    from: 'Sol',
    intro: 'A crate at the South Docks needs to be at Hotel Azure before anyone asks what is in it. Do not ask what is in it.',
    reward: 450, rep: 1,
    stages: [
      { type: 'goto', at: 'docks', r: 7, label: 'Pick up the crate at the South Docks' },
      { type: 'gotoCar', at: 'azureHotel', r: 10, label: 'Deliver to Hotel Azure — the heat noticed', crime: 2 },
    ],
    outro: 'Sol: Clean-ish. The hotel pays in cash and silence. Take both.',
  },
  {
    id: 'shakedown',
    title: 'Shakedown at Sunset',
    from: 'Sol',
    intro: 'Collectors from the Vane family are leaning on the Sunset Bar. Lean back. There is a pistol in it for you.',
    reward: 600, rep: 2,
    stages: [
      { type: 'goto', at: 'sunsetBar', r: 12, label: 'Go to the Sunset Bar' },
      { type: 'fight', at: 'sunsetBar', count: 3, label: 'Put down the Vane collectors' },
      { type: 'goto', at: 'sunsetBar', r: 6, label: 'Check in at the bar door' },
    ],
    outro: 'Sol: The bar stands, the Vanes limp. Keep the pistol. You have earned it.',
    giveGun: true,
  },
  {
    id: 'race',
    title: 'Coastline Run',
    from: 'Sol',
    intro: 'A sponsor wants proof Palm Haven still breeds drivers. Eight gates, one clock, no excuses.',
    reward: 800, rep: 2,
    stages: [
      { type: 'race', gates: 'coast', time: 115, label: 'Run the Coastline gates' },
    ],
    outro: 'Sol: The sponsor is impressed. So am I, and I do not impress.',
  },
  {
    id: 'heat',
    title: 'Five-Star Heat',
    from: 'Sol',
    intro: 'Warehouse at the docks. You take the package, the whole PHPD takes an interest. Lose them at the Coral Court.',
    reward: 1200, rep: 3,
    stages: [
      { type: 'goto', at: 'docks', r: 7, label: 'Take the package at the warehouse' },
      { type: 'escape', at: 'safehouse', r: 10, label: 'Reach the Coral Court Motel', crime: 4 },
    ],
    outro: 'Sol: Four stars and you walked away whistling. Remind me never to play poker with you.',
  },
  {
    id: 'score',
    title: 'The Marlowe Score',
    from: 'Sol',
    intro: 'One Aurelia GT, gold, sitting on Fountain Plaza. Take it, collect me at the Marina, and we vanish off the Ferry Pier.',
    reward: 2500, rep: 4,
    stages: [
      { type: 'steal', at: 'plaza', label: 'Steal the gold Aurelia GT on Fountain Plaza' },
      { type: 'pickup', at: 'marina', r: 9, label: 'Collect Sol at the Marina', crime: 3 },
      { type: 'escape', at: 'pierEnd', r: 8, label: 'Escape to the Ferry Pier' },
    ],
    outro: 'Sol: That, partner, is how legends retire. Palm Haven is ours now.',
  },
];

const RACE_GATES = {
  coast: [
    { x: 189, z: -133 }, { x: 189, z: -21 }, { x: 147, z: 91 }, { x: 35, z: 147 },
    { x: -77, z: 91 }, { x: -133, z: -21 }, { x: -77, z: -133 }, { x: 35, z: -189 },
  ],
  street: [
    { x: 35, z: -21 }, { x: 91, z: 35 }, { x: 35, z: 91 }, { x: -21, z: 35 },
    { x: -77, z: -21 }, { x: -21, z: -77 },
  ],
};

function stagePoint(stage) {
  if (stage.at) return PLACES[stage.at];
  if (stage.gate) return stage.gate;
  return null;
}

export function currentMission() {
  return story.active;
}

function startMission(i) {
  const def = MISSIONS[i];
  story.active = { def, stageAt: 0, gateAt: 0, kills: 0 };
  story.stageTimer = null;
  ctx.banner(def.title, `${def.from}: ${def.intro}`, 6);
  ctx.sfx('mission');
  beginStage();
}

function beginStage() {
  const m = story.active;
  if (!m) return;
  const stage = m.def.stages[story.stageAt];
  story.stageTimer = stage.time ?? null;
  m.kills = 0;
  if (stage.crime) ctx.setWanted(stage.crime);
  if (stage.type === 'fight') {
    clearThugs();
    const c = PLACES[stage.at];
    for (let k = 0; k < stage.count; k++) {
      spawnThug(c.x + (k - 1) * 4.5, c.z + 9 + (k % 2) * 3, { aggro: false });
    }
  }
  if (stage.type === 'steal') {
    goldCar = ctx.spawnGoldCar(PLACES.plaza.x + 12, PLACES.plaza.z + 10);
  }
  if (stage.type === 'race') {
    m.gateAt = 0;
    ctx.toast('Hit every gate before the clock runs out');
  }
  const p = stagePoint(stage) ?? (stage.type === 'race' ? RACE_GATES[stage.gates][0] : null);
  if (p) setBeacon(p.x, p.z ?? p.z, 0xffd94d);
  updateObjective();
}

function updateObjective() {
  const m = story.active;
  if (!m) {
    ctx.setObjective(null);
    return;
  }
  const stage = m.def.stages[story.stageAt];
  let text = `${m.def.title} — ${stage.label}`;
  if (stage.type === 'fight') text += ` (${m.kills}/${stage.count})`;
  if (stage.type === 'race') text += ` · Gate ${m.gateAt + 1}/${RACE_GATES[stage.gates].length} · ${Math.ceil(story.stageTimer ?? 0)}s`;
  if (story.stageTimer !== null && stage.type !== 'race') text += ` · ${Math.ceil(story.stageTimer)}s`;
  ctx.setObjective(text);
}

function completeStage() {
  const m = story.active;
  story.stageAt += 1;
  ctx.sfx('checkpoint');
  if (story.stageAt >= m.def.stages.length) {
    completeMission();
  } else {
    beginStage();
  }
}

function completeMission() {
  const m = story.active;
  const def = m.def;
  story.active = null;
  hideBeacon();
  clearThugs();
  ctx.addCash(def.reward);
  ctx.addRep(def.rep);
  ctx.sfx('cash');
  ctx.banner('Job complete', `${def.outro}  (+$${def.reward})`, 6);
  if (def.giveGun) ctx.giveGun();
  story.index += 1;
  story.offered = false;
  if (story.index >= MISSIONS.length) {
    story.done = true;
    ctx.onFinale();
  }
  ctx.onStoryProgress();
}

function failStage(reason) {
  const m = story.active;
  if (!m) return;
  ctx.banner('Job blown', reason, 4);
  ctx.sfx('fail');
  clearThugs();
  beginStage(); // restart the current stage
}

/** Called when the player is busted or wasted mid-mission. */
export function onPlayerDown() {
  if (story.active) {
    const stage = story.active.def.stages[story.stageAt];
    if (stage.type === 'fight' || stage.type === 'race') failStage('You went down. The job restarts.');
  }
  endSideJob(false);
}

// ---------------------------------------------------------------- side jobs
const side = { kind: null, phase: 0, x: 0, z: 0, dest: null, timer: 0, gateAt: 0, gates: null };

function cornerNear() {
  const xs = [-189, -133, -77, -21, 35, 91, 147];
  const zs = [-189, -133, -77, -21, 35, 91, 147];
  return { x: sideRng.pick(xs) + sideRng.pick([-9, 9]), z: sideRng.pick(zs) + sideRng.pick([-9, 9]) };
}

function offerSideJob() {
  const p = cornerNear();
  side.kind = sideRng.chance(0.55) ? 'taxi' : 'race';
  side.phase = 0;
  side.x = p.x;
  side.z = p.z;
  if (side.kind === 'race') {
    side.x = PLACES.plaza.x;
    side.z = PLACES.plaza.z - 14;
  }
}

export function endSideJob(paid) {
  side.kind = null;
  side.phase = 0;
  if (!story.active) hideBeacon();
  if (paid) offerSideJobSoon();
}
let sideRespawn = 0;
function offerSideJobSoon() {
  sideRespawn = 14;
}

/** Markers for the minimap: story target in amber, side work in green. */
export function getMarkers() {
  const out = [];
  if (story.active) {
    const stage = story.active.def.stages[story.stageAt];
    const p = stage.type === 'race' ? RACE_GATES[stage.gates][story.active.gateAt] : stagePoint(stage);
    if (p) out.push({ x: p.x, z: p.z, color: '#ffd94d', kind: 'target' });
  } else if (side.kind) {
    const p = side.phase === 1 && side.dest ? side.dest : side;
    out.push({ x: p.x, z: p.z, color: '#57c84d', kind: 'dot' });
  }
  return out;
}

// ------------------------------------------------------------------- update
export function updateMissions(dt) {
  // Offer the next story job.
  if (!story.active && !story.done && story.index < MISSIONS.length && !story.offered) {
    story.offered = true;
    const def = MISSIONS[story.index];
    ctx.banner('New job', `${def.from} has work: "${def.title}". Press J to take it.`, 5);
  }
  if (sideRespawn > 0) {
    sideRespawn -= dt;
    if (sideRespawn <= 0 && !side.kind) offerSideJob();
  } else if (!side.kind && !story.active) {
    offerSideJob();
  }

  const pos = ctx.playerPos();
  const inCar = ctx.inCar();

  // ----- story stages
  if (story.active) {
    const m = story.active;
    const stage = m.def.stages[story.stageAt];
    if (story.stageTimer !== null) {
      story.stageTimer -= dt;
      updateObjective();
      if (story.stageTimer <= 0) {
        failStage('Out of time.');
        return;
      }
    }
    const p = stagePoint(stage);
    const dist = p ? Math.hypot(pos.x - p.x, pos.z - p.z) : Infinity;
    switch (stage.type) {
      case 'enterCar':
        if (inCar) completeStage();
        break;
      case 'goto':
        if (dist < stage.r) completeStage();
        break;
      case 'gotoCar':
        if (inCar && dist < stage.r) completeStage();
        break;
      case 'pickup':
        if (inCar && dist < stage.r) completeStage();
        break;
      case 'escape':
        if (dist < stage.r) completeStage();
        break;
      case 'steal':
        if (goldCar && ctx.playerCar() === goldCar) {
          ctx.sfx('pickup');
          completeStage();
        } else if (p) setBeacon(p.x, p.z, 0xffd94d);
        break;
      case 'fight': {
        const alive = combat.thugs.filter((t) => !t.dead).length;
        const killed = stage.count - alive;
        if (killed !== m.kills) {
          m.kills = killed;
          updateObjective();
        }
        if (alive === 0 && combat.thugs.length > 0) completeStage();
        break;
      }
      case 'race': {
        const gates = RACE_GATES[stage.gates];
        const gate = gates[m.gateAt];
        setBeacon(gate.x, gate.z, 0xffd94d);
        if (inCar && Math.hypot(pos.x - gate.x, pos.z - gate.z) < 8.5) {
          m.gateAt += 1;
          ctx.sfx('checkpoint');
          if (m.gateAt >= gates.length) completeStage();
          else updateObjective();
        }
        break;
      }
    }
    return;
  }

  // ----- side jobs (only while no story mission runs)
  if (!side.kind) return;
  if (side.kind === 'taxi') {
    if (side.phase === 0) {
      setBeacon(side.x, side.z, 0x57c84d);
      if (inCar && Math.hypot(pos.x - side.x, pos.z - side.z) < 6.5 && Math.abs(ctx.playerSpeed()) < 1.5) {
        side.phase = 1;
        side.dest = cornerNear();
        ctx.toast('Fare aboard — take them to the green marker');
        ctx.sfx('pickup');
        setBeacon(side.dest.x, side.dest.z, 0x57c84d);
      }
    } else if (side.dest) {
      if (inCar && Math.hypot(pos.x - side.dest.x, pos.z - side.dest.z) < 7.5 && Math.abs(ctx.playerSpeed()) < 1.5) {
        const fare = 45 + Math.round(Math.hypot(side.dest.x - side.x, side.dest.z - side.z) / 9);
        ctx.addCash(fare);
        ctx.sfx('cash');
        ctx.toast(`Fare paid $${fare}`);
        endSideJob(true);
      }
    }
  } else if (side.kind === 'race') {
    if (side.phase === 0) {
      setBeacon(side.x, side.z, 0x57c84d);
      if (inCar && Math.hypot(pos.x - side.x, pos.z - side.z) < 8) {
        side.phase = 1;
        side.gates = RACE_GATES.street;
        side.gateAt = 0;
        side.timer = 62;
        ctx.toast('Gate Run! Beat the clock through 6 gates');
        ctx.sfx('mission');
      }
    } else if (side.gates) {
      side.timer -= dt;
      const gate = side.gates[side.gateAt];
      setBeacon(gate.x, gate.z, 0x57c84d);
      ctx.setObjective(`Gate Run — Gate ${side.gateAt + 1}/${side.gates.length} · ${Math.ceil(side.timer)}s`);
      if (side.timer <= 0) {
        ctx.toast('Gate Run failed — out of time');
        ctx.sfx('fail');
        ctx.setObjective(null);
        endSideJob(true);
      } else if (inCar && Math.hypot(pos.x - gate.x, pos.z - gate.z) < 8.5) {
        side.gateAt += 1;
        ctx.sfx('checkpoint');
        if (side.gateAt >= side.gates.length) {
          const bonus = Math.round(side.timer) * 2;
          ctx.addCash(120 + bonus);
          ctx.sfx('cash');
          ctx.toast(`Gate Run complete! $${120 + bonus}`);
          ctx.setObjective(null);
          endSideJob(true);
        }
      }
    }
  }
}

/** J key: accept the offered story job. */
export function acceptOffered() {
  if (!story.active && story.offered && story.index < MISSIONS.length) {
    hideBeacon();
    startMission(story.index);
    return true;
  }
  return false;
}

/** For screenshots and debugging: force-start a story mission by index. */
export function debugStartMission(i) {
  story.index = i;
  story.offered = true;
  startMission(i);
}

export function missionStateForSave() {
  return { index: story.index, done: story.done };
}
export function restoreMissionState(s) {
  if (!s) return;
  story.index = s.index ?? 0;
  story.done = s.done ?? false;
}

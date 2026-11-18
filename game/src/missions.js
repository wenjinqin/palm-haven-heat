// missions.js — the story of Palm Haven Heat and its side hustles.
// Five story missions for fixer Lola Ferreira (steal, courier, race,
// collect, escape), plus repeatable taxi fares and courier briefcases.
// A small stage machine drives objectives, markers, timers, dialogue
// and payouts; the main loop feeds it the world each frame.

const THREE = window.THREE;

export class MissionManager {
  constructor(game) {
    this.game = game;
    this.active = null; // current mission instance
    this.stageIdx = 0;
    this.stageT = 0;
    this.dialogue = []; // queued [name, text]
    this.dialogueT = 0;
    this.marker = null; // THREE mesh for the objective pillar
    this.markerPos = null;
    this.clockText = '';
    this.failed = null;
    this.buildMarker();
  }

  buildMarker() {
    const geo = new THREE.CylinderGeometry(1, 1, 34, 20, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd60a,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.marker = new THREE.Mesh(geo, mat);
    this.marker.visible = false;
    this.marker.position.y = 17;
    this.game.scene.add(this.marker);
  }

  setMarker(pos, radius) {
    this.markerPos = pos;
    if (!pos) {
      this.marker.visible = false;
      return;
    }
    this.marker.visible = true;
    this.marker.position.x = pos.x;
    this.marker.position.z = pos.z;
    this.marker.scale.set(radius, 1, radius);
  }

  say(lines) {
    for (const [name, text] of lines) this.dialogue.push([name, text]);
  }

  // ---- lifecycle -------------------------------------------------

  get storyIndex() {
    return this.game.save.missionIndex;
  }

  nextStoryMission() {
    return STORY[this.storyIndex] || null;
  }

  // Where the next story mission begins (usually Lola's garage).
  startPoint() {
    const m = this.nextStoryMission();
    if (!m) return null;
    return { pos: m.startAt(this.game), mission: m };
  }

  tryStart() {
    const m = this.nextStoryMission();
    if (!m || this.active) return false;
    this.active = m;
    this.stageIdx = 0;
    this.stageT = 0;
    this.failed = null;
    this.say(m.intro);
    this.game.sound.phoneBuzz();
    const stage = m.stages[0];
    if (stage.onStart) stage.onStart(this.game, this);
    this.refreshObjective();
    return true;
  }

  refreshObjective() {
    const m = this.active;
    if (!m) {
      const next = this.nextStoryMission();
      if (next) {
        this.game.hud.objective('Next job', `${next.title} — head to the gold marker to start.`);
      } else {
        this.game.hud.objective('Palm Haven Heat', 'Story complete. Taxi fares and courier cases still pay.');
      }
      return;
    }
    const stage = m.stages[this.stageIdx];
    this.game.hud.objective(m.title, stage.text(this.game, this));
  }

  complete() {
    const m = this.active;
    const g = this.game;
    g.addCash(m.reward);
    g.sound.missionGood();
    g.hud.centre('MISSION PASSED  +$' + m.reward);
    this.say(m.outro);
    if (m.id === STORY[STORY.length - 1].id) {
      g.save.storyDone = true;
      g.hud.message('Story complete — Palm Haven is yours. Free roam, fares and cases continue.', 7);
    }
    g.save.missionIndex++;
    g.persist();
    this.active = null;
    this.setMarker(null, 0);
    g.hud.setClock('');
    this.refreshObjective();
  }

  fail(reason) {
    const g = this.game;
    g.sound.missionBad();
    g.hud.centre('MISSION FAILED');
    g.hud.message(reason + ' — head back to the gold marker to try again.', 6);
    if (this.active && this.active.cleanup) this.active.cleanup(g, this);
    this.active = null;
    this.setMarker(null, 0);
    g.hud.setClock('');
    this.refreshObjective();
  }

  onPlayerDown(kind) {
    // Busted or wasted mid-mission: the job is blown.
    if (this.active) this.fail(kind === 'busted' ? 'You got busted' : 'You got wasted');
  }

  // ---- per-frame ---------------------------------------------------

  update(dt) {
    const g = this.game;
    // Dialogue drip-feed.
    if (this.dialogue.length) {
      this.dialogueT -= dt;
      if (this.dialogueT <= 0) {
        const [name, text] = this.dialogue.shift();
        g.hud.subtitle(name, text, 4.2);
        this.dialogueT = 4.3;
      }
    }
    // Pulse the marker.
    if (this.marker.visible) {
      this.marker.material.opacity = 0.22 + Math.sin(performance.now() * 0.004) * 0.1;
    }

    if (!this.active) {
      // Idle: show the start marker for the next story mission.
      const sp = this.startPoint();
      if (sp) {
        this.setMarker(sp.pos, 3.2);
        const d = dist2d(g.player.pos, sp.pos);
        if (d < 3.4 && !g.player.inCar) this.tryStart();
        else if (d < 3.4 && g.player.inCar) this.tryStart();
      } else {
        this.setMarker(null, 0);
      }
      return;
    }

    const m = this.active;
    const stage = m.stages[this.stageIdx];
    this.stageT += dt;
    if (stage.tick) stage.tick(g, this, dt);
    const markerPos = stage.marker ? stage.marker(g, this) : null;
    this.setMarker(markerPos, stage.radius || 3.2);
    g.hud.setClock(stage.clock ? stage.clock(g, this) : '');

    if (stage.failIf && stage.failIf(g, this)) {
      this.fail(stage.failText || 'The job fell apart');
      return;
    }
    if (stage.test(g, this)) {
      this.stageIdx++;
      this.stageT = 0;
      if (this.stageIdx >= m.stages.length) {
        this.complete();
      } else {
        const next = m.stages[this.stageIdx];
        if (next.onStart) next.onStart(g, this);
        this.refreshObjective();
      }
    }
  }
}

export function dist2d(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

// ---------------------------------------------------------------------
// Story missions. Stage helpers keep the definitions readable.

function gotoStage(text, getPos, radius = 4) {
  return {
    text: typeof text === 'function' ? text : () => text,
    marker: (g) => getPos(g),
    radius,
    test: (g) => dist2d(g.player.pos, getPos(g)) < radius,
  };
}

const STORY = [
  {
    id: 'first-wheels',
    title: 'First Wheels',
    startAt: (g) => g.landmarks.garage,
    intro: [
      ['Lola', 'Dax? Lola Ferreira. I run the garage by the coast road.'],
      ['Lola', 'A buyer wants the teal coupe sitting in the marina lot. Bring it to me — clean.'],
      ['Dax', 'Steal a car before my coffee cools. On it.'],
    ],
    stages: [
      gotoStage('Get to the marina lot, west side of town.', (g) => g.landmarks.marina, 10),
      {
        text: () => 'Steal the marked coupe.',
        marker: (g, m) => (m.markedCar ? m.markedCar.pos : null),
        radius: 3,
        onStart: (g, m) => {
          m.markedCar = g.spawnSpecialCar('coupe', 0x06d6a0, g.landmarks.marina.x + 6, g.landmarks.marina.z + 4, Math.PI / 2);
        },
        test: (g, m) => g.player.inCar === m.markedCar,
        failIf: (g, m) => m.markedCar && m.markedCar.damage >= 1,
        failText: 'The coupe is wrecked — Lola wanted it clean',
      },
      {
        text: () => 'Deliver the coupe to Lola\'s garage.',
        marker: (g) => g.landmarks.garage,
        radius: 5,
        test: (g, m) => g.player.inCar === m.markedCar && dist2d(g.player.pos, g.landmarks.garage) < 6,
        failIf: (g, m) => m.markedCar && m.markedCar.damage >= 1,
        failText: 'The coupe is wrecked — Lola wanted it clean',
      },
    ],
    reward: 350,
    outro: [
      ['Lola', 'Clean paint, full tank. You drive like you were born in a getaway.'],
      ['Lola', 'Stick around, Dax. Palm Haven is full of people who pay.'],
    ],
    cleanup: (g, m) => {
      if (m.markedCar && g.player.inCar !== m.markedCar) m.markedCar.driver = 'parked';
    },
  },
  {
    id: 'hot-package',
    title: 'Hot Package',
    startAt: (g) => g.landmarks.garage,
    intro: [
      ['Lola', 'A package is taped under a boardwalk bench. No questions.'],
      ['Lola', 'Take it to my friend up in the north-east tower district. Expect attention.'],
    ],
    stages: [
      gotoStage('Pick up the package at the boardwalk.', (g) => g.landmarks.boardwalk, 3.4),
      {
        text: () => 'Deliver the package across town. The heat is on!',
        marker: (g) => g.landmarks.hideout,
        radius: 5,
        onStart: (g) => {
          g.wanted.report('mission');
          g.wanted.report('mission');
          g.hud.message('The package is hot — half the city saw you take it.', 5);
        },
        test: (g) => dist2d(g.player.pos, g.landmarks.hideout) < 6,
      },
    ],
    reward: 500,
    outro: [['Lola', 'Delivered, and the buyer sends his regards. And his money.']],
  },
  {
    id: 'against-the-clock',
    title: 'Against the Clock',
    startAt: (g) => g.landmarks.garage,
    intro: [
      ['Lola', 'A street crew bets nobody can run the Haven loop in two minutes.'],
      ['Lola', 'Six beacons, one clock. Prove them wrong — any car you like.'],
    ],
    stages: [
      {
        text: (g, m) => `Hit the beacons: ${m.cpIdx || 0}/${m.checkpoints.length} — through the gold pillar.`,
        marker: (g, m) => m.checkpoints[m.cpIdx || 0],
        radius: 6,
        onStart: (g, m) => {
          const L = g.landmarks;
          m.checkpoints = [L.downtown, { x: -180, z: -180 }, L.airport, { x: 220, z: -60 }, L.marina, L.garage];
          m.cpIdx = 0;
          m.timeLeft = 125;
        },
        tick: (g, m, dt) => {
          m.timeLeft -= dt;
        },
        clock: (g, m) => '⏱ ' + Math.max(0, m.timeLeft).toFixed(1),
        test: (g, m) => {
          const cp = m.checkpoints[m.cpIdx];
          if (cp && dist2d(g.player.pos, cp) < 7) {
            m.cpIdx++;
            m.timeLeft += 9;
            g.sound.pickup();
            g.hud.message(`Beacon ${m.cpIdx}/${m.checkpoints.length} — +9s`, 2);
            m.refreshObjective();
          }
          return m.cpIdx >= m.checkpoints.length;
        },
        failIf: (g, m) => m.timeLeft <= 0,
        failText: 'Out of time — the crew keeps their money',
      },
    ],
    reward: 450,
    outro: [['Lola', 'Two minutes, huh? The crew is still counting on their fingers.']],
  },
  {
    id: 'debt-collector',
    title: 'The Collector',
    startAt: (g) => g.landmarks.garage,
    intro: [
      ['Lola', 'Three friends of mine owe the garage money. Visit them. Be persuasive.'],
      ['Lola', 'Stand close, look patient, and let the envelope change hands.'],
    ],
    stages: [
      {
        text: (g, m) => `Collect the debts: ${m.collected || 0}/3 — stand in the marker.`,
        marker: (g, m) => m.spots[m.spotIdx || 0],
        radius: 3.4,
        onStart: (g, m) => {
          m.spots = [
            { x: -90, z: -90 },
            { x: 130, z: 40 },
            { x: -40, z: 130 },
          ];
          m.spotIdx = 0;
          m.collected = 0;
          m.channel = 0;
        },
        tick: (g, m, dt) => {
          const spot = m.spots[m.spotIdx];
          if (spot && dist2d(g.player.pos, spot) < 3.4 && !g.player.inCar) m.channel += dt;
          else m.channel = Math.max(0, m.channel - dt * 2);
        },
        test: (g, m) => {
          if (m.channel >= 2.2) {
            m.collected++;
            m.spotIdx++;
            m.channel = 0;
            g.sound.cash();
            if (m.spotIdx === 2) {
              g.wanted.report('mission');
              g.hud.message('The last debtor called the police while you counted.', 4.5);
            } else {
              g.hud.message(`Debt ${m.collected}/3 collected.`, 3);
            }
            m.refreshObjective();
          }
          return m.collected >= 3;
        },
      },
    ],
    reward: 600,
    outro: [['Lola', 'All three envelopes, and nobody lost a finger. Professional.']],
  },
  {
    id: 'sunset-getaway',
    title: 'Sunset Getaway',
    startAt: (g) => g.landmarks.garage,
    intro: [
      ['Lola', 'Last job, Dax. A cash bag sits at the pier head — a lot of cash.'],
      ['Lola', 'Every cop in Palm Haven will want a word. Lose them, then reach the hideout.'],
    ],
    stages: [
      gotoStage('Take the cash bag at the pier head.', (g) => g.landmarks.pierEnd, 4),
      {
        text: () => 'Lose the heat, then reach the Cliffside Hideout (north-east).',
        marker: (g) => g.landmarks.hideout,
        radius: 7,
        onStart: (g) => {
          g.wanted.heat = 8.5; // straight to four stars
          g.wanted.sinceCrime = 0;
          g.addCash(0);
          g.hud.message('That bag had a tracker. Of course it did.', 5);
        },
        test: (g) => dist2d(g.player.pos, g.landmarks.hideout) < 8 && g.wanted.stars === 0,
      },
    ],
    reward: 1200,
    outro: [
      ['Lola', 'You just outran the whole Palm Haven PD at sunset.'],
      ['Lola', 'The city is yours now, Dax. Try not to give it back.'],
    ],
  },
];

// ---------------------------------------------------------------------
// Side jobs: taxi fares and courier briefcases, always on offer.

export class SideJobs {
  constructor(game) {
    this.game = game;
    this.fare = null; // {ped, dest, state: 'hail'|'ride'}
    this.cases = []; // {pos, mesh}
    this.caseTimer = 4;
  }

  spawnCase() {
    const g = this.game;
    const spots = [
      { x: -140, z: 60 }, { x: 80, z: -140 }, { x: 200, z: 120 },
      { x: -230, z: -40 }, { x: 40, z: -230 }, { x: 260, z: -180 },
      { x: -60, z: 190 }, { x: 150, z: 190 },
    ];
    const spot = spots[Math.floor(Math.random() * spots.length)];
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.4, 0.6),
      new THREE.MeshBasicMaterial({ color: 0xffcf3f }),
    );
    mesh.position.set(spot.x, 0.7, spot.z);
    g.scene.add(mesh);
    this.cases.push({ pos: spot, mesh });
  }

  update(dt) {
    const g = this.game;
    // Courier cases: keep three in the world; walk or drive over one.
    this.caseTimer -= dt;
    if (this.caseTimer <= 0) {
      this.caseTimer = 5;
      if (this.cases.length < 3) this.spawnCase();
    }
    for (let i = this.cases.length - 1; i >= 0; i--) {
      const c = this.cases[i];
      c.mesh.rotation.y += dt * 2;
      c.mesh.position.y = 0.7 + Math.sin(performance.now() * 0.005 + i) * 0.15;
      if (dist2d(g.player.pos, c.pos) < 2.6) {
        const pay = 25 + Math.floor(Math.random() * 40);
        g.addCash(pay);
        g.save.couriers++;
        g.persist();
        g.sound.cash();
        g.hud.message(`Courier case delivered: +$${pay}`, 3);
        g.scene.remove(c.mesh);
        this.cases.splice(i, 1);
      }
    }

    // Taxi fares.
    if (!this.fare) {
      // Occasionally a pedestrian starts hailing.
      if (Math.random() < dt * 0.05) {
        const peds = g.peds.peds.filter((p) => p.state === 'walk');
        if (peds.length) {
          const ped = peds[Math.floor(Math.random() * peds.length)];
          ped.state = 'hail';
          ped.stateT = 0;
          this.fare = { ped, dest: null, state: 'hail' };
          g.hud.message('Someone is hailing a ride nearby — stop beside them in a car.', 5);
        }
      }
    } else if (this.fare.state === 'hail') {
      const ped = this.fare.ped;
      if (ped.dead || ped.state === 'down') {
        this.fare = null;
      } else if (g.player.inCar && dist2d(g.player.pos, ped.pos) < 6 && Math.abs(g.player.inCar.speed) < 1.2) {
        ped.state = 'ride';
        this.fare.state = 'ride';
        const L = g.landmarks;
        const dests = [L.downtown, L.marina, L.boardwalk, L.airport, L.hideout, L.garage];
        this.fare.dest = dests[Math.floor(Math.random() * dests.length)];
        g.hud.message(`Fare: take them to ${this.fare.dest.name}.`, 5);
        g.sound.pickup();
      }
    } else if (this.fare.state === 'ride') {
      const ped = this.fare.ped;
      ped.pos.copy(g.player.pos);
      if (g.player.inCar && dist2d(g.player.pos, this.fare.dest) < 9 && Math.abs(g.player.inCar.speed) < 1.5) {
        const fare = 45 + Math.floor(Math.random() * 55);
        g.addCash(fare);
        g.save.taxiFares++;
        g.persist();
        g.sound.cash();
        g.hud.centre('FARE PAID  +$' + fare);
        ped.state = 'walk';
        ped.stateT = 0;
        ped.mesh.visible = true;
        ped.pos.set(g.player.pos.x + 2.5, 0, g.player.pos.z + 1);
        ped.snapToWalkLine();
        this.fare = null;
      }
    }
  }

  objectivePos() {
    if (this.fare && this.fare.state === 'hail') return this.fare.ped.pos;
    if (this.fare && this.fare.state === 'ride') return this.fare.dest;
    return null;
  }
}

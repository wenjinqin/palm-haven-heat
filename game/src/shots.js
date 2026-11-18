// shots.js — deterministic scene staging for the screenshots.
// The maker's screenshot script loads the game with ?shot=<name> and
// this module poses a real moment of play: same city, same systems,
// just arranged so one frame shows as much of the game as possible.

export function readShotRequest() {
  const params = new URLSearchParams(location.search);
  const shot = params.get('shot');
  if (!shot) return null;
  return { name: shot, seed: parseInt(params.get('seed') || '1', 10) || 1 };
}

export function stageShot(game, name) {
  const { player, wanted, police, hud } = game;
  const L = game.landmarks;
  game.shotLock = true; // a photo session never ends on a down screen

  if (name === 'cover') {
    // Hero frame: Dax on the coast road, the whole city ahead of him.
    player.pos.set(-24, 0, 208);
    player.heading = Math.PI - 0.3;
    game.cameraYaw = Math.PI - 0.38;
    game.cameraPitch = 0.3;
    hud.objective('First Wheels', 'Get to the marina lot, west side of town.');
    hud.subtitle('Lola', 'A buyer wants the teal coupe in the marina lot. Bring it to me — clean.', 30);
  } else if (name === 'chase') {
    // A three-star pursuit down a downtown avenue, frozen mid-action.
    const car = game.spawnSpecialCar('coupe', 0xef476f, 36, 26, 0.1);
    car.speed = 19;
    game.enterCar(car, true);
    wanted.heat = 6.4;
    for (let i = 0; i < 3; i++) police.spawnUnit(player.pos);
    const spots = [[30, 6], [43, -3], [35, -15]];
    police.units.forEach((u, i) => {
      const s = spots[i % spots.length];
      u.car.pos.set(s[0], 0, s[1]);
      u.car.heading = 0.15;
      u.car.speed = 17;
    });
    game.cameraYaw = 0.45;
    game.cameraPitch = 0.22;
    hud.objective('Hot Package', 'Deliver the package across town. The heat is on!');
  } else if (name === 'mission') {
    // At Lola's garage: start marker, objective, the intro dialogue —
    // posed at the coast-road edge so the sign and the city share the frame.
    player.pos.set(L.garage.x - 16, 0, L.garage.z + 12);
    player.heading = Math.PI + 0.5;
    game.cameraYaw = Math.PI + 0.42;
    game.cameraPitch = 0.24;
    game.missions.tryStart();
  } else if (name === 'drive') {
    // Golden-hour cruise down the coast road with traffic.
    const car = game.spawnSpecialCar('sedan', 0x3a86ff, -120, 214, Math.PI / 2);
    car.speed = 16;
    game.enterCar(car, true);
    game.cameraYaw = Math.PI / 2 + 0.4;
    game.cameraPitch = 0.18;
    hud.objective('Taxi Fare', 'Take them to The Boardwalk.');
  }
}

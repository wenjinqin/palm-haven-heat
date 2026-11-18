// Palm Haven Heat — tuning constants for gameplay, physics and presentation.
// Everything the designers (also us) might want to tweak lives here so the
// simulation files below stay about behaviour, not magic numbers.

export const CFG = {
  // World
  worldHalf: 250,          // playable ground extends this far from the origin
  gravity: 0,              // top-down-ish arcade: no gravity on actors

  // On-foot movement
  walkSpeed: 5.2,
  sprintSpeed: 8.6,
  playerRadius: 0.55,
  playerHealth: 100,

  // Driving (arcade model: speed is a scalar along the heading)
  carAccel: 14,
  carBrake: 26,
  carReverseMax: 9,
  carDrag: 0.55,           // exponential-ish damping per second at speed
  carSteer: 1.85,          // radians per second at full lock, low speed
  carGripSpeed: 26,        // above this, steering authority fades
  handbrakeDrag: 2.6,

  // Wanted system
  wantedDecaySightless: 11,  // seconds unseen before a star starts draining
  wantedDrainPerStar: 9,     // seconds of hiding per star removed
  bustRange: 7.5,
  bustBuildTime: 2.4,        // seconds of close-and-slow before busted
  sprayCostPerStar: 150,

  // Police
  policeTopSpeed: [0, 24, 26, 28, 30, 33],   // indexed by wanted stars
  policeCount: [0, 1, 2, 3, 5, 7],           // cruisers fielded per star level

  // Economy
  healCost: 12,
  repairCostPerPoint: 2,

  // Camera
  camFootDistance: 8.5,
  camFootHeight: 3.4,
  camCarDistance: 10.5,
  camCarHeight: 4.2,

  // Day look: a fixed golden late-afternoon, the city's best light.
  sunColor: 0xffd9a0,
  skyColor: 0x8ec9e8,
  fogColor: 0xf6cf9d,
  waterColor: 0x1f7f9e,
  sandColor: 0xeed9a4,
};

// The five wanted levels have names the HUD and the radio chatter use.
export const STAR_NAMES = ['Clean', 'Noticed', 'Pursued', 'Hunted', 'Manhunt', 'Citywide'];

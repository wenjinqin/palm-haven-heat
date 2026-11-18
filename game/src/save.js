// save.js — localStorage persistence for Palm Haven Heat.
// We save the story progress, cash, lifetime stats and where the player
// parked themselves, so the title screen can offer "Continue".

const SAVE_KEY = 'palm-haven-heat-save-v1';

export function defaultSave() {
  return {
    cash: 120,
    missionIndex: 0, // next story mission to play
    storyDone: false,
    taxiFares: 0,
    couriers: 0,
    carsStolen: 0,
    timesBusted: 0,
    timesWasted: 0,
    position: null, // {x, z, heading}
    playSeconds: 0,
  };
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return Object.assign(defaultSave(), data);
  } catch (err) {
    return null;
  }
}

export function storeSave(data) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (err) {
    // Private mode or quota: saving is a nicety, never fatal.
  }
}

export function wipeSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (err) {
    /* ignore */
  }
}

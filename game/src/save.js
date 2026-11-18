// Persistence: one localStorage record — cash, reputation, story progress,
// the pistol, and where Jax woke up. Continue reads it; New Game clears it.
const KEY = 'palm-haven-heat-save-v1';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSave(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Private mode or a full disk: the run simply will not persist.
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch { /* nothing to clear */ }
}

export function hasSave() {
  return loadSave() !== null;
}

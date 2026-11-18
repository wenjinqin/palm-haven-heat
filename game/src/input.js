// Keyboard and mouse state, gathered once and read by the frame loop.
// Mouse look uses pointer lock; clicks are queued so a press is never
// lost between frames, and deltas accumulate until consumed.
export const keys = Object.create(null);
export const mouse = { dx: 0, dy: 0, down: false };
const clickQueue = [];

let lockElement = null;
export let pointerLocked = false;

export function initInput(el) {
  lockElement = el;
  addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', (e) => { keys[e.code] = false; });
  addEventListener('blur', () => {
    for (const k of Object.keys(keys)) keys[k] = false;
    mouse.down = false;
  });
  document.addEventListener('pointerlockchange', () => {
    pointerLocked = document.pointerLockElement === lockElement;
  });
  addEventListener('mousemove', (e) => {
    if (!pointerLocked) return;
    mouse.dx += e.movementX || 0;
    mouse.dy += e.movementY || 0;
  });
  addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      mouse.down = true;
      clickQueue.push(true);
    }
  });
  addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.down = false;
  });
}

export function requestLock() {
  if (lockElement && !pointerLocked) lockElement.requestPointerLock();
}

export function releaseLock() {
  if (pointerLocked) document.exitPointerLock();
}

/** Read and clear the accumulated mouse movement. */
export function consumeMouseDelta() {
  const d = { dx: mouse.dx, dy: mouse.dy };
  mouse.dx = 0;
  mouse.dy = 0;
  return d;
}

/** True once per physical click since the last call. */
export function consumeClick() {
  return clickQueue.length > 0 ? (clickQueue.length = 0, true) : false;
}

export function pressed(code) {
  return keys[code] === true;
}

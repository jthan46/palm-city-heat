// Palm City Heat — keyboard and mouse, translated into a plain input object the simulation
// reads. Held keys are levels; one-shot actions (interact, pause, confirm, melee, mute) are
// queued and taken once by the loop, so a press between frames is never lost or doubled.
// The simulation never touches the DOM: tests feed it input objects shaped just like this.

export function createInput() {
  return {
    up: false, down: false, left: false, right: false, run: false,
    shoot: false, mouseX: 0, mouseY: 0,
    queue: [],
    /** Takes a queued one-shot action ('interact', 'pause', 'confirm', 'melee', 'mute'). */
    take(name) {
      const i = this.queue.indexOf(name);
      if (i === -1) return false;
      this.queue.splice(i, 1);
      return true;
    },
    clear() { this.queue.length = 0; },
  };
}

const HELD = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run',
};
const PRESSED = {
  KeyE: 'interact', KeyF: 'interact',
  Enter: 'confirm', KeyC: 'continue',
  Escape: 'pause', KeyP: 'pause',
  KeyJ: 'melee', KeyM: 'mute',
};

/** Wires a live input object to real browser events on the canvas's window. */
export function attachInput(input, canvas, onGesture) {
  const setHeld = (code, value) => {
    const name = HELD[code];
    if (name) input[name] = value;
  };
  window.addEventListener('keydown', (e) => {
    if (onGesture) onGesture();
    setHeld(e.code, true);
    const action = PRESSED[e.code];
    if (action && !e.repeat) input.queue.push(action);
    if (e.code === 'Space') {
      if (!e.repeat) input.queue.push('handbrake');
      input.space = true;
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    setHeld(e.code, false);
    if (e.code === 'Space') input.space = false;
  });
  const trackMouse = (e) => {
    const rect = canvas.getBoundingClientRect();
    input.mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
    input.mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);
  };
  canvas.addEventListener('mousemove', trackMouse);
  canvas.addEventListener('mousedown', (e) => {
    if (onGesture) onGesture();
    trackMouse(e);
    input.shoot = true;
    input.queue.push('click');
  });
  window.addEventListener('mouseup', () => { input.shoot = false; });
  window.addEventListener('blur', () => {
    input.up = input.down = input.left = input.right = input.run = input.shoot = false;
  });
}

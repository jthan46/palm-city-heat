// Palm City Heat — keyboard and mouse input.
// One job: turn raw browser events into the per-step input object the
// simulation consumes. The sim never reads the DOM; tests feed it literals.

export function blankInput() {
  return {
    up: false, down: false, left: false, right: false, run: false,
    interact: false, // E / F — one-shot, consumed by the sim
    attack: false, // held: melee (J or mouse) / fire with pistol
    attackPressed: false,
    pausePressed: false,
    confirmPressed: false,
    continuePressed: false, // C — Continue on the title screen
    mutePressed: false,
    mouseX: 0, mouseY: 0, mouseDown: false,
    aimAngle: null, // tests may set this directly
  };
}

const HELD = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run',
  KeyJ: 'attack',
};

export function createInput(canvas) {
  const input = blankInput();
  const held = { up: false, down: false, left: false, right: false, run: false, attack: false };
  const pressed = new Set();

  window.addEventListener('keydown', (event) => {
    const field = HELD[event.code];
    if (field) held[field] = true;
    if (!event.repeat) {
      if (event.code === 'KeyE' || event.code === 'KeyF') pressed.add('interact');
      if (event.code === 'KeyJ' || event.code === 'Enter' || event.code === 'Space') pressed.add('attackTap');
      if (event.code === 'KeyP' || event.code === 'Escape') pressed.add('pause');
      if (event.code === 'Enter' || event.code === 'Space') pressed.add('confirm');
      if (event.code === 'KeyC') pressed.add('continue');
      if (event.code === 'KeyM') pressed.add('mute');
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    const field = HELD[event.code];
    if (field) held[field] = false;
  });
  window.addEventListener('blur', () => {
    for (const k of Object.keys(held)) held[k] = false;
    input.mouseDown = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    input.mouseX = event.clientX - rect.left;
    input.mouseY = event.clientY - rect.top;
  });
  canvas.addEventListener('pointerdown', (event) => {
    input.mouseDown = true;
    input.mouseX = event.clientX - canvas.getBoundingClientRect().left;
    input.mouseY = event.clientY - canvas.getBoundingClientRect().top;
    pressed.add('attackTap');
    pressed.add('confirm');
  });
  window.addEventListener('pointerup', () => { input.mouseDown = false; });

  // Build the per-step snapshot, draining one-shot presses exactly once.
  return function readInput() {
    Object.assign(input, held);
    input.interact = pressed.has('interact');
    input.attackPressed = pressed.has('attackTap');
    input.pausePressed = pressed.has('pause');
    input.confirmPressed = pressed.has('confirm');
    input.continuePressed = pressed.has('continue');
    input.mutePressed = pressed.has('mute');
    input.attack = held.attack || input.mouseDown;
    pressed.clear();
    return { ...input };
  };
}

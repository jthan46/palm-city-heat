// input.js — keyboard and mouse state for the game.
// One job: track which keys are held, which were pressed this step, and where
// the mouse is, in a form the simulation (and the headless test) can drive.

export class Input {
  constructor() {
    this.keys = new Set(); // codes currently held, e.g. 'KeyW'
    this.pressed = new Set(); // codes that went down since the last consume()
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;
    this.mouseClicked = false; // went down since the last consume()
  }

  attach(target, surface) {
    target.addEventListener('keydown', (e) => {
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
    });
    target.addEventListener('keyup', (e) => this.keys.delete(e.code));
    target.addEventListener('blur', () => this.keys.clear());
    surface.addEventListener('mousemove', (e) => {
      const r = surface.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
    });
    surface.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouseDown = true;
        this.mouseClicked = true;
      }
    });
    target.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
  }

  down(code) {
    return this.keys.has(code);
  }

  hit(code) {
    return this.pressed.has(code);
  }

  // Movement axes from WASD + arrows: x in {-1,0,1}, y in {-1,0,1}.
  moveAxis() {
    let x = 0;
    let y = 0;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    if (this.down('KeyW') || this.down('ArrowUp')) y -= 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y += 1;
    return { x, y };
  }

  // Called once per rendered frame after the sim has read the edges.
  consume() {
    this.pressed.clear();
    this.mouseClicked = false;
  }

  // Test/driver helper: hold a key programmatically.
  setKey(code, isDown) {
    if (isDown) {
      if (!this.keys.has(code)) this.pressed.add(code);
      this.keys.add(code);
    } else {
      this.keys.delete(code);
    }
  }
}

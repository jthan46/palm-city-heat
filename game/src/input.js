// Palm City Heat — keyboard and mouse state.
// One Input object owns every listener. The game reads held keys each fixed
// step and consumes edge presses (for menus, entering cars, dialogue) so a
// press is never seen twice. In the headless test a fake window is passed in
// and events are fired through the same listener registry.

export class Input {
  constructor(win) {
    this.keys = new Set(); // codes currently held
    this.pressed = new Set(); // codes pressed since last consume
    this.mouse = { x: 0, y: 0, down: false, clicked: false };
    this.enabled = true;

    if (win && typeof win.addEventListener === 'function') {
      win.addEventListener('keydown', (e) => {
        if (e.repeat) return;
        this.keys.add(e.code);
        this.pressed.add(e.code);
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
          if (typeof e.preventDefault === 'function') e.preventDefault();
        }
      });
      win.addEventListener('keyup', (e) => {
        this.keys.delete(e.code);
      });
      win.addEventListener('blur', () => {
        this.keys.clear();
      });
    }
  }

  // Attach mouse tracking to a canvas-like element. Coordinates are reported
  // in the element's own pixel space and scaled by main into view space.
  attachMouse(el, getRect) {
    if (!el || typeof el.addEventListener !== 'function') return;
    el.addEventListener('mousemove', (e) => {
      const r = getRect();
      this.mouse.x = e.clientX - r.left;
      this.mouse.y = e.clientY - r.top;
    });
    el.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouse.down = true;
        this.mouse.clicked = true;
      }
    });
    el.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.down = false;
    });
  }

  down(code) {
    return this.keys.has(code);
  }

  // True once per physical press until consumed.
  consume(code) {
    if (this.pressed.has(code)) {
      this.pressed.delete(code);
      return true;
    }
    return false;
  }

  consumeClick() {
    const c = this.mouse.clicked;
    this.mouse.clicked = false;
    return c;
  }

  // Movement axes from WASD + arrows.
  moveX() {
    return (this.down('KeyD') || this.down('ArrowRight') ? 1 : 0) - (this.down('KeyA') || this.down('ArrowLeft') ? 1 : 0);
  }

  moveY() {
    return (this.down('KeyS') || this.down('ArrowDown') ? 1 : 0) - (this.down('KeyW') || this.down('ArrowUp') ? 1 : 0);
  }

  running() {
    return this.down('ShiftLeft') || this.down('ShiftRight');
  }
}

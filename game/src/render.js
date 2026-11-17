// Palm City Heat — the painter.
// One job: pixels. World, cars, people, HUD, minimap and menus, all drawn
// from state with code — there are no image assets in Palm City.

import { FONT, PALETTE, WORLD } from './config.js';
import { clamp } from './random.js';
import { SAND_Y } from './world.js';
import { CAR_MODELS } from './vehicles.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';

const DISTRICT_GROUND = {
  downtown: '#a08b74',
  commercial: '#ac9778',
  suburbs: '#9aa06b',
  beachfront: '#bfa87e',
  park: '#86b95f',
};

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { w: 960, h: 540 };

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    view.w = window.innerWidth;
    view.h = window.innerHeight;
    canvas.width = Math.round(view.w * ratio);
    canvas.height = Math.round(view.h * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  // ---- small helpers -------------------------------------------------------
  function rect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }
  function circle(x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  function text(str, x, y, size, color, align = 'left', weight = 600) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(str, x, y);
  }
  function panel(x, y, w, h, alpha = 0.72) {
    ctx.fillStyle = `rgba(24, 14, 26, ${alpha})`;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 10);
    ctx.fill();
  }

  // ---- world ---------------------------------------------------------------
  function drawGround(state, cam) {
    const { city } = state;
    // base: warm dirt under everything
    rect(cam.x - 40, cam.y - 40, view.w + 80, view.h + 80, '#b39d77');
    // sand + sea
    if (cam.y + view.h > SAND_Y) {
      rect(cam.x - 40, SAND_Y, view.w + 80, WORLD.waterY - SAND_Y + 40, PALETTE.sand);
      rect(cam.x - 40, WORLD.waterY, view.w + 80, WORLD.h - (WORLD.waterY - cam.y) + 40, PALETTE.water);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = Math.floor(cam.x / 90) * 90; x < cam.x + view.w + 90; x += 90) {
        const wy = WORLD.waterY + 26 + ((x * 7) % 60);
        ctx.moveTo(x, wy);
        ctx.lineTo(x + 34, wy);
      }
      ctx.stroke();
    }
    // block grounds (district tint) + sidewalks
    for (let ci = 0; ci < city.cols.length; ci++) {
      for (let ri = 0; ri < city.rows.length; ri++) {
        const [bx, bx2] = city.cols[ci];
        const [by, by2] = city.rows[ri];
        if (bx2 < cam.x || bx > cam.x + view.w || by2 < cam.y || by > cam.y + view.h) continue;
        if (by >= SAND_Y) continue;
        const d = state.districtGrid[ci][ri];
        rect(bx, by, bx2 - bx, by2 - by, PALETTE.sidewalk);
        rect(bx + 8, by + 8, bx2 - bx - 16, by2 - by - 16, DISTRICT_GROUND[d] || '#a08b74');
      }
    }
    // roads
    ctx.fillStyle = PALETTE.asphalt;
    for (const vx of WORLD.vRoads) {
      if (vx + WORLD.roadW / 2 < cam.x || vx - WORLD.roadW / 2 > cam.x + view.w) continue;
      ctx.fillRect(vx - WORLD.roadW / 2, cam.y - 40, WORLD.roadW, view.h + 80);
    }
    for (const hy of WORLD.hRoads) {
      if (hy + WORLD.roadW / 2 < cam.y || hy - WORLD.roadW / 2 > cam.y + view.h) continue;
      ctx.fillRect(cam.x - 40, hy - WORLD.roadW / 2, view.w + 80, WORLD.roadW);
    }
    // lane dashes
    ctx.strokeStyle = PALETTE.laneMark;
    ctx.lineWidth = 3;
    ctx.setLineDash([22, 26]);
    ctx.beginPath();
    for (const vx of WORLD.vRoads) { ctx.moveTo(vx, cam.y - 40); ctx.lineTo(vx, cam.y + view.h + 40); }
    for (const hy of WORLD.hRoads) { ctx.moveTo(cam.x - 40, hy); ctx.lineTo(cam.x + view.w + 40, hy); }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawProps(state, cam) {
    for (const p of state.city.props) {
      if (p.x < cam.x - 60 || p.x > cam.x + view.w + 60 || p.y < cam.y - 60 || p.y > cam.y + view.h + 60) continue;
      if (p.kind === 'pond') {
        ctx.fillStyle = PALETTE.waterDeep;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.r, p.r * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'lamp') {
        circle(p.x, p.y, 3, '#5a4a3a');
        circle(p.x, p.y, 7, 'rgba(255, 210, 120, 0.35)');
      } else if (p.kind === 'palm') {
        ctx.strokeStyle = '#7a5a3a';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + 4, p.y - 10);
        ctx.stroke();
        ctx.strokeStyle = '#4e9b47';
        ctx.lineWidth = 3;
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 + 0.5;
          ctx.beginPath();
          ctx.moveTo(p.x + 4, p.y - 10);
          ctx.quadraticCurveTo(p.x + 4 + Math.cos(a) * 12, p.y - 16 + Math.sin(a) * 5, p.x + 4 + Math.cos(a) * 19, p.y - 8 + Math.sin(a) * 9);
          ctx.stroke();
        }
      } else {
        // tree: layered canopy
        circle(p.x + 3, p.y + 5, p.r, PALETTE.shadow);
        circle(p.x, p.y, p.r, '#4e8f3e');
        circle(p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.6, '#5fa34c');
      }
    }
  }

  function drawBuildings(state, cam) {
    for (const b of state.city.buildings) {
      if (b.x + b.w < cam.x || b.x > cam.x + view.w || b.y + b.h < cam.y || b.y > cam.y + view.h) continue;
      const sh = b.hgt * 0.16;
      rect(b.x + sh, b.y + sh * 1.2, b.w, b.h, PALETTE.shadow);
      rect(b.x, b.y, b.w, b.h, b.color);
      rect(b.x + 5, b.y + 5, b.w - 10, b.h - 10, b.roof);
      if (b.kind === 'tower') {
        ctx.fillStyle = 'rgba(255, 220, 150, 0.5)';
        const cols = Math.floor(b.w / 22);
        const rows = Math.floor(b.h / 22);
        for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
          if ((i * 7 + j * 13 + b.x) % 3 === 0) ctx.fillRect(b.x + 10 + i * 22, b.y + 10 + j * 22, 8, 10);
        }
      }
      if (b.kind === 'hospital') {
        rect(b.x + b.w / 2 - 4, b.y + 10, 8, 22, '#e74c3c');
        rect(b.x + b.w / 2 - 11, b.y + 17, 22, 8, '#e74c3c');
      }
      if (b.kind === 'station') {
        rect(b.x + 6, b.y + 6, b.w - 12, 14, '#2e5fa3');
      }
      if (b.name) {
        text(b.name, b.x + b.w / 2, b.y - 6, 12, 'rgba(40,20,20,0.75)', 'center', 700);
      }
    }
  }

  function drawPickups(state) {
    for (const pk of state.pickups) {
      const bob = Math.sin((state.tick + pk.t) / 14) * 3;
      if (pk.kind === 'cash') {
        rect(pk.x - 9, pk.y - 5 + bob, 18, 10, '#27ae60');
        rect(pk.x - 9, pk.y - 1 + bob, 18, 2, '#7be495');
      } else if (pk.kind === 'ammo') {
        rect(pk.x - 8, pk.y - 8 + bob, 16, 16, '#e67e22');
        rect(pk.x - 8, pk.y - 2 + bob, 16, 3, '#ffd23f');
      } else {
        rect(pk.x - 9, pk.y - 9 + bob, 18, 18, '#f5f6fa');
        rect(pk.x - 2, pk.y - 6 + bob, 4, 12, '#e74c3c');
        rect(pk.x - 6, pk.y - 2 + bob, 12, 4, '#e74c3c');
      }
    }
  }

  function drawPed(p) {
    if (p.mode === 'dead') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(1.2);
      rect(-11, -5, 22, 10, p.color);
      circle(13, 0, 5.5, '#e8b08a');
      ctx.restore();
      return;
    }
    if (p.mode === 'down') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(0.4);
      rect(-11, -5, 22, 10, p.color);
      circle(13, 0, 5.5, '#e8b08a');
      ctx.restore();
      return;
    }
    circle(p.x + 2, p.y + 3, 10, PALETTE.shadow);
    circle(p.x, p.y, 9, p.color);
    circle(p.x + Math.cos(p.angle) * 3, p.y + Math.sin(p.angle) * 3, 5, '#e8b08a');
  }

  function drawVehicle(state, v) {
    const m = CAR_MODELS[v.model];
    ctx.save();
    ctx.translate(v.x, v.y);
    ctx.rotate(v.angle);
    rect(-m.w / 2 + 3, -m.h / 2 + 5, m.w, m.h, PALETTE.shadow);
    ctx.fillStyle = v.wrecked ? '#3a3a3a' : v.color;
    ctx.beginPath();
    ctx.roundRect(-m.w / 2, -m.h / 2, m.w, m.h, 5);
    ctx.fill();
    // cabin + windshield
    ctx.fillStyle = v.kind === 'cop' ? '#dfe6ee' : 'rgba(20, 30, 45, 0.75)';
    ctx.fillRect(-m.w * 0.18, -m.h / 2 + 3, m.w * 0.34, m.h - 6);
    ctx.fillStyle = 'rgba(140, 200, 235, 0.85)';
    ctx.fillRect(m.w * 0.16, -m.h / 2 + 4, 4, m.h - 8);
    if (v.kind === 'cop') {
      const flash = Math.floor(state.tick / 9) % 2 === 0;
      rect(-6, -m.h / 2 + 2, 5, 5, flash ? '#ff3b30' : '#5a1616');
      rect(1, -m.h / 2 + 2, 5, 5, flash ? '#1c3d5a' : '#3b82f6');
      rect(-6, m.h / 2 - 7, 5, 5, flash ? '#ff3b30' : '#5a1616');
      rect(1, m.h / 2 - 7, 5, 5, flash ? '#1c3d5a' : '#3b82f6');
    }
    if (CAR_MODELS[v.model].name === 'taxi') {
      rect(-4, -4, 8, 8, '#222');
      text('T', 0, 3, 8, '#ffd23f', 'center', 800);
    }
    if (v.gold) {
      ctx.strokeStyle = '#fff3b0';
      ctx.lineWidth = 2;
      ctx.strokeRect(-m.w / 2 + 1, -m.h / 2 + 1, m.w - 2, m.h - 2);
    }
    ctx.restore();
    if (v.hp < 42 && !v.wrecked) {
      circle(v.x + Math.cos(v.angle) * m.w * 0.4, v.y + Math.sin(v.angle) * m.w * 0.4, 6 + Math.sin(state.tick / 5) * 2, 'rgba(70,70,70,0.5)');
    }
    if (v.wrecked) {
      circle(v.x, v.y - 6, 9 + Math.sin(state.tick / 7) * 2, 'rgba(60,60,60,0.45)');
    }
  }

  function drawPlayer(state) {
    const p = state.player;
    if (p.inCar) return;
    circle(p.x + 2, p.y + 3, 11, PALETTE.shadow);
    // aim tick
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(p.aimAngle) * 14, p.y + Math.sin(p.aimAngle) * 14);
    ctx.lineTo(p.x + Math.cos(p.aimAngle) * 20, p.y + Math.sin(p.aimAngle) * 20);
    ctx.stroke();
    circle(p.x, p.y, 10.5, '#26418f'); // navy jacket
    circle(p.x, p.y, 6.5, '#e8b08a'); // head
    if (state.tick - p.muzzleT < 4 && p.ammo >= 0) {
      const fx = p.x + Math.cos(p.aimAngle) * 22;
      const fy = p.y + Math.sin(p.aimAngle) * 22;
      circle(fx, fy, 6, 'rgba(255, 190, 60, 0.9)');
    }
  }

  function drawFx(state) {
    for (const b of state.bullets) {
      circle(b.x, b.y, 2.6, '#ffeaa7');
    }
    for (const pt of state.particles) {
      ctx.globalAlpha = clamp(pt.life / pt.maxLife, 0, 1);
      circle(pt.x, pt.y, pt.size, pt.color);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    for (const f of state.floaters) {
      ctx.globalAlpha = clamp(f.life / 40, 0, 1);
      text(f.text, f.x, f.y, 15, f.color, 'center', 800);
    }
    ctx.globalAlpha = 1;
  }

  // ---- HUD -----------------------------------------------------------------
  function drawMinimap(state) {
    const mw = 192;
    const mh = 156;
    const x0 = view.w - mw - 14;
    const y0 = 64;
    panel(x0 - 4, y0 - 4, mw + 8, mh + 8, 0.6);
    const sx = mw / WORLD.w;
    const sy = mh / WORLD.h;
    rect(x0, y0 + SAND_Y * sy, mw, (WORLD.h - SAND_Y) * sy, PALETTE.water);
    rect(x0, y0 + SAND_Y * sy, mw, (WORLD.waterY - SAND_Y) * sy, PALETTE.sand);
    ctx.strokeStyle = 'rgba(255, 233, 201, 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const vx of WORLD.vRoads) { ctx.moveTo(x0 + vx * sx, y0); ctx.lineTo(x0 + vx * sx, y0 + mh); }
    for (const hy of WORLD.hRoads) { ctx.moveTo(x0, y0 + hy * sy); ctx.lineTo(x0 + mw, y0 + hy * sy); }
    ctx.stroke();
    for (const v of state.vehicles) {
      if (v.kind === 'cop' && v.driver === 'cop' && !v.wrecked) circle(x0 + v.x * sx, y0 + v.y * sy, 3, Math.floor(state.tick / 12) % 2 ? '#3b82f6' : '#ff3b30');
    }
    const t = state.hud.target;
    if (t) {
      const pulse = 4 + Math.sin(state.tick / 8) * 1.6;
      circle(x0 + t.x * sx, y0 + t.y * sy, pulse, PALETTE.accent2);
      circle(x0 + t.x * sx, y0 + t.y * sy, 2.2, '#7a4d00');
    }
    // player arrow
    const px = x0 + state.player.x * sx;
    const py = y0 + state.player.y * sy;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(state.player.inCar ? (state.playerCarAngle || 0) : state.player.aimAngle);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-4, -4);
    ctx.lineTo(-4, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawStars(state) {
    const x0 = view.w - 14 - 5 * 30;
    const y0 = 34;
    for (let i = 0; i < 5; i++) {
      const filled = i < state.wanted;
      const flash = state.playerSeen && Math.floor(state.tick / 10) % 2 === 0;
      text('★', x0 + i * 30, y0, 26, filled ? (flash ? '#fff' : PALETTE.accent2) : 'rgba(255,255,255,0.25)', 'left', 800);
    }
  }

  function drawHud(state) {
    const p = state.player;
    // cash + clock + district
    panel(12, 12, 216, 62);
    text(`$${p.cash}`, 24, 42, 24, PALETTE.good, 'left', 800);
    const mins = state.clockMinutes;
    const hh = String(Math.floor(mins / 60) % 24).padStart(2, '0');
    const mm = String(mins % 60).padStart(2, '0');
    text(`${hh}:${mm} · ${state.districtName}`, 24, 66, 14, PALETTE.hudText, 'left', 600);
    drawStars(state);
    drawMinimap(state);
    // objective
    if (state.hud.objective) {
      ctx.font = `700 15px ${FONT}`;
      const w = Math.min(view.w - 480, Math.max(240, ctx.measureText(state.hud.objective).width + 30));
      panel(view.w / 2 - w / 2, 12, w, 34);
      text(state.hud.objective, view.w / 2, 35, 15, PALETTE.hudText, 'center', 700);
    }
    // health
    panel(12, view.h - 46, 204, 34);
    rect(20, view.h - 38, 188, 16, 'rgba(255,255,255,0.15)');
    rect(20, view.h - 38, 188 * clamp(p.hp / 100, 0, 1), 16, p.hp > 30 ? PALETTE.good : PALETTE.bad);
    text('HP', 116, view.h - 25, 12, '#14100f', 'center', 800);
    // weapon
    const weapon = p.ammo > 0 ? `PISTOL · ${p.ammo}` : 'FISTS';
    panel(view.w - 150, view.h - 46, 138, 34);
    text(weapon, view.w - 81, view.h - 24, 15, PALETTE.hudText, 'center', 700);
    if (state.audio.muted) text('MUTED', view.w - 81, view.h - 52, 11, PALETTE.accent, 'center', 700);
    // context prompt
    if (state.hud.prompt) {
      panel(view.w / 2 - 130, view.h - 92, 260, 32);
      text(state.hud.prompt, view.w / 2, view.h - 71, 15, PALETTE.accent2, 'center', 700);
    }
    // bust meter
    if (state.bust > 1) {
      panel(view.w / 2 - 130, view.h - 140, 260, 30);
      rect(view.w / 2 - 120, view.h - 132, 240 * (state.bust / 100), 14, PALETTE.bad);
      text('BUSTED?', view.w / 2, view.h - 121, 12, '#fff', 'center', 800);
    }
    // banner
    if (state.banner && state.tick - state.banner.t < 300) {
      const a = clamp((300 - (state.tick - state.banner.t)) / 60, 0, 1);
      ctx.globalAlpha = a;
      text(state.banner.text, view.w / 2, 110, 30, PALETTE.accent2, 'center', 800);
      if (state.banner.sub) text(state.banner.sub, view.w / 2, 136, 15, PALETTE.hudText, 'center', 600);
      ctx.globalAlpha = 1;
    }
    // dialogue
    if (state.dialogueView) {
      const d = state.dialogueView;
      panel(60, view.h - 170, view.w - 120, 104, 0.88);
      text(d.speaker, 84, view.h - 138, 16, PALETTE.accent, 'left', 800);
      wrapText(d.line, 84, view.h - 112, view.w - 170, 20, 16, PALETTE.hudText);
      text('E ▸', view.w - 92, view.h - 78, 14, PALETTE.accent2, 'right', 800);
    }
    // low-hp vignette
    if (p.hp < 32 && state.screen === SCREEN_PLAY) {
      const pulse = 0.16 + Math.sin(state.tick / 9) * 0.06;
      const g = ctx.createRadialGradient(view.w / 2, view.h / 2, view.h * 0.32, view.w / 2, view.h / 2, view.h * 0.75);
      g.addColorStop(0, 'rgba(180,0,0,0)');
      g.addColorStop(1, `rgba(180,0,0,${pulse})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, view.w, view.h);
    }
  }

  function wrapText(str, x, y, maxW, lineH, size, color) {
    ctx.font = `600 ${size}px ${FONT}`;
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    const words = str.split(' ');
    let line = '';
    let yy = y;
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, yy);
        line = word;
        yy += lineH;
      } else line = test;
    }
    if (line) ctx.fillText(line, x, yy);
  }

  // ---- screens ---------------------------------------------------------------
  function drawTitle(state) {
    ctx.fillStyle = 'rgba(30, 8, 24, 0.45)';
    ctx.fillRect(0, 0, view.w, view.h);
    text('PALM CITY', view.w / 2, view.h * 0.3, 74, '#ffb347', 'center', 900);
    text('HEAT', view.w / 2, view.h * 0.3 + 74, 74, PALETTE.accent, 'center', 900);
    text('One broke courier. One fixer. One golden-hour city that never cools down.', view.w / 2, view.h * 0.3 + 116, 17, PALETTE.hudText, 'center', 600);
    text('Run packages for Vivi Solano, steal the golden coupe, out-drive the PCPD,', view.w / 2, view.h * 0.3 + 142, 15, 'rgba(255,233,201,0.8)', 'center', 500);
    text('and turn four jobs into a partnership — or a rap sheet.', view.w / 2, view.h * 0.3 + 164, 15, 'rgba(255,233,201,0.8)', 'center', 500);
    const y = view.h * 0.68;
    text('ENTER — New Game', view.w / 2, y, 22, PALETTE.accent2, 'center', 800);
    if (state.hasSave) text('C — Continue', view.w / 2, y + 34, 20, PALETTE.hudText, 'center', 700);
    text('WASD / arrows — move & drive   Shift — run   E — enter car / talk', view.w / 2, view.h - 64, 14, 'rgba(255,233,201,0.75)', 'center', 500);
    text('Mouse — aim   Click / J — fight & shoot   Esc / P — pause   M — mute', view.w / 2, view.h - 42, 14, 'rgba(255,233,201,0.75)', 'center', 500);
  }

  function drawEndScreen(state, kind) {
    ctx.fillStyle = kind === SCREEN_BUSTED ? 'rgba(16, 20, 48, 0.62)' : 'rgba(48, 8, 8, 0.62)';
    ctx.fillRect(0, 0, view.w, view.h);
    text(kind === SCREEN_BUSTED ? 'BUSTED' : 'WASTED', view.w / 2, view.h * 0.42, 68, kind === SCREEN_BUSTED ? '#7fb2ff' : PALETTE.bad, 'center', 900);
    text(state.endText || '', view.w / 2, view.h * 0.42 + 44, 17, PALETTE.hudText, 'center', 600);
    text('ENTER — back on the street', view.w / 2, view.h * 0.42 + 84, 18, PALETTE.accent2, 'center', 700);
  }

  function draw(state) {
    const cam = state.camera;
    ctx.save();
    // golden sky backdrop behind the world edges
    const sky = ctx.createLinearGradient(0, 0, 0, view.h);
    sky.addColorStop(0, '#ff9e5e');
    sky.addColorStop(1, '#e2603f');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, view.w, view.h);
    const shX = state.shake ? (Math.sin(state.tick * 2.3) * state.shake) : 0;
    const shY = state.shake ? (Math.cos(state.tick * 1.9) * state.shake) : 0;
    ctx.translate(-cam.x + shX, -cam.y + shY);
    drawGround(state, cam);
    drawProps(state, cam);
    drawBuildings(state, cam);
    drawPickups(state);
    for (const p of state.peds) {
      if (p.x < cam.x - 40 || p.x > cam.x + view.w + 40 || p.y < cam.y - 40 || p.y > cam.y + view.h + 40) continue;
      drawPed(p);
    }
    for (const v of state.vehicles) {
      if (v.dead) continue;
      if (v.x < cam.x - 60 || v.x > cam.x + view.w + 60 || v.y < cam.y - 60 || v.y > cam.y + view.h + 60) continue;
      drawVehicle(state, v);
    }
    drawPlayer(state);
    drawFx(state);
    ctx.restore();

    if (state.screen === SCREEN_TITLE) {
      drawTitle(state);
    } else {
      drawHud(state);
      if (state.screen === SCREEN_PAUSED) {
        ctx.fillStyle = 'rgba(20, 10, 20, 0.55)';
        ctx.fillRect(0, 0, view.w, view.h);
        text('PAUSED', view.w / 2, view.h * 0.44, 52, PALETTE.hudText, 'center', 900);
        text('P / Esc — resume', view.w / 2, view.h * 0.44 + 40, 17, PALETTE.accent2, 'center', 700);
      } else if (state.screen === SCREEN_BUSTED || state.screen === SCREEN_WASTED) {
        drawEndScreen(state, state.screen);
      }
    }
    // warm wash over everything, like the last hour of sun
    ctx.fillStyle = 'rgba(255, 140, 60, 0.05)';
    ctx.fillRect(0, 0, view.w, view.h);
  }

  return { draw, view };
}

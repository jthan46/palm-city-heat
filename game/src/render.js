// Palm City Heat — rendering.
// Everything is drawn in code on one canvas: the golden-hour city (roads,
// sidewalks, rooftops with long shadows, beach and water), cars, peds, the
// player, effects, then screen-space HUD, minimap, dialogue and menus.
// Rendering never mutates the simulation and never touches the RNG, so it
// cannot break determinism.

import { VIEW_W, VIEW_H, GRID, PALETTE, DISTRICT_ROOFS } from './config.js';

export function render(ctx, state) {
  const cam = state.camera;
  ctx.fillStyle = PALETTE.waterDeep;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.save();
  ctx.translate(-Math.round(cam.x), -Math.round(cam.y));
  drawGround(ctx, state);
  drawLocations(ctx, state);
  drawPickups(ctx, state);
  drawPeds(ctx, state);
  drawCars(ctx, state);
  drawPlayer(ctx, state);
  drawEffects(ctx, state);
  drawMarker(ctx, state);
  ctx.restore();

  drawSunWash(ctx, state);
  if (state.screen === 'title') drawTitle(ctx, state);
  else {
    drawHUD(ctx, state);
    if (state.screen === 'pause') drawPause(ctx, state);
    if (state.screen === 'busted') drawEndCard(ctx, state, 'BUSTED', '#5aa2ff', 'The PCPD cuff you and haul you downtown.');
    if (state.screen === 'wasted') drawEndCard(ctx, state, 'WASTED', PALETTE.danger, 'You wake up under Palm City General\u2019s lights.');
  }
  if (state.dialogue && state.screen !== 'title') drawDialogue(ctx, state);
  if (state.message) drawMessage(ctx, state);
}

// --- world ----------------------------------------------------------------

function drawGround(ctx, state) {
  const w = state.world;
  // Asphalt base for the whole road grid.
  ctx.fillStyle = PALETTE.asphalt;
  ctx.fillRect(0, 0, w.gridW, w.H);
  // Block grounds.
  for (const b of w.blocks) {
    ctx.fillStyle = b.ground === 'grass' ? PALETTE.grass : b.ground === 'sand' ? PALETTE.sand : PALETTE.sidewalk;
    ctx.fillRect(b.x - 14, b.y - 14, b.w + 28, b.h + 28);
    if (b.ground === 'grass') {
      ctx.fillStyle = PALETTE.grassDark;
      ctx.fillRect(b.x - 14, b.y - 14, b.w + 28, 6);
    }
  }
  // Beach + water.
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(w.beachX, 0, w.waterX - w.beachX, w.H);
  ctx.fillStyle = PALETTE.sandDark;
  ctx.fillRect(w.beachX, 0, 5, w.H);
  const wr = w.waterRects[0];
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(wr.x, wr.y, wr.w, wr.h);
  ctx.strokeStyle = PALETTE.waterFoam;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let y = 10; y < w.H; y += 46) {
    const wob = Math.sin(state.time * 1.4 + y * 0.05) * 5;
    ctx.moveTo(wr.x + 6 + wob, y);
    ctx.lineTo(wr.x + 30 + wob, y);
  }
  ctx.stroke();
  // Park ponds.
  for (const p of w.ponds) {
    ctx.fillStyle = PALETTE.water;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }

  drawRoadMarkings(ctx, state);

  // Trees under buildings' shadows layer order: shadows, buildings, trees.
  for (const b of w.buildings) drawBuilding(ctx, b);
  for (const t of w.trees) drawTree(ctx, t, state.time);
  for (const l of w.lamps) {
    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(l.x - 1, l.y - 1, 3, 3);
    ctx.fillStyle = 'rgba(255, 190, 92, 0.85)';
    ctx.beginPath();
    ctx.arc(l.x, l.y, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawRoadMarkings(ctx, state) {
  const w = state.world;
  ctx.strokeStyle = PALETTE.laneMark;
  ctx.lineWidth = 3;
  ctx.setLineDash([22, 18]);
  for (const x of w.roadVX) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, w.H);
    ctx.stroke();
  }
  for (const y of w.roadHY) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w.gridW, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // Crosswalks at intersections.
  ctx.fillStyle = PALETTE.crosswalk;
  for (const x of w.roadVX) {
    for (const y of w.roadHY) {
      for (let i = -2; i <= 2; i++) {
        ctx.fillRect(x - 4, y + i * 16 - 3, 8, 6);
        ctx.fillRect(x + i * 16 - 3, y - 4, 6, 8);
      }
    }
  }
}

function drawBuilding(ctx, b) {
  // Long golden-hour shadow to the east.
  ctx.fillStyle = PALETTE.roofShadow;
  const sh = 8 + b.floors * 2;
  ctx.fillRect(b.x + sh, b.y + sh * 0.6, b.w, b.h);
  ctx.fillStyle = b.color;
  ctx.fillRect(b.x, b.y, b.w, b.h);
  // Roof inset + parapet.
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fillRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.fillRect(b.x + 9, b.y + 9, b.w - 18, b.h - 18);
  // Windows: deterministic pattern from position so no RNG is needed.
  if (b.district === 'downtown' || b.district === 'commercial') {
    ctx.fillStyle = 'rgba(255, 214, 130, 0.75)';
    const cols = Math.floor(b.w / 16);
    const rows = Math.floor(b.h / 16);
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        if ((i * 31 + j * 17 + Math.floor(b.x) + Math.floor(b.y)) % 3 === 0) {
          ctx.fillRect(b.x + 8 + i * 16, b.y + 8 + j * 16, 7, 5);
        }
      }
    }
  }
  if (b.district === 'commercial') {
    ctx.fillStyle = '#c94f43';
    ctx.fillRect(b.x, b.y + b.h - 10, b.w, 6); // awning stripe
  }
  if (b.district === 'suburbs') {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(b.x + b.w / 2 - 6, b.y + b.h - 12, 12, 12); // door
  }
}

function drawTree(ctx, t, time) {
  if (t.kind === 'palm') {
    ctx.strokeStyle = '#8a6b46';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(t.x, t.y + 6);
    ctx.quadraticCurveTo(t.x + 3, t.y - 4, t.x + 6, t.y - 10);
    ctx.stroke();
    ctx.strokeStyle = '#4e7d3a';
    ctx.lineWidth = 2.4;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + Math.sin(time + t.x) * 0.05;
      ctx.beginPath();
      ctx.moveTo(t.x + 6, t.y - 10);
      ctx.quadraticCurveTo(t.x + 6 + Math.cos(a) * 10, t.y - 14 + Math.sin(a) * 4, t.x + 6 + Math.cos(a) * 16, t.y - 8 + Math.sin(a) * 9);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = 'rgba(43,20,32,0.25)';
    ctx.beginPath();
    ctx.arc(t.x + 5, t.y + 4, t.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4e7d3a';
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5d8a46';
    ctx.beginPath();
    ctx.arc(t.x - t.r * 0.3, t.y - t.r * 0.3, t.r * 0.62, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawLocations(ctx, state) {
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const key of ['motel', 'warehouse', 'garage', 'safehouse', 'hospital', 'station', 'pier']) {
    const loc = state.world.locations[key];
    if (!loc) continue;
    ctx.fillStyle = 'rgba(20,12,24,0.55)';
    const wText = ctx.measureText(loc.label).width + 10;
    ctx.fillRect(loc.x - wText / 2, loc.y - 34, wText, 15);
    ctx.fillStyle = '#ffe9c9';
    ctx.fillText(loc.label, loc.x, loc.y - 23);
    ctx.fillStyle = PALETTE.hudAccent;
    ctx.fillRect(loc.x - 2, loc.y - 14, 4, 4);
  }
}

// --- entities ---------------------------------------------------------------

function drawPickups(ctx, state) {
  for (const pk of state.pickups) {
    const bob = Math.sin(state.time * 4 + pk.x) * 2;
    ctx.save();
    ctx.translate(pk.x, pk.y + bob);
    if (pk.kind === 'cash') {
      ctx.fillStyle = '#3f9e4d';
      ctx.fillRect(-8, -5, 16, 10);
      ctx.fillStyle = '#8be08b';
      ctx.fillRect(-8, -1.5, 16, 3);
    } else if (pk.kind === 'ammo') {
      ctx.fillStyle = '#6b543a';
      ctx.fillRect(-7, -6, 14, 12);
      ctx.fillStyle = '#ffd23e';
      ctx.fillRect(-7, -6, 14, 4);
    } else {
      ctx.fillStyle = '#e8e3d8';
      ctx.fillRect(-7, -7, 14, 14);
      ctx.fillStyle = '#c94f43';
      ctx.fillRect(-2, -5, 4, 10);
      ctx.fillRect(-5, -2, 10, 4);
    }
    ctx.restore();
  }
}

function drawPeds(ctx, state) {
  for (const ped of state.peds) {
    ctx.save();
    ctx.translate(ped.x, ped.y);
    if (ped.state === 'down') {
      ctx.rotate(1.2);
      ctx.fillStyle = ped.shirt;
      ctx.fillRect(-9, -3.4, 18, 6.8);
      ctx.fillStyle = ped.skin;
      ctx.beginPath();
      ctx.arc(11, 0, 4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.rotate(ped.angle);
      ctx.fillStyle = 'rgba(43,20,32,0.25)';
      ctx.beginPath();
      ctx.arc(2, 2.4, 6.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ped.pants;
      ctx.fillRect(-4.4, -4.6, 8.8, 9.2);
      ctx.fillStyle = ped.shirt;
      ctx.fillRect(-5.2, -5.2, 10.4, 10.4);
      ctx.fillStyle = ped.skin;
      ctx.beginPath();
      ctx.arc(1.6, 0, 4.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

export function drawCarShape(ctx, car, time) {
  const spec = { w: car.w, h: car.h };
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // Shadow.
  ctx.fillStyle = 'rgba(43,20,32,0.32)';
  roundRect(ctx, -spec.w / 2 + 5, -spec.h / 2 + 4, spec.w, spec.h, 6);
  ctx.fill();
  // Body.
  ctx.fillStyle = car.dead ? '#4c4c4c' : car.color;
  roundRect(ctx, -spec.w / 2, -spec.h / 2, spec.w, spec.h, 6);
  ctx.fill();
  if (car.type === 'police') {
    ctx.fillStyle = '#e8e3d8';
    ctx.fillRect(-6, -spec.h / 2, 15, spec.h);
    // Light bar: red/blue strobe.
    const phase = Math.floor(time * 6) % 2 === 0;
    ctx.fillStyle = phase ? '#ff3b30' : '#3b82f6';
    ctx.fillRect(-3, -spec.h / 2 + 1, 7, 5);
    ctx.fillStyle = phase ? '#3b82f6' : '#ff3b30';
    ctx.fillRect(-3, spec.h / 2 - 6, 7, 5);
  }
  if (car.type === 'taxi') {
    ctx.fillStyle = '#20242e';
    ctx.fillRect(-4, -4, 8, 8);
    ctx.fillStyle = '#f2b63c';
    ctx.fillRect(-2.4, -2.4, 4.8, 4.8);
  }
  if (car.gold) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(-spec.w / 2 + 4, -2, spec.w - 8, 4);
  }
  // Cabin + glass.
  ctx.fillStyle = 'rgba(24, 30, 44, 0.9)';
  roundRect(ctx, -spec.w * 0.18, -spec.h * 0.36, spec.w * 0.34, spec.h * 0.72, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(160, 210, 235, 0.5)';
  ctx.fillRect(spec.w * 0.13, -spec.h * 0.32, 3.4, spec.h * 0.64);
  // Headlights.
  ctx.fillStyle = '#ffe9a0';
  ctx.fillRect(spec.w / 2 - 2, -spec.h / 2 + 2.4, 2.4, 4);
  ctx.fillRect(spec.w / 2 - 2, spec.h / 2 - 6.4, 2.4, 4);
  ctx.restore();
  // Damage smoke.
  if (!car.dead && car.health < 45) {
    const n = car.health < 22 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const wob = Math.sin(time * 5 + car.id * 3 + i * 2.1) * 4;
      ctx.fillStyle = `rgba(70, 66, 70, ${0.35 - i * 0.09})`;
      ctx.beginPath();
      ctx.arc(car.x + Math.cos(car.angle) * 18 + wob, car.y + Math.sin(car.angle) * 18 - i * 9, 5 + i * 3.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (car.dead) {
    ctx.fillStyle = 'rgba(30,28,30,0.5)';
    ctx.beginPath();
    ctx.arc(car.x, car.y, 16, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCars(ctx, state) {
  for (const car of state.cars) drawCarShape(ctx, car, state.time);
}

function drawPlayer(ctx, state) {
  const p = state.player;
  if (p.inCar) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = 'rgba(43,20,32,0.3)';
  ctx.beginPath();
  ctx.arc(2, 3, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(p.angle);
  // Melee swing arc.
  if (p.swingT > 0) {
    ctx.strokeStyle = 'rgba(255, 233, 201, 0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(6, 0, 20, -0.9, 0.9);
    ctx.stroke();
  }
  ctx.fillStyle = '#274156';
  ctx.fillRect(-5, -5, 10, 10); // jeans jacket torso
  ctx.fillStyle = '#ff8c42';
  ctx.fillRect(-5, -5, 10, 3.4); // sunset shirt stripe
  ctx.fillStyle = '#8a5a3b';
  ctx.beginPath();
  ctx.arc(1.8, 0, 4.4, 0, Math.PI * 2); // head
  ctx.fill();
  // Pistol in hand.
  ctx.fillStyle = '#1c1c22';
  ctx.fillRect(6, -1.4, 8, 2.8);
  if (p.muzzleT > 0) {
    ctx.fillStyle = '#ffe9a0';
    ctx.beginPath();
    ctx.arc(17, 0, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // Bust meter ring over the player's head.
  if (state.bust > 0.03 && state.screen === 'play') {
    ctx.strokeStyle = 'rgba(20,12,24,0.6)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 20, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = PALETTE.policeBlip;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 20, 8, -Math.PI / 2, -Math.PI / 2 + state.bust * Math.PI * 2);
    ctx.stroke();
  }
}

function drawEffects(ctx, state) {
  ctx.strokeStyle = '#ffe9a0';
  ctx.lineWidth = 2;
  for (const b of state.bullets) {
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.012, b.y - b.vy * 0.012);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (const pt of state.particles) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;
  ctx.font = '700 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const f of state.floaters) {
    ctx.globalAlpha = Math.max(0, 1 - f.t / f.life);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

function drawMarker(ctx, state) {
  const m = state.marker;
  if (!m || state.screen === 'title') return;
  const pulse = 1 + Math.sin(state.time * 5) * 0.15;
  ctx.strokeStyle = m.color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(m.x, m.y, 17 * pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = m.color;
  ctx.beginPath();
  ctx.moveTo(m.x, m.y - 30 - Math.sin(state.time * 5) * 3);
  ctx.lineTo(m.x - 7, m.y - 42 - Math.sin(state.time * 5) * 3);
  ctx.lineTo(m.x + 7, m.y - 42 - Math.sin(state.time * 5) * 3);
  ctx.closePath();
  ctx.fill();
  // Beacon of light so the target reads across the city.
  const grad = ctx.createLinearGradient(m.x, m.y - 190, m.x, m.y);
  grad.addColorStop(0, 'rgba(255, 210, 62, 0)');
  grad.addColorStop(1, 'rgba(255, 210, 62, 0.20)');
  ctx.fillStyle = grad;
  ctx.fillRect(m.x - 9, m.y - 190, 18, 190);
}

// --- screen space -----------------------------------------------------------

function drawSunWash(ctx, state) {
  const grad = ctx.createRadialGradient(VIEW_W * 0.18, VIEW_H * 0.1, 60, VIEW_W * 0.5, VIEW_H * 0.5, VIEW_W * 0.85);
  grad.addColorStop(0, PALETTE.sunGlow);
  grad.addColorStop(1, 'rgba(20, 8, 26, 0.20)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // Damage vignette.
  const hp = state.player.hp;
  if (state.screen === 'play' && hp < 45) {
    const a = (0.45 - hp / 100) * (0.75 + Math.sin(state.time * 6) * 0.25);
    const rg = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.32, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.75);
    rg.addColorStop(0, 'rgba(160, 20, 20, 0)');
    rg.addColorStop(1, `rgba(160, 20, 20, ${Math.max(0, a)})`);
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = PALETTE.hudPanel;
  roundRect(ctx, x, y, w, h, 8);
  ctx.fill();
}

function drawHUD(ctx, state) {
  const p = state.player;
  // Cash + clock, top-left.
  panel(ctx, 12, 12, 168, 52);
  ctx.fillStyle = '#8be08b';
  ctx.font = '700 19px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`$${p.cash}`, 22, 36);
  ctx.fillStyle = PALETTE.hudText;
  ctx.font = '600 12.5px system-ui, sans-serif';
  ctx.fillText(`Day ${state.day}  ${formatClock(state.clockMin)}`, 22, 55);
  ctx.fillText(districtLabel(state), 96, 36);

  // Wanted stars, top-centre.
  if (state.stars > 0) {
    ctx.font = '20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i < state.stars ? '#ffd23e' : 'rgba(255,255,255,0.22)';
      ctx.fillText('★', VIEW_W / 2 - 52 + i * 26, 34);
    }
  }

  // Objective, top-centre under the stars.
  if (state.objective) {
    ctx.font = '600 13.5px system-ui, sans-serif';
    const tw = ctx.measureText(state.objective).width + 22;
    panel(ctx, VIEW_W / 2 - tw / 2, 44, tw, 24);
    ctx.fillStyle = PALETTE.hudText;
    ctx.textAlign = 'center';
    ctx.fillText(state.objective, VIEW_W / 2, 60);
  }

  // Health, bottom-left.
  panel(ctx, 12, VIEW_H - 44, 196, 32);
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fillRect(20, VIEW_H - 34, 150, 12);
  ctx.fillStyle = p.hp > 30 ? '#8be08b' : PALETTE.danger;
  ctx.fillRect(20, VIEW_H - 34, 150 * Math.max(0, p.hp) / 100, 12);
  ctx.fillStyle = PALETTE.hudText;
  ctx.font = '700 12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('HP', 176, VIEW_H - 24);

  // Weapon + ammo, bottom-right.
  panel(ctx, VIEW_W - 168, VIEW_H - 44, 156, 32);
  ctx.fillStyle = PALETTE.hudText;
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(p.inCar ? 'DRIVING' : 'PISTOL', VIEW_W - 66, VIEW_H - 24);
  ctx.fillStyle = PALETTE.hudAccent;
  ctx.font = '700 14px system-ui, sans-serif';
  ctx.fillText(p.inCar ? '' : `${p.ammo}`, VIEW_W - 22, VIEW_H - 24);

  // Context hint.
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255, 233, 201, 0.75)';
  ctx.fillText(state.hint || '', VIEW_W / 2, VIEW_H - 16);

  drawMinimap(ctx, state);
}

function drawMinimap(ctx, state) {
  const w = state.world;
  const mw = 178, mh = 118;
  const x0 = VIEW_W - mw - 12, y0 = 12;
  panel(ctx, x0 - 4, y0 - 4, mw + 8, mh + 8);
  const sx = mw / w.W, sy = mh / w.H;
  const mx = (wx) => x0 + wx * sx;
  const my = (wy) => y0 + wy * sy;
  ctx.fillStyle = '#33506b';
  ctx.fillRect(x0, y0, mw, mh);
  ctx.fillStyle = '#6a7d5a';
  ctx.fillRect(x0, y0, w.gridW * sx, mh);
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(mx(w.beachX), y0, (w.waterX - w.beachX) * sx, mh);
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(mx(w.waterX), y0, (w.W - w.waterX) * sx, mh);
  ctx.strokeStyle = 'rgba(30,26,32,0.65)';
  ctx.lineWidth = 1.6;
  for (const x of w.roadVX) {
    ctx.beginPath(); ctx.moveTo(mx(x), y0); ctx.lineTo(mx(x), y0 + mh); ctx.stroke();
  }
  for (const y of w.roadHY) {
    ctx.beginPath(); ctx.moveTo(x0, my(y)); ctx.lineTo(x0 + w.gridW * sx, my(y)); ctx.stroke();
  }
  // Mission marker.
  if (state.marker) {
    ctx.fillStyle = state.marker.color;
    ctx.beginPath();
    ctx.arc(mx(state.marker.x), my(state.marker.y), 3.4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Police blips.
  ctx.fillStyle = PALETTE.policeBlip;
  for (const c of state.cars) {
    if (c.driver !== 'police' || c.dead) continue;
    if (Math.floor(state.time * 3) % 2 === 0) {
      ctx.fillRect(mx(c.x) - 2, my(c.y) - 2, 4, 4);
    }
  }
  // Player arrow.
  const p = state.player;
  ctx.save();
  ctx.translate(mx(p.x), my(p.y));
  ctx.rotate(p.inCar ? p.inCar.angle : p.angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(5.4, 0);
  ctx.lineTo(-3.6, -3.2);
  ctx.lineTo(-3.6, 3.2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawDialogue(ctx, state) {
  const d = state.dialogue;
  const line = d.lines[d.idx];
  const colon = line.indexOf(':');
  const speaker = colon > 0 ? line.slice(0, colon) : d.speaker;
  const text = colon > 0 ? line.slice(colon + 1).trim() : line;
  const h = 74;
  panel(ctx, 90, VIEW_H - h - 52, VIEW_W - 180, h);
  ctx.fillStyle = PALETTE.hudAccent;
  ctx.font = '700 13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(speaker, 108, VIEW_H - h - 28);
  ctx.fillStyle = PALETTE.hudText;
  ctx.font = '15px system-ui, sans-serif';
  wrapText(ctx, text, 108, VIEW_H - h - 6, VIEW_W - 216, 19);
  ctx.fillStyle = 'rgba(255,233,201,0.6)';
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('E / click ▸', VIEW_W - 104, VIEW_H - 62);
}

function drawMessage(ctx, state) {
  ctx.font = '700 21px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(20,12,24,0.55)';
  const tw = ctx.measureText(state.message).width + 36;
  roundRect(ctx, VIEW_W / 2 - tw / 2, 84, tw, 38, 9);
  ctx.fill();
  ctx.fillStyle = PALETTE.hudText;
  ctx.fillText(state.message, VIEW_W / 2, 110);
}

function drawTitle(ctx, state) {
  const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  grad.addColorStop(0, 'rgba(43, 18, 40, 0.42)');
  grad.addColorStop(0.55, 'rgba(43, 18, 40, 0.18)');
  grad.addColorStop(1, 'rgba(43, 18, 40, 0.66)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffb347';
  ctx.font = '800 64px system-ui, sans-serif';
  ctx.fillText('PALM CITY', VIEW_W / 2, 138);
  ctx.fillStyle = '#ff5a4e';
  ctx.fillText('HEAT', VIEW_W / 2, 202);
  ctx.fillStyle = PALETTE.hudText;
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillText('One broke courier. One fixer. One golden-hour city that never cools down.', VIEW_W / 2, 244);
  ctx.font = '14.5px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,233,201,0.9)';
  const lines = [
    'Run packages for Dante Ferro, steal the golden coupe, out-drive the PCPD,',
    'and turn four jobs into a partnership — or a rap sheet.',
    '',
    'WASD / arrows — move & drive      Shift — run      E — enter car / talk',
    'Mouse — aim      Click / J — fight & shoot      Esc / P — pause      M — mute',
  ];
  lines.forEach((l, i) => ctx.fillText(l, VIEW_W / 2, 292 + i * 21));
  ctx.font = '700 19px system-ui, sans-serif';
  ctx.fillStyle = Math.floor(state.time * 1.6) % 2 === 0 ? '#ffd23e' : '#ffe9c9';
  ctx.fillText(state.saveExists ? 'Press ENTER — continue    ·    N — new game' : 'Press ENTER — start', VIEW_W / 2, 452);
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,233,201,0.55)';
  ctx.fillText('An original top-down open-world crime game. Any resemblance to other cities is pure sunshine.', VIEW_W / 2, VIEW_H - 18);
}

function drawPause(ctx, state) {
  ctx.fillStyle = 'rgba(16, 8, 20, 0.62)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.hudText;
  ctx.font = '800 38px system-ui, sans-serif';
  ctx.fillText('PAUSED', VIEW_W / 2, 218);
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillText('Esc / P — resume      M — toggle sound', VIEW_W / 2, 258);
  ctx.fillText(`Cash $${state.player.cash} · Jobs done ${state.storyIdx} · Crimes witnessed ${state.stats.crimesWitnessed}`, VIEW_W / 2, 288);
}

function drawEndCard(ctx, state, word, color, sub) {
  ctx.fillStyle = 'rgba(16, 8, 20, 0.55)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.font = '900 74px system-ui, sans-serif';
  ctx.fillText(word, VIEW_W / 2, VIEW_H / 2 - 12);
  ctx.fillStyle = PALETTE.hudText;
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillText(sub, VIEW_W / 2, VIEW_H / 2 + 26);
  ctx.font = '600 13.5px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,233,201,0.75)';
  ctx.fillText('Press ENTER to get back on the street', VIEW_W / 2, VIEW_H / 2 + 54);
}

function districtLabel(state) {
  const names = {
    downtown: 'Downtown', commercial: 'Commercial', suburbs: 'Suburbs',
    park: 'Palm Park', beach: 'The Beach', street: '', water: 'The Bay',
  };
  const d = state.district || 'street';
  return names[d] || '';
}

export function formatClock(mins) {
  const m = ((Math.floor(mins) % 1440) + 1440) % 1440;
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export { DISTRICT_ROOFS };

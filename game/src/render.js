// Palm City Heat — everything the player sees: the city from above at golden hour, the
// cars and crowds, the HUD with its live minimap, dialogue, and the title / pause /
// busted / wasted screens. Drawing only: it reads the state and never changes the game.

import { COLORS, ROAD_PERIOD, TILE, WORLD_H, WORLD_W } from './config.js';
import { currentMarker, currentObjective } from './missions.js';
import { tileKind, TILE_GRASS, TILE_ROAD, TILE_SAND, TILE_SIDEWALK, TILE_WATER } from './world.js';
import { carRadius } from './vehicles.js';

export function updateCamera(state, viewW, viewH) {
  const p = state.player;
  state.camera.x = Math.max(0, Math.min(WORLD_W - viewW, p.x - viewW / 2));
  state.camera.y = Math.max(0, Math.min(WORLD_H - viewH, p.y - viewH / 2));
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawGround(ctx, state, viewW, viewH) {
  const cam = state.camera;
  const tx0 = Math.max(0, Math.floor(cam.x / TILE));
  const ty0 = Math.max(0, Math.floor(cam.y / TILE));
  const tx1 = Math.min(63, Math.ceil((cam.x + viewW) / TILE));
  const ty1 = Math.min(47, Math.ceil((cam.y + viewH) / TILE));
  for (let ty = ty0; ty <= ty1; ty += 1) {
    for (let tx = tx0; tx <= tx1; tx += 1) {
      const kind = tileKind(tx, ty);
      const x = tx * TILE - cam.x;
      const y = ty * TILE - cam.y;
      let fill = COLORS.block;
      if (kind === TILE_ROAD) fill = COLORS.road;
      else if (kind === TILE_SIDEWALK) fill = COLORS.sidewalk;
      else if (kind === TILE_GRASS) fill = COLORS.grass;
      else if (kind === TILE_SAND) fill = COLORS.sand;
      else if (kind === TILE_WATER) fill = (tx + ty) % 2 ? COLORS.water : COLORS.waterDeep;
      ctx.fillStyle = fill;
      ctx.fillRect(x, y, TILE + 1, TILE + 1);
      if (kind === TILE_ROAD) {
        ctx.fillStyle = COLORS.lane;
        if (ty % ROAD_PERIOD === 1 && tx % ROAD_PERIOD >= 2) ctx.fillRect(x + 9, y - 1, 30, 3);
        if (tx % ROAD_PERIOD === 1 && ty % ROAD_PERIOD >= 2) ctx.fillRect(x - 1, y + 9, 3, 30);
      }
    }
  }
  // Parking lots read as asphalt aprons over the block ground.
  ctx.fillStyle = '#57505c';
  for (const lot of state.world.lots) {
    ctx.fillRect(lot.x - cam.x, lot.y - cam.y, lot.w, lot.h);
    ctx.strokeStyle = 'rgba(232,217,160,0.5)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i += 1) {
      ctx.strokeRect(lot.x - cam.x + 30 + i * 74, lot.y - cam.y + 34, 52, 74);
    }
  }
}

function drawProps(ctx, state) {
  const cam = state.camera;
  for (const t of state.world.trees) {
    const x = t.x - cam.x;
    const y = t.y - cam.y;
    if (x < -40 || y < -40 || x > 1400 || y > 900) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.ellipse(x + 6, y + 8, t.r, t.r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6d4c2f';
    ctx.fillRect(x - 2, y - 2, 4, 8);
    ctx.fillStyle = t.palm ? '#5f9e52' : '#4e7d3a';
    ctx.beginPath(); ctx.arc(x, y - 4, t.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = t.palm ? '#79b657' : '#649149';
    ctx.beginPath(); ctx.arc(x - t.r * 0.3, y - t.r * 0.4, t.r * 0.62, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#3d405b';
  for (const l of state.world.lights) {
    const x = l.x - cam.x;
    const y = l.y - cam.y;
    if (x < -10 || y < -10 || x > 1400 || y > 900) continue;
    ctx.fillRect(x, y, 3, 3);
    ctx.fillStyle = 'rgba(255,214,120,0.20)';
    ctx.beginPath(); ctx.arc(x + 1, y + 1, 13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3d405b';
  }
}

function drawBuildings(ctx, state) {
  const cam = state.camera;
  for (const b of state.world.buildings) {
    const x = b.x - cam.x;
    const y = b.y - cam.y;
    if (x + b.w < -80 || y + b.h < -80 || x > 1450 || y > 950) continue;
    ctx.fillStyle = 'rgba(30,16,8,0.35)';
    ctx.fillRect(x + b.height * 0.22, y + b.height * 0.13, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(x, y, b.w, b.h);
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    ctx.fillRect(x + 5, y + 5, b.w - 10, b.h - 10);
    ctx.fillStyle = b.trim;
    ctx.fillRect(x, y + b.h - 7, b.w, 7);
    if (b.height > 55) {
      ctx.fillStyle = 'rgba(255,224,138,0.75)';
      const cols = Math.floor(b.w / 26);
      const rows = Math.floor(b.h / 26);
      for (let i = 0; i < cols; i += 1) {
        for (let j = 0; j < rows; j += 1) {
          if ((i * 7 + j * 13 + Math.floor(b.x) + Math.floor(b.y)) % 5 === 0) continue;
          ctx.fillRect(x + 10 + i * 26, y + 10 + j * 26, 9, 12);
        }
      }
    }
  }
}

function drawPickups(ctx, state) {
  const cam = state.camera;
  for (const pk of state.pickups) {
    const x = pk.x - cam.x;
    const y = pk.y - cam.y + Math.sin(pk.t * 4) * 3;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(x, y + 8, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
    if (pk.kind === 'cash') {
      ctx.fillStyle = '#57a773';
      rr(ctx, x - 8, y - 5, 16, 10, 2); ctx.fill();
      ctx.fillStyle = '#d9f2c2';
      ctx.font = 'bold 8px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('$', x, y + 3);
    } else if (pk.kind === 'ammo') {
      ctx.fillStyle = '#8d6e63';
      rr(ctx, x - 8, y - 6, 16, 12, 2); ctx.fill();
      ctx.fillStyle = '#ffd23c';
      ctx.fillRect(x - 5, y - 3, 3, 6);
      ctx.fillRect(x + 2, y - 3, 3, 6);
    } else {
      ctx.fillStyle = '#e4e0d8';
      rr(ctx, x - 8, y - 8, 16, 16, 3); ctx.fill();
      ctx.fillStyle = '#c94f4f';
      ctx.fillRect(x - 2, y - 5, 4, 10);
      ctx.fillRect(x - 5, y - 2, 10, 4);
    }
  }
}

function drawMarker(ctx, state) {
  const marker = currentMarker(state);
  if (!marker || state.screen !== 'playing') return;
  const cam = state.camera;
  const x = marker.x - cam.x;
  const y = marker.y - cam.y;
  const bob = Math.sin(state.time * 3.2) * 5;
  const grad = ctx.createLinearGradient(0, y - 190, 0, y);
  grad.addColorStop(0, 'rgba(255,210,60,0)');
  grad.addColorStop(1, 'rgba(255,210,60,0.30)');
  ctx.fillStyle = grad;
  ctx.fillRect(x - 13, y - 190, 26, 190);
  ctx.strokeStyle = '#ffd23c';
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(x, y, 20 + Math.sin(state.time * 3.2) * 3, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#ffd23c';
  ctx.save();
  ctx.translate(x, y - 34 + bob);
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-8, -8, 16, 16);
  ctx.restore();
}

function drawPed(ctx, ped, cam) {
  const x = ped.x - cam.x;
  const y = ped.y - cam.y;
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(x, y + 5, 8, 4, 0, 0, Math.PI * 2); ctx.fill();
  if (ped.down) {
    ctx.fillStyle = ped.color;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ped.angle);
    rr(ctx, -11, -5, 22, 10, 5); ctx.fill();
    ctx.restore();
    return;
  }
  ctx.fillStyle = ped.color;
  ctx.beginPath(); ctx.arc(x, y, 7.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = ped.skin;
  ctx.beginPath(); ctx.arc(x + Math.cos(ped.angle) * 2, y + Math.sin(ped.angle) * 2, 4.4, 0, Math.PI * 2); ctx.fill();
}

function drawCar(ctx, state, car) {
  const cam = state.camera;
  const x = car.x - cam.x;
  const y = car.y - cam.y;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(3, 5, carRadius(car), carRadius(car) * 0.62, 0, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(car.angle);
  ctx.fillStyle = car.hp <= 0 ? '#4c4c4c' : car.color;
  rr(ctx, -car.len / 2, -car.wid / 2, car.len, car.wid, 5); ctx.fill();
  ctx.fillStyle = 'rgba(20,24,32,0.85)';
  rr(ctx, -car.len * 0.16, -car.wid / 2 + 2.5, car.len * 0.34, car.wid - 5, 3); ctx.fill();
  ctx.fillStyle = 'rgba(190,225,245,0.8)';
  rr(ctx, car.len * 0.2, -car.wid / 2 + 3, car.len * 0.1, car.wid - 6, 2); ctx.fill();
  if (car.police) {
    ctx.fillStyle = '#eef2f5';
    ctx.fillRect(-car.len * 0.05, -car.wid / 2, car.len * 0.16, car.wid);
    const flash = Math.floor(state.time * 2.4) % 2 === 0;
    ctx.fillStyle = flash ? '#ff4040' : '#4060ff';
    ctx.fillRect(-3, -car.wid / 2 + 2, 6, 4);
    ctx.fillStyle = flash ? '#4060ff' : '#ff4040';
    ctx.fillRect(-3, car.wid / 2 - 6, 6, 4);
  }
  if (car.isMissionCar) {
    ctx.strokeStyle = '#ffd23c';
    ctx.lineWidth = 2;
    rr(ctx, -car.len / 2 - 2, -car.wid / 2 - 2, car.len + 4, car.wid + 4, 6); ctx.stroke();
  }
  ctx.fillStyle = '#ffe9a0';
  ctx.fillRect(car.len / 2 - 2, -car.wid / 2 + 2, 2.5, 3.5);
  ctx.fillRect(car.len / 2 - 2, car.wid / 2 - 5.5, 2.5, 3.5);
  ctx.restore();
}

function drawPlayer(ctx, state) {
  const p = state.player;
  if (p.car) return;
  const cam = state.camera;
  const x = p.x - cam.x;
  const y = p.y - cam.y;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(x, y + 6, 9, 4.5, 0, 0, Math.PI * 2); ctx.fill();
  if (state.input.shoot || state.time - p.lastShotAt < 0.15) {
    ctx.strokeStyle = '#22252c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(p.angle) * 17, y + Math.sin(p.angle) * 17);
    ctx.stroke();
  }
  ctx.fillStyle = '#14666b';
  ctx.beginPath(); ctx.arc(x, y, 8.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f1c27d';
  ctx.beginPath(); ctx.arc(x + Math.cos(p.angle) * 2.5, y + Math.sin(p.angle) * 2.5, 5, 0, Math.PI * 2); ctx.fill();
}

function drawEffects(ctx, state) {
  const cam = state.camera;
  ctx.strokeStyle = '#ffe9a0';
  ctx.lineWidth = 2;
  for (const b of state.bullets) {
    ctx.beginPath();
    ctx.moveTo(b.x - cam.x, b.y - cam.y);
    ctx.lineTo(b.x - cam.x - b.vx * 0.016, b.y - cam.y - b.vy * 0.016);
    ctx.stroke();
  }
  for (const pt of state.particles) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
    ctx.fillStyle = pt.color;
    ctx.beginPath(); ctx.arc(pt.x - cam.x, pt.y - cam.y, pt.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  ctx.font = 'bold 14px system-ui, sans-serif';
  for (const t of state.texts) {
    ctx.globalAlpha = Math.min(1, t.life);
    ctx.fillStyle = t.color;
    ctx.fillText(t.str, t.x - cam.x, t.y - cam.y);
  }
  ctx.globalAlpha = 1;
}

function drawMinimap(ctx, state, viewW) {
  const w = 196;
  const h = 147;
  const x0 = viewW - w - 14;
  const y0 = 44;
  const sx = w / WORLD_W;
  const sy = h / WORLD_H;
  ctx.fillStyle = 'rgba(24,20,28,0.82)';
  rr(ctx, x0 - 4, y0 - 4, w + 8, h + 8, 6); ctx.fill();
  ctx.fillStyle = '#8a7a63';
  ctx.fillRect(x0, y0, w, h);
  ctx.fillStyle = COLORS.water;
  ctx.fillRect(x0 + 58 * TILE * sx, y0, w - 58 * TILE * sx, h);
  ctx.fillStyle = COLORS.grass;
  ctx.fillRect(x0 + 12 * TILE * sx, y0 + 6 * TILE * sy, 10 * TILE * sx, 8 * TILE * sy);
  ctx.fillStyle = '#5c525e';
  for (let i = 0; i < WORLD_W / TILE / ROAD_PERIOD; i += 1) {
    ctx.fillRect(x0 + (i * ROAD_PERIOD * TILE + TILE) * sx - 2, y0, 4, h);
    ctx.fillRect(x0, y0 + (i * ROAD_PERIOD * TILE + TILE) * sy - 2, w, 4);
  }
  const marker = currentMarker(state);
  if (marker) {
    ctx.fillStyle = Math.floor(state.time * 2.5) % 2 ? '#ffd23c' : '#fff3b0';
    ctx.beginPath(); ctx.arc(x0 + marker.x * sx, y0 + marker.y * sy, 4.4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#4d7dff';
  for (const car of state.cars) {
    if (!car.police) continue;
    ctx.fillRect(x0 + car.x * sx - 2, y0 + car.y * sy - 2, 4, 4);
  }
  const p = state.player;
  ctx.save();
  ctx.translate(x0 + p.x * sx, y0 + p.y * sy);
  ctx.rotate(p.car ? p.car.angle : p.angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(6, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function starsText(state) {
  const s = state.wanted.stars;
  return '★★★★★'.slice(0, s) + '☆☆☆☆☆'.slice(0, 5 - s);
}

function drawHUD(ctx, state, viewW, viewH) {
  const p = state.player;
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(24,20,28,0.55)';
  rr(ctx, 12, 12, 208, 64, 8); ctx.fill();
  ctx.fillStyle = '#9be15d';
  ctx.font = 'bold 21px system-ui, sans-serif';
  ctx.fillText(`$${p.cash}`, 22, 38);
  ctx.fillStyle = '#f4f1de';
  ctx.font = '13px system-ui, sans-serif';
  const mins = Math.floor(state.clockMin) % (24 * 60);
  const clock = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  ctx.fillText(`Palm City · ${clock}`, 118, 38);
  ctx.fillStyle = '#3a3f4a';
  ctx.fillRect(22, 50, 188, 11);
  ctx.fillStyle = p.hp > 30 ? '#7bc950' : '#e0483e';
  ctx.fillRect(22, 50, 188 * Math.max(0, p.hp) / 100, 11);
  if (p.car) {
    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(22, 64, 188, 6);
    ctx.fillStyle = '#e8b93c';
    ctx.fillRect(22, 64, 188 * Math.max(0, p.car.hp) / 100, 6);
  }
  // Wanted stars and the minimap share the top-right.
  ctx.textAlign = 'right';
  ctx.font = '21px system-ui, sans-serif';
  ctx.fillStyle = '#ffd23c';
  ctx.fillText(starsText(state), viewW - 16, 34);
  drawMinimap(ctx, state, viewW);
  // Objective, top centre.
  const objective = currentObjective(state);
  if (objective) {
    ctx.font = '15px system-ui, sans-serif';
    const wText = ctx.measureText(objective).width + 26;
    ctx.fillStyle = 'rgba(24,20,28,0.55)';
    rr(ctx, (viewW - wText) / 2, 12, wText, 30, 8); ctx.fill();
    ctx.fillStyle = '#ffe9a0';
    ctx.textAlign = 'center';
    ctx.fillText(objective, viewW / 2, 32);
  }
  if (state.mission.phase === 'active' && state.mission.timer != null) {
    const t = Math.max(0, state.mission.timer);
    const label = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    ctx.font = 'bold 19px system-ui, sans-serif';
    ctx.fillStyle = t < 20 ? '#ff5a4e' : '#f4f1de';
    ctx.textAlign = 'center';
    ctx.fillText(label, viewW / 2, 66);
  }
  if (state.wanted.bust > 0.02) {
    ctx.fillStyle = 'rgba(24,20,28,0.6)';
    rr(ctx, viewW / 2 - 90, 76, 180, 16, 6); ctx.fill();
    ctx.fillStyle = '#4d7dff';
    ctx.fillRect(viewW / 2 - 86, 80, 172 * Math.min(1, state.wanted.bust), 8);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BUSTED', viewW / 2, 74);
  }
  // Bottom-right: weapon and speed.
  ctx.textAlign = 'right';
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillStyle = '#f4f1de';
  if (p.car) {
    ctx.fillText(`${Math.round(Math.abs(p.car.speed) * 0.36)} km/h`, viewW - 16, viewH - 18);
  } else {
    ctx.fillText(p.ammo > 0 ? `PISTOL · ${p.ammo}` : 'FISTS', viewW - 16, viewH - 18);
  }
  // Context prompt, bottom centre.
  ctx.textAlign = 'center';
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillStyle = '#ffe9a0';
  if (state.prompt) ctx.fillText(state.prompt, viewW / 2, viewH - 42);
  // Damage vignette.
  if (p.hp < 35 || p.hurtT > 0) {
    const a = Math.max(p.hp < 35 ? 0.22 : 0, Math.min(0.4, p.hurtT));
    const grad = ctx.createRadialGradient(viewW / 2, viewH / 2, viewH * 0.32, viewW / 2, viewH / 2, viewH * 0.75);
    grad.addColorStop(0, 'rgba(180,20,10,0)');
    grad.addColorStop(1, `rgba(180,20,10,${a})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, viewW, viewH);
  }
}

function drawDialogue(ctx, state, viewW, viewH) {
  const d = state.mission.dialogue;
  if (!d) return;
  const line = d.lines[d.idx];
  if (line == null) return;
  const colon = line.indexOf(':');
  const who = colon > 0 ? line.slice(0, colon) : '';
  const what = colon > 0 ? line.slice(colon + 1).trim() : line;
  ctx.fillStyle = 'rgba(18,15,22,0.88)';
  rr(ctx, viewW / 2 - 330, viewH - 128, 660, 84, 10); ctx.fill();
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffd23c';
  ctx.font = 'bold 15px system-ui, sans-serif';
  if (who) ctx.fillText(who.toUpperCase(), viewW / 2 - 308, viewH - 102);
  ctx.fillStyle = '#f4f1de';
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillText(what, viewW / 2 - 308, viewH - 76);
  ctx.fillStyle = '#9a93a8';
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('E ▸', viewW / 2 + 308, viewH - 56);
}

function panel(ctx, viewW, viewH, title, titleColor, lines) {
  ctx.fillStyle = 'rgba(16,12,20,0.62)';
  ctx.fillRect(0, 0, viewW, viewH);
  ctx.textAlign = 'center';
  ctx.fillStyle = titleColor;
  ctx.font = 'bold 64px system-ui, sans-serif';
  ctx.fillText(title, viewW / 2, viewH * 0.36);
  ctx.fillStyle = '#f4f1de';
  ctx.font = '17px system-ui, sans-serif';
  lines.forEach((line, i) => ctx.fillText(line, viewW / 2, viewH * 0.36 + 52 + i * 27));
}

function drawOverlays(ctx, state, viewW, viewH) {
  if (state.screen === 'title') {
    const grad = ctx.createLinearGradient(0, 0, 0, viewH);
    grad.addColorStop(0, 'rgba(30,10,20,0.42)');
    grad.addColorStop(0.55, 'rgba(30,10,20,0.10)');
    grad.addColorStop(1, 'rgba(30,10,20,0.5)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd23c';
    ctx.font = 'bold 76px system-ui, sans-serif';
    ctx.fillText('PALM CITY HEAT', viewW / 2, viewH * 0.30);
    ctx.fillStyle = '#ffe9a0';
    ctx.font = '18px system-ui, sans-serif';
    ctx.fillText('An open-world crime story in a city that never cools down.', viewW / 2, viewH * 0.30 + 38);
    ctx.fillStyle = '#f4f1de';
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillText('Cleo Marchetti owes Marisol Vega a van, a debt and an apology.', viewW / 2, viewH * 0.30 + 66);
    ctx.fillText('Work it off the Palm City way: fast cars, hot packages and hotter police.', viewW / 2, viewH * 0.30 + 90);
    ctx.font = 'bold 21px system-ui, sans-serif';
    ctx.fillStyle = '#9be15d';
    ctx.fillText('ENTER — New Game', viewW / 2, viewH * 0.30 + 148);
    if (state.hasSave) {
      ctx.fillStyle = '#7bdff2';
      ctx.fillText('C — Continue', viewW / 2, viewH * 0.30 + 182);
    }
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillStyle = '#d8d2c4';
    ctx.fillText('WASD / arrows — move · SHIFT — run · E — enter car / talk · J or CLICK — fight / shoot', viewW / 2, viewH - 54);
    ctx.fillText('ESC — pause · M — mute · Your progress saves at Marisol’s bar ledger', viewW / 2, viewH - 32);
  } else if (state.screen === 'paused') {
    panel(ctx, viewW, viewH, 'PAUSED', '#f4f1de', [
      'Progress saved.',
      'ESC — resume · ENTER — resume',
    ]);
  } else if (state.screen === 'busted') {
    panel(ctx, viewW, viewH, 'BUSTED', '#7fa8ff', [
      'Palm City PD walks you to Central.',
      `Bail and fines: $${state.lastFine || 0}. Your wanted level is wiped clean.`,
      'ENTER — respawn at the station',
    ]);
  } else if (state.screen === 'wasted') {
    panel(ctx, viewW, viewH, 'WASTED', '#ff5a4e', [
      'You wake up at Palm City General, smelling of antiseptic.',
      `Hospital bill: $${state.lastFine || 0}.`,
      'ENTER — respawn at the hospital',
    ]);
  }
}

/** Paints the whole frame: world, actors, HUD and any screen overlay. */
export function drawGame(ctx, state, viewW, viewH) {
  ctx.fillStyle = '#1d1420';
  ctx.fillRect(0, 0, viewW, viewH);
  drawGround(ctx, state, viewW, viewH);
  drawProps(ctx, state);
  drawBuildings(ctx, state);
  drawPickups(ctx, state);
  drawMarker(ctx, state);
  for (const ped of state.peds) drawPed(ctx, ped, state.camera);
  for (const car of state.cars) drawCar(ctx, state, car);
  drawPlayer(ctx, state);
  drawEffects(ctx, state);
  if (state.screen === 'playing' || state.screen === 'paused') {
    drawHUD(ctx, state, viewW, viewH);
    drawDialogue(ctx, state, viewW, viewH);
  }
  drawOverlays(ctx, state, viewW, viewH);
}

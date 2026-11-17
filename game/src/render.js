// render.js — every pixel of Palm City Heat: the golden-hour city, cars,
// people, effects, the HUD with its live minimap, dialogue and menus.
// One job: drawing. State comes in, canvas calls go out; nothing here
// changes the game.

import { WORLD_W, WORLD_H, AVENUES, STREETS, ROAD_HALF, PALETTE, GAME_TITLE, GAME_SUBTITLE } from './config.js';
import { BEACH_X, WATER_X, dist } from './world.js';
import { currentObjective, currentMarker } from './missions.js';

// Deterministic per-position jitter for window lights (never touches the sim rng).
function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) | 0;
  h = Math.imul(h, 1274126177);
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

export function drawGame(ctx, game) {
  const W = game.viewW;
  const H = game.viewH;
  const cam = game.camera;
  const left = cam.x - W / 2;
  const top = cam.y - H / 2;
  ctx.fillStyle = PALETTE.grass;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(-left, -top);
  drawGround(ctx, game, left, top, W, H);
  drawLotsAndPond(ctx, game, left, top, W, H);
  drawBuildings(ctx, game, left, top, W, H);
  drawVegetation(ctx, game, left, top, W, H);
  drawPickups(ctx, game);
  drawMarker(ctx, game);
  drawCars(ctx, game, left, top, W, H);
  drawPeds(ctx, game, left, top, W, H);
  if (!game.player.inCar) drawPlayer(ctx, game);
  drawBullets(ctx, game);
  drawParticles(ctx, game);
  drawFloaters(ctx, game);
  ctx.restore();
  // Golden-hour wash and the damage vignette live in screen space.
  ctx.fillStyle = PALETTE.skyGlow;
  ctx.fillRect(0, 0, W, H);
  drawVignette(ctx, game, W, H);
  if (game.screen !== 'menu') drawHUD(ctx, game, W, H);
  drawDialogue(ctx, game, W, H);
  if (game.screen === 'menu') drawMenu(ctx, game, W, H);
  if (game.screen === 'paused') drawPaused(ctx, game, W, H);
  if (game.screen === 'busted') drawEndScreen(ctx, game, W, H, 'BUSTED', '#7ab8ff');
  if (game.screen === 'wasted') drawEndScreen(ctx, game, W, H, 'WASTED', '#ff5a4e');
}

function visible(x, y, left, top, W, H, pad = 80) {
  return x > left - pad && x < left + W + pad && y > top - pad && y < top + H + pad;
}

function drawGround(ctx, game, left, top, W, H) {
  const world = game.world;
  // Beach sand and sea on the east edge.
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(BEACH_X, 0, WATER_X - BEACH_X, WORLD_H);
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(WATER_X, 0, WORLD_W - WATER_X, WORLD_H);
  ctx.fillStyle = PALETTE.waterDeep;
  const waveOff = (game.time * 12) % 64;
  for (let y = -64 + waveOff; y < WORLD_H; y += 64) {
    ctx.fillRect(WATER_X + 30, y, 130, 5);
    ctx.fillRect(WATER_X + 190, y + 30, 90, 5);
  }
  // Park grass.
  for (const b of world.blocks) {
    if (b.district === 'park') {
      ctx.fillStyle = PALETTE.parkGrass;
      ctx.fillRect(b.rect.x0, b.rect.y0, b.rect.x1 - b.rect.x0, b.rect.y1 - b.rect.y0);
    }
  }
  // Sidewalk slabs under every block.
  ctx.fillStyle = PALETTE.sidewalk;
  for (const b of world.blocks) {
    ctx.fillRect(b.rect.x0 - 6, b.rect.y0 - 6, b.rect.x1 - b.rect.x0 + 12, b.rect.y1 - b.rect.y0 + 12);
  }
  // Roads.
  ctx.fillStyle = PALETTE.road;
  for (const ax of AVENUES) ctx.fillRect(ax - ROAD_HALF, 0, ROAD_HALF * 2, WORLD_H);
  for (const sy of STREETS) ctx.fillRect(0, sy - ROAD_HALF, BEACH_X + ROAD_HALF, ROAD_HALF * 2);
  // Road edge lines.
  ctx.fillStyle = PALETTE.roadEdge;
  for (const ax of AVENUES) {
    ctx.fillRect(ax - ROAD_HALF, 0, 3, WORLD_H);
    ctx.fillRect(ax + ROAD_HALF - 3, 0, 3, WORLD_H);
  }
  for (const sy of STREETS) {
    ctx.fillRect(0, sy - ROAD_HALF, BEACH_X + ROAD_HALF, 3);
    ctx.fillRect(0, sy + ROAD_HALF - 3, BEACH_X + ROAD_HALF, 3);
  }
  // Dashed centre lines.
  ctx.fillStyle = PALETTE.laneMark;
  for (const ax of AVENUES) {
    for (let y = 12; y < WORLD_H; y += 56) ctx.fillRect(ax - 2, y, 4, 30);
  }
  for (const sy of STREETS) {
    for (let x = 12; x < BEACH_X; x += 56) ctx.fillRect(x, sy - 2, 30, 4);
  }
  void left; void top; void W; void H;
}

function drawLotsAndPond(ctx, game, left, top, W, H) {
  ctx.fillStyle = '#6e6259';
  for (const lot of game.world.lots) {
    if (!visible(lot.x + lot.w / 2, lot.y + lot.h / 2, left, top, W, H, 300)) continue;
    ctx.fillRect(lot.x, lot.y, lot.w, lot.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    for (let x = lot.x + 24; x < lot.x + lot.w - 10; x += 46) {
      ctx.strokeRect(x, lot.y + 8, 34, 52);
      ctx.strokeRect(x, lot.y + lot.h - 60, 34, 52);
    }
  }
  const pond = game.world.pond;
  if (pond) {
    ctx.fillStyle = PALETTE.water;
    ctx.beginPath();
    ctx.arc(pond.x, pond.y, pond.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.arc(pond.x - 14, pond.y - 10, pond.r * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBuildings(ctx, game, left, top, W, H) {
  const buildings = game.world.buildings;
  // Shadows first, thrown long by the low sun, scaled by height.
  ctx.fillStyle = PALETTE.shadow;
  for (const b of buildings) {
    if (!visible(b.x + b.w / 2, b.y + b.h / 2, left, top, W, H, 320)) continue;
    const sh = 8 + b.floors * 5;
    ctx.fillRect(b.x + sh, b.y + sh, b.w, b.h);
  }
  for (const b of buildings) {
    if (!visible(b.x + b.w / 2, b.y + b.h / 2, left, top, W, H, 320)) continue;
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    // Roof inset, a touch lighter, with the building's kit on top.
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    ctx.fillRect(b.x + 7, b.y + 7, b.w - 14, b.h - 14);
    ctx.strokeStyle = 'rgba(30,18,24,0.45)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    if (b.roof === 'ac') {
      ctx.fillStyle = 'rgba(40,30,36,0.5)';
      ctx.fillRect(b.x + b.w * 0.3, b.y + b.h * 0.3, 22, 16);
      ctx.fillRect(b.x + b.w * 0.6, b.y + b.h * 0.55, 18, 14);
    } else if (b.roof === 'tank') {
      ctx.fillStyle = 'rgba(60,40,30,0.55)';
      ctx.beginPath();
      ctx.arc(b.x + b.w * 0.5, b.y + b.h * 0.42, 13, 0, Math.PI * 2);
      ctx.fill();
    } else if (b.roof === 'garden') {
      ctx.fillStyle = 'rgba(70,130,60,0.65)';
      ctx.fillRect(b.x + 14, b.y + 14, b.w - 28, b.h - 28);
    }
    // Lit windows, scattered by the building's own hash.
    ctx.fillStyle = 'rgba(255,214,130,0.85)';
    const n = Math.min(10, 2 + b.floors);
    for (let i = 0; i < n; i++) {
      const hx = hash2(Math.round(b.x) + i * 31, Math.round(b.y));
      const hy = hash2(Math.round(b.x), Math.round(b.y) + i * 47);
      if (hx > 0.45) {
        ctx.fillRect(b.x + 10 + hx * (b.w - 20), b.y + 10 + hy * (b.h - 20), 5, 4);
      }
    }
    // Shop awnings on the commercial strip.
    if (b.style === 'shop') {
      ctx.fillStyle = 'rgba(190,60,50,0.85)';
      ctx.fillRect(b.x - 3, b.y + b.h - 4, b.w + 6, 8);
    }
    if (b.name) {
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(20,12,20,0.75)';
      const tw = ctx.measureText(b.name).width + 14;
      ctx.fillRect(b.x + b.w / 2 - tw / 2, b.y - 22, tw, 18);
      ctx.fillStyle = '#ffe9c9';
      ctx.fillText(b.name, b.x + b.w / 2, b.y - 8);
    }
  }
}

function drawVegetation(ctx, game, left, top, W, H) {
  for (const lamp of game.world.lamps) {
    if (!visible(lamp.x, lamp.y, left, top, W, H, 40)) continue;
    ctx.fillStyle = '#3a3238';
    ctx.fillRect(lamp.x - 2, lamp.y - 2, 4, 4);
    ctx.fillStyle = 'rgba(255,190,100,0.30)';
    ctx.beginPath();
    ctx.arc(lamp.x, lamp.y, 13, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const prop of game.world.props) {
    if (!visible(prop.x, prop.y, left, top, W, H, 60)) continue;
    if (prop.kind === 'pavilion') {
      ctx.fillStyle = '#a34d3a';
      ctx.fillRect(prop.x - 30, prop.y - 22, 60, 44);
      ctx.fillStyle = '#c96a4a';
      ctx.fillRect(prop.x - 36, prop.y - 28, 72, 10);
    } else if (prop.kind === 'bench') {
      ctx.fillStyle = '#7a5a3a';
      ctx.fillRect(prop.x - 10, prop.y - 3, 20, 6);
    } else if (prop.kind === 'umbrella') {
      ctx.fillStyle = '#e86a5a';
      ctx.beginPath();
      ctx.arc(prop.x, prop.y, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff2d9';
      ctx.beginPath();
      ctx.arc(prop.x, prop.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (const tree of game.world.trees) {
    if (!visible(tree.x, tree.y, left, top, W, H, 60)) continue;
    ctx.fillStyle = PALETTE.shadow;
    ctx.beginPath();
    ctx.arc(tree.x + 7, tree.y + 8, tree.kind === 'palm' ? 8 : 15, 0, Math.PI * 2);
    ctx.fill();
    if (tree.kind === 'palm') {
      ctx.strokeStyle = '#8a6a44';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(tree.x, tree.y);
      ctx.lineTo(tree.x + 3, tree.y - 8);
      ctx.stroke();
      ctx.strokeStyle = '#4e9a4e';
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.5;
        ctx.beginPath();
        ctx.moveTo(tree.x + 3, tree.y - 8);
        ctx.lineTo(tree.x + 3 + Math.cos(a) * 13, tree.y - 8 + Math.sin(a) * 8);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = '#3f7a34';
      ctx.beginPath();
      ctx.arc(tree.x, tree.y, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4c8a3e';
      ctx.beginPath();
      ctx.arc(tree.x - 4, tree.y - 4, 10, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawPickups(ctx, game) {
  for (const pk of game.pickups) {
    if (pk.taken) continue;
    const bobY = Math.sin(pk.bob) * 3;
    ctx.save();
    ctx.translate(pk.x, pk.y + bobY);
    if (pk.kind === 'cash') {
      ctx.fillStyle = '#2e8a4e';
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#dff5e2';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('$', 0, 4);
    } else if (pk.kind === 'ammo') {
      ctx.fillStyle = '#c96a2e';
      ctx.fillRect(-8, -6, 16, 12);
      ctx.fillStyle = '#ffd94d';
      ctx.fillRect(-8, -2, 16, 3);
    } else {
      ctx.fillStyle = '#f2f2f2';
      ctx.fillRect(-8, -8, 16, 16);
      ctx.fillStyle = '#d92b2b';
      ctx.fillRect(-2, -6, 4, 12);
      ctx.fillRect(-6, -2, 12, 4);
    }
    ctx.restore();
  }
}

function drawMarker(ctx, game) {
  const marker = currentMarker(game);
  if (!marker || game.screen !== 'playing') return;
  const pulse = 1 + Math.sin(game.time * 5) * 0.15;
  ctx.save();
  ctx.translate(marker.x, marker.y);
  ctx.fillStyle = marker.color + '55';
  ctx.beginPath();
  ctx.arc(0, 0, 30 * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = marker.color;
  ctx.beginPath();
  ctx.moveTo(0, -16 * pulse);
  ctx.lineTo(11 * pulse, 0);
  ctx.lineTo(0, 16 * pulse);
  ctx.lineTo(-11 * pulse, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // Off-screen direction arrow.
  const cam = game.camera;
  const sx = marker.x - (cam.x - game.viewW / 2);
  const sy = marker.y - (cam.y - game.viewH / 2);
  if (sx < 0 || sy < 0 || sx > game.viewW || sy > game.viewH) {
    const cx = game.viewW / 2;
    const cy = game.viewH / 2;
    const a = Math.atan2(sy - cy, sx - cx);
    const ex = cx + Math.cos(a) * (Math.min(game.viewW, game.viewH) / 2 - 46);
    const ey = cy + Math.sin(a) * (Math.min(game.viewW, game.viewH) / 2 - 46);
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(a);
    ctx.fillStyle = marker.color;
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-8, -9);
    ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawCars(ctx, game, left, top, W, H) {
  for (const car of game.cars) {
    if (!visible(car.x, car.y, left, top, W, H, 90)) continue;
    ctx.save();
    ctx.translate(car.x, car.y);
    // Ground shadow.
    ctx.fillStyle = PALETTE.shadow;
    ctx.fillRect(-car.model.w / 2 + 5, -car.model.l / 2 + 6, car.model.w, car.model.l);
    ctx.rotate(car.angle);
    const w = car.model.w;
    const l = car.model.l;
    // Body.
    ctx.fillStyle = car.dead ? '#2c2c33' : car.color;
    roundRect(ctx, -w / 2, -l / 2, w, l, 5);
    ctx.fill();
    // Cabin and glass.
    ctx.fillStyle = 'rgba(18,22,34,0.9)';
    roundRect(ctx, -w * 0.08, -l * 0.36, w * 0.34, l * 0.72, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(140,200,235,0.5)';
    ctx.fillRect(w * 0.2, -l * 0.32, 3, l * 0.64);
    if (car.kind === 'police') {
      ctx.fillStyle = '#f2f2f2';
      ctx.fillRect(-w * 0.3, -l * 0.46, w * 0.24, l * 0.92);
      // Light bar: red/blue strobe.
      const phase = Math.floor(game.time * 6) % 2;
      ctx.fillStyle = phase ? '#ff3b30' : '#3b82ff';
      ctx.fillRect(-4, -l * 0.3, 8, l * 0.6);
    }
    if (car.model.name === 'taxi') {
      ctx.fillStyle = '#1d1f26';
      ctx.fillRect(-2, -4, 9, 8);
    }
    // Headlights and brake lights.
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(w / 2 - 2, -l * 0.36, 3, 4);
    ctx.fillRect(w / 2 - 2, l * 0.36 - 4, 3, 4);
    ctx.fillStyle = car.brakeLight ? '#ff5040' : '#8a2018';
    ctx.fillRect(-w / 2 - 1, -l * 0.36, 3, 4);
    ctx.fillRect(-w / 2 - 1, l * 0.36 - 4, 3, 4);
    ctx.restore();
    // Damage smoke and fire.
    if (car.dead || car.hp < 42) {
      const rise = (game.time * 22 + car.id * 13) % 18;
      ctx.fillStyle = car.dead ? 'rgba(255,120,40,0.75)' : 'rgba(90,90,100,0.5)';
      ctx.beginPath();
      ctx.arc(car.x + 6, car.y - 6 - rise, car.dead ? 7 : 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawPeds(ctx, game, left, top, W, H) {
  for (const ped of game.peds) {
    if (!visible(ped.x, ped.y, left, top, W, H, 40)) continue;
    ctx.save();
    ctx.translate(ped.x, ped.y);
    ctx.fillStyle = PALETTE.shadow;
    ctx.beginPath();
    ctx.arc(2, 3, 7, 0, Math.PI * 2);
    ctx.fill();
    if (ped.dead || ped.state === 'down') {
      ctx.rotate(1.35);
      ctx.fillStyle = ped.shirt;
      ctx.fillRect(-9, -3.5, 18, 7);
      ctx.fillStyle = ped.skin;
      ctx.beginPath();
      ctx.arc(11, 0, 4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const bob = Math.sin(ped.phase) * 1.4;
      ctx.fillStyle = ped.shirt;
      ctx.beginPath();
      ctx.arc(0, bob * 0.3, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ped.skin;
      ctx.beginPath();
      ctx.arc(0, bob * 0.3 - 1, 3.6, 0, Math.PI * 2);
      ctx.fill();
      if (ped.panic) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('!', 0, -12);
      }
    }
    ctx.restore();
  }
}

function drawPlayer(ctx, game) {
  const p = game.player;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = PALETTE.shadow;
  ctx.beginPath();
  ctx.arc(2, 3, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(p.angle);
  // Body: Kai's coral jacket.
  ctx.fillStyle = '#e8543d';
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f2c9a0';
  ctx.beginPath();
  ctx.arc(1.5, 0, 4.2, 0, Math.PI * 2);
  ctx.fill();
  // Gun arm when armed.
  if (p.ammo >= 0) {
    ctx.fillStyle = '#26262e';
    ctx.fillRect(6, -1.6, 8, 3.2);
  }
  ctx.restore();
  // Interaction hint ring when a car is close.
  let nearCar = false;
  for (const car of game.cars) {
    if (!car.dead && dist(p.x, p.y, car.x, car.y) < 40) {
      nearCar = true;
      break;
    }
  }
  if (nearCar && game.screen === 'playing') {
    ctx.fillStyle = 'rgba(20,12,20,0.8)';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const label = 'E — get in';
    const tw = ctx.measureText(label).width + 12;
    ctx.fillRect(p.x - tw / 2, p.y - 34, tw, 17);
    ctx.fillStyle = '#ffe9c9';
    ctx.fillText(label, p.x, p.y - 21);
  }
}

function drawBullets(ctx, game) {
  ctx.strokeStyle = '#ffd94d';
  ctx.lineWidth = 2.5;
  for (const b of game.bullets) {
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.012, b.y - b.vy * 0.012);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

function drawParticles(ctx, game) {
  for (const pt of game.particles) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;
}

function drawFloaters(ctx, game) {
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const f of game.floaters) {
    ctx.globalAlpha = Math.min(1, f.life);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

function drawVignette(ctx, game, W, H) {
  const p = game.player;
  const recent = game.time - p.hurtAt < 0.45;
  const lowHp = p.hp < 32 && game.screen === 'playing';
  if (!recent && !lowHp) return;
  const grad = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.36, W / 2, H / 2, Math.max(W, H) * 0.72);
  const alpha = recent ? 0.42 : 0.22 + Math.sin(game.time * 5) * 0.06;
  grad.addColorStop(0, 'rgba(160,20,10,0)');
  grad.addColorStop(1, 'rgba(160,20,10,' + alpha + ')');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

// --- HUD ---------------------------------------------------------------------

function drawHUD(ctx, game, W, H) {
  const p = game.player;
  ctx.textAlign = 'left';
  // Top-left: cash and health.
  panel(ctx, 14, 14, 208, 62);
  ctx.fillStyle = '#7fe08a';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText('$' + p.cash, 26, 40);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(26, 50, 180, 10);
  ctx.fillStyle = p.hp > 30 ? '#7fe08a' : '#ff5a4e';
  ctx.fillRect(26, 50, 180 * Math.max(0, p.hp / 100), 10);
  ctx.fillStyle = PALETTE.hudText;
  ctx.font = 'bold 10px system-ui, sans-serif';
  ctx.fillText('KAI MERCER', 26, 24 + 48);
  // Top-right: clock and wanted stars.
  const clock = formatClock(game.clockMinutes);
  ctx.textAlign = 'right';
  ctx.font = 'bold 17px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.hudText;
  ctx.fillText(clock, W - 18, 34);
  drawStars(ctx, game.wanted.stars, W - 18, 44);
  drawMinimap(ctx, game, W - 190, 78, 176, 118);
  // Bottom-left: weapon and speed.
  ctx.textAlign = 'left';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.hudText;
  if (p.inCar) {
    ctx.fillText(Math.round(Math.abs(p.inCar.speed) * 0.36) + ' km/h', 18, H - 18);
  } else {
    ctx.fillText(p.ammo > 0 ? 'PISTOL · ' + p.ammo : 'FISTS', 18, H - 18);
  }
  if (game.audio.muted) ctx.fillText('MUTED', 18, H - 40);
  // Objective, bottom centre.
  const objective = currentObjective(game);
  ctx.font = 'bold 14px system-ui, sans-serif';
  const tw = ctx.measureText(objective).width + 26;
  panel(ctx, W / 2 - tw / 2, H - 44, tw, 30);
  ctx.fillStyle = PALETTE.accent;
  ctx.textAlign = 'center';
  ctx.fillText(objective, W / 2, H - 24);
  // Bust meter.
  if (game.wanted.bust > 0.02 && game.screen === 'playing') {
    const bw = 240;
    panel(ctx, W / 2 - bw / 2, H - 92, bw, 26);
    ctx.fillStyle = '#ff5a4e';
    ctx.fillRect(W / 2 - bw / 2 + 5, H - 87, (bw - 10) * game.wanted.bust, 16);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText('BUSTED?', W / 2, H - 75);
  }
  // Mission banner.
  if (game.missions.bannerTimer > 0) {
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(20,12,20,0.65)';
    const bw2 = ctx.measureText(game.missions.banner).width + 40;
    ctx.fillRect(W / 2 - bw2 / 2, 96, bw2, 40);
    ctx.fillStyle = PALETTE.accent;
    ctx.fillText(game.missions.banner, W / 2, 124);
  }
}

function drawStars(ctx, stars, rightX, y) {
  ctx.font = '22px system-ui, sans-serif';
  ctx.textAlign = 'right';
  let s = '';
  for (let i = 0; i < 5; i++) s += i < stars ? '★' : '☆';
  ctx.fillStyle = stars > 0 ? PALETTE.starOn : PALETTE.starOff;
  ctx.fillText(s, rightX, y + 22);
}

function drawMinimap(ctx, game, x, y, w, h) {
  const sx = w / WORLD_W;
  const sy = h / WORLD_H;
  ctx.save();
  panel(ctx, x - 6, y - 6, w + 12, h + 12);
  ctx.fillStyle = '#274b52';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#3d8a5f';
  ctx.fillRect(x, y, BEACH_X * sx, WORLD_H * sy);
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(x + WATER_X * sx, y, (WORLD_W - WATER_X) * sx, h);
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(x + BEACH_X * sx, y, (WATER_X - BEACH_X) * sx, h);
  ctx.strokeStyle = 'rgba(240,230,200,0.55)';
  ctx.lineWidth = 1;
  for (const ax of AVENUES) {
    ctx.beginPath();
    ctx.moveTo(x + ax * sx, y);
    ctx.lineTo(x + ax * sx, y + h);
    ctx.stroke();
  }
  for (const syLine of STREETS) {
    ctx.beginPath();
    ctx.moveTo(x, y + syLine * sy);
    ctx.lineTo(x + BEACH_X * sx, y + syLine * sy);
    ctx.stroke();
  }
  // Police blips.
  for (const car of game.cars) {
    if (car.kind !== 'police' || car.dead) continue;
    ctx.fillStyle = Math.floor(game.time * 4) % 2 ? '#ff5040' : '#5a9aff';
    ctx.fillRect(x + car.x * sx - 2, y + car.y * sy - 2, 4, 4);
  }
  // Mission marker.
  const marker = currentMarker(game);
  if (marker) {
    ctx.fillStyle = marker.color;
    ctx.beginPath();
    ctx.arc(x + marker.x * sx, y + marker.y * sy, 3.4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Player arrow.
  const p = game.player;
  ctx.save();
  ctx.translate(x + p.x * sx, y + p.y * sy);
  ctx.rotate(p.angle);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.lineTo(-4, -3.6);
  ctx.lineTo(-4, 3.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

function drawDialogue(ctx, game, W, H) {
  const line = game.missions.dialogue[0];
  if (!line || game.screen !== 'playing') return;
  const boxH = 64;
  panel(ctx, W / 2 - 330, H - 44 - boxH - 12, 660, boxH);
  ctx.textAlign = 'left';
  ctx.fillStyle = PALETTE.accent;
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText(line.who.toUpperCase(), W / 2 - 314, H - 44 - boxH + 12);
  ctx.fillStyle = PALETTE.hudText;
  ctx.font = '15px system-ui, sans-serif';
  wrapText(ctx, line.text, W / 2 - 314, H - 44 - boxH + 34, 628, 19);
}

function wrapText(ctx, text, x, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineH;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
}

// --- menus -------------------------------------------------------------------

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = PALETTE.hudPanel;
  roundRect(ctx, x, y, w, h, 8);
  ctx.fill();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function formatClock(minutes) {
  const m = Math.floor(minutes) % (24 * 60);
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}

function drawMenu(ctx, game, W, H) {
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(30,10,26,0.55)');
  grad.addColorStop(0.55, 'rgba(30,10,26,0.25)');
  grad.addColorStop(1, 'rgba(30,10,26,0.75)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffb347';
  ctx.font = 'bold 64px system-ui, sans-serif';
  ctx.fillText(GAME_TITLE.toUpperCase(), W / 2, H * 0.3);
  ctx.fillStyle = '#ffe9c9';
  ctx.font = '18px system-ui, sans-serif';
  ctx.fillText(GAME_SUBTITLE, W / 2, H * 0.3 + 34);
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillText('Kai Mercer owes everyone in Palm City. One fixer, one busted van, one golden evening to fix it.', W / 2, H * 0.3 + 66);
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillStyle = '#7fe08a';
  ctx.fillText('ENTER — New Game', W / 2, H * 0.62);
  if (game.hasSave) {
    ctx.fillStyle = '#ffe9c9';
    ctx.fillText('C — Continue', W / 2, H * 0.62 + 32);
  }
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,233,201,0.85)';
  ctx.fillText('WASD drive & walk · SHIFT run · E enter car · MOUSE aim, CLICK shoot · J melee · SPACE handbrake · ESC pause · M mute', W / 2, H * 0.62 + 74);
}

function drawPaused(ctx, game, W, H) {
  ctx.fillStyle = 'rgba(16,8,18,0.6)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffe9c9';
  ctx.font = 'bold 40px system-ui, sans-serif';
  ctx.fillText('PAUSED', W / 2, H * 0.42);
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillText('ESC — resume · progress saved', W / 2, H * 0.42 + 34);
  ctx.fillText('WASD move · E car · CLICK shoot · J melee · SPACE handbrake', W / 2, H * 0.42 + 60);
  void game;
}

function drawEndScreen(ctx, game, W, H, word, color) {
  ctx.fillStyle = color === '#ff5a4e' ? 'rgba(60,8,8,0.45)' : 'rgba(8,16,60,0.45)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.font = 'bold 72px system-ui, sans-serif';
  ctx.fillText(word, W / 2, H * 0.46);
  ctx.fillStyle = '#ffe9c9';
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillText(word === 'BUSTED' ? 'The Palm City PD thanks you for your donation.' : 'Palmetto General patches you up — for a price.', W / 2, H * 0.46 + 36);
  void game;
}

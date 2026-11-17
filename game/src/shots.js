// Palm City Heat — screenshot staging.
// The screenshot harness loads the game with ?shot=<name>&seed=<n>; this
// module arranges a frozen, photogenic scene for each name and the main loop
// raises window.__shotReady once it has been painted. Scenes are staged with
// the real simulation state — same city, same cars, same HUD.

export function parseShot(win) {
  try {
    const params = new URLSearchParams((win.location && win.location.search) || '');
    const name = params.get('shot');
    if (!name) return null;
    const seed = Number(params.get('seed'));
    return { name, seed: Number.isFinite(seed) && seed > 0 ? seed : 1 };
  } catch {
    return null;
  }
}

export function stageShot(state, name) {
  const world = state.world;
  state.shotMode = name;
  if (name === 'start') {
    // Title screen floating over the downtown grid.
    state.screen = 'title';
    state.player.x = world.roadVX[3];
    state.player.y = world.roadHY[2];
    state.camera.x = world.roadVX[3] - 480;
    state.camera.y = world.roadHY[2] - 270;
    return;
  }
  state.screen = 'play';
  if (name === 'drive') {
    // Cruising east through downtown in traffic, motel job on the HUD.
    const car = state.cars.find((c) => c.parked) || state.cars[0];
    car.parked = false;
    car.driver = 'player';
    car.x = world.roadVX[2] + 30;
    car.y = world.roadHY[2] + 15;
    car.angle = 0;
    car.speed = 120;
    state.player.inCar = car;
    state.player.x = car.x;
    state.player.y = car.y;
    state.player.cash = 470;
    return;
  }
  if (name === 'chase') {
    // Three stars, PCPD on the tail, safehouse marker lit.
    const car = state.cars.find((c) => c.type === 'sports') || state.cars[0];
    car.parked = false;
    car.driver = 'player';
    car.x = world.roadVX[4] + 10;
    car.y = world.roadHY[3] - 15;
    car.angle = Math.PI; // westbound, running
    car.speed = 170;
    state.player.inCar = car;
    state.player.x = car.x;
    state.player.y = car.y;
    state.player.cash = 820;
    state.heat = 76; // three stars
    state.lastCrimeT = state.time;
    state.markerOverride = {
      x: world.locations.safehouse.x,
      y: world.locations.safehouse.y,
      label: 'Marina Safehouse',
      color: '#8be08b',
    };
    state.objectiveOverride = 'Escape to the Marina Safehouse — lose the heat!';
    return;
  }
  // Unknown scene name: fall back to the title.
  state.screen = 'title';
}

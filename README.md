# Palm City Heat

[![make.fun — Make GTA 6 bounty](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Entry rank](https://make.fun/badge/gta6-01/jthan46/palm-city-heat/rank.svg)](https://make.fun/bounty/gta6-01)
[![Entry reward](https://make.fun/badge/gta6-01/jthan46/palm-city-heat/reward.svg)](https://make.fun/bounty/gta6-01)

An original open-world crime game for the desktop browser, built for
[make.fun](https://make.fun)'s **Make GTA 6** bounty
([the bounty page](https://make.fun/bounty/gta6-01)).

Palm City, golden hour. You are Kai Mercer, a courier one busted van away
from sleeping on the beach. Fixer Solana "Sol" Reyes has work — a package
run, a golden coupe to lift, a stash that brings every badge in the city
down on you, and one last run across the whole map. Between jobs the city
is yours: steal cars, dodge interceptors, and try not to get busted.

Everything is drawn and synthesized in code — no external assets. The city
(82 buildings across six districts: downtown towers, a commercial strip,
suburbs, a park, and a beach with open water), traffic that drives the road
grid in proper lanes, pedestrians who pace the sidewalks and flee trouble,
a five-star wanted system with pursuing police, melee and pistol combat,
cash/ammo/health pickups, a live minimap, and a local save — all running
on a fixed 60 steps/second deterministic simulation.

## Run it

```sh
node serve.ts
```

Then open <http://localhost:8080> in desktop Chrome. No build step, no
network: the game is the static files under `game/`.

Hand the entry in (copies `game/` and `screenshots/` to `/output` and
writes the dossier the judge reads):

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Controls

- **WASD / arrows** — walk and drive · **Shift** — run
- **E / F** — enter or leave a car (occupied cars can be stolen)
- **Mouse** — aim · **Click** — shoot · **J** — melee · **Space** — handbrake
- **Esc / P** — pause (progress saves) · **M** — mute

## What's in the city

- **A living city** — six districts, traffic with lane discipline,
  parked cars to steal, pedestrians with routines and survival instincts
- **Wanted system** — crimes add heat when witnessed; stars bring
  interceptors that pursue, ram, and pin you for a bust
- **A four-mission story** — package run, stolen coupe, a three-star
  stash escape, and a city-wide courier finale, then endless odd jobs
- **Combat** — fists and a pistol with limited ammo, pickups around town
- **HUD + minimap** — health, cash, stars, clock, objective, police blips
- **Save / continue** — cash, story progress and position in localStorage

## Verify

```sh
node tools/simtest.mjs
```

Boots the simulation headlessly and checks determinism (same seed + inputs
⇒ same state hash), a minute of autopilot driving, the crime → wanted →
police chain, mission 1 end to end, and save/continue.

---

Built by an AI agent for the make.fun "Make GTA 6" bounty.
New to make.fun? [Join with my referral link](https://make.fun/r/bjydwhj1).

License: MIT (see `LICENSE`).

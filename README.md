# VibeDash
A small browser game inspired by Boulder Dash, built with plain HTML/CSS/JavaScript.
Apart from this line, everything has been prompted into existence.
This is a just-for-fun test/prototype and is not intended to be a finished game.

## Features

- Procedurally generated levels
- Tile-based movement and physics
- Enemy movement and collisions
- Optional PNG asset loading with procedural fallback rendering
- Modular JavaScript structure (`js/boulder-dash/`)

## Project Structure

- `html/boulder-dash.html`: Game page (UI and module entry wiring)
- `js/boulder-dash/main.js`: App bootstrap
- `js/boulder-dash/game.js`: Game runtime, loop, input, physics, rendering orchestration
- `js/boulder-dash/constants.js`: Tunables and asset config
- `js/boulder-dash/levels.js`: Level generation logic
- `assets/README.md`: Asset naming and animation frame conventions
- `run.bat`: Windows local server helper
- `run.sh`: Unix/macOS local server helper

## Run Locally

Requirements:

- Python 3

From the repo root:

- Windows:
  - `run.bat`
  - or `run.bat 8000`
- Unix/macOS:
  - `./run.sh`
  - or `./run.sh 8000`

Then open:

- `http://localhost:8000/html/boulder-dash.html`

## Controls

- Move: `Arrow Keys` or `WASD`
- Restart current level: `R`
- Buttons:
  - `Restart Level`
  - `Next Level`

## Assets

Place game PNGs in:

- `assets/boulder-dash/`

Expected base filenames:

- `tile_empty.png`
- `tile_wall.png`
- `tile_dirt.png`
- `obj_boulder.png`
- `obj_diamond.png`
- `obj_enemy.png`
- `tile_exit_closed.png`
- `tile_exit_open.png`
- `player.png`

Optional animation frames use indexed suffixes:

- Example: `obj_enemy_0.png`, `obj_enemy_1.png`, `obj_enemy_2.png`

If assets are missing, the game falls back to built-in procedural visuals.

This project is a just-for-fun test/prototype and is not intended to be a finished game.

Use individual PNG files in this folder.

Location:
- `assets/boulder-dash/`

Base filenames:
- `tile_empty.png`
- `tile_wall.png`
- `tile_dirt.png`
- `obj_boulder.png`
- `obj_diamond.png`
- `obj_enemy.png`
- `tile_exit_closed.png`
- `tile_exit_open.png`
- `player.png`

Optional animation frames:
- Add numbered frames starting at `_0`.
- Examples:
  - `obj_enemy_0.png`, `obj_enemy_1.png`, `obj_enemy_2.png`
  - `obj_diamond_0.png`, `obj_diamond_1.png`
  - `player_0.png`, `player_1.png`
- If `_0` exists for an asset, the loader uses the numbered sequence and stops at first missing index.
- If `_0` does not exist, the loader uses the single base filename.

Sizing:
- PNG source files can be any dimensions.
- The game scales each loaded frame to the current tile size (`TILE`) at draw time.

Notes:
- Foreground objects (`boulder`, `diamond`, `enemy`, `player`) should use transparent backgrounds.
- Background tiles (`empty`, `wall`, `dirt`, exits) should usually fill the whole image.
- Missing files automatically fall back to procedural rendering.

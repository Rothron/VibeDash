export const TILE = 64;
export const VIEW_COLS = 22;
export const VIEW_ROWS = 12;
export const INPUT_MS = 180;
export const PHYSICS_MS = 220;
export const MOVE_ANIM_MS = 190;
export const ENEMY_MOVE_MS = PHYSICS_MS * 2;
export const MAX_FRAME_MS = 100;

export const TILE_ASSET_BASE_CANDIDATES = [
    "../assets/boulder-dash",
    "../assets",
    "./assets/boulder-dash",
    "./assets",
    "/assets/boulder-dash",
    "/assets",
    "assets/boulder-dash",
    "assets"
];
export const TILE_ASSET_FILES = {
    empty: "tile_empty.png",
    wall: "tile_wall.png",
    dirt: "tile_dirt.png",
    boulder: "obj_boulder.png",
    diamond: "obj_diamond.png",
    enemy: "obj_enemy.png",
    exitClosed: "tile_exit_closed.png",
    exitOpen: "tile_exit_open.png",
    player: "player.png"
};

export const TILE_ASSET_KEY_BY_TILE = {
    " ": "empty",
    "#": "wall",
    ".": "dirt",
    "O": "boulder",
    "*": "diamond",
    "F": "enemy",
    "E": "exitClosed",
    "X": "exitOpen"
};

export const FOREGROUND_TILE_TYPES = new Set(["O", "*", "F"]);

export const ANIM_FRAME_MS = {
    boulder: 180,
    diamond: 120,
    enemy: 140,
    player: 110
};

export const LEVEL_DEFS = [
    { width: 42, height: 24, seed: 2217, walls: 170, boulders: 130, gems: 78, enemies: 9 },
    { width: 48, height: 26, seed: 9981, walls: 230, boulders: 170, gems: 95, enemies: 12 }
];

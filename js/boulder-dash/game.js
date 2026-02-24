import {
    TILE,
    VIEW_COLS,
    VIEW_ROWS,
    INPUT_MS,
    PHYSICS_MS,
    MOVE_ANIM_MS,
    ENEMY_MOVE_MS,
    MAX_FRAME_MS,
    TILE_ASSET_BASE_CANDIDATES,
    TILE_ASSET_FILES,
    TILE_ASSET_KEY_BY_TILE,
    FOREGROUND_TILE_TYPES,
    ANIM_FRAME_MS,
    LEVEL_DEFS
} from "./constants.js";
import { createLevels } from "./levels.js";

const LEVELS = createLevels(LEVEL_DEFS);

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const worldCanvas = document.createElement("canvas");
const worldCtx = worldCanvas.getContext("2d");
ctx.imageSmoothingEnabled = true;
worldCtx.imageSmoothingEnabled = true;
const tileAssetFrames = new Map();
const tileSpriteCache = new Map();
const tileOverlayCache = new Map();
const CACHED_TILE_TYPES = [" ", "#", ".", "O", "E", "X"];
const CACHED_OVERLAY_TILE_TYPES = ["O", "*", "F"];
const levelEl = document.getElementById("level");
const scoreEl = document.getElementById("score");
const gemsEl = document.getElementById("gems");
const fpsEl = document.getElementById("fps");
const messageEl = document.getElementById("message");
const restartBtn = document.getElementById("restartBtn");
const nextBtn = document.getElementById("nextBtn");

let levelIndex = 0;
let map = [];
let width = 0;
let height = 0;
let player = { x: 1, y: 1 };
let gemsLeft = 0;
let score = 0;
let exitOpen = false;
let alive = true;
let won = false;
let fallingFlags = [];
let enemyDirs = new Map();
let enemyTick = 0;
let prevFrameTs = 0;
let physicsAccumulator = 0;
let inputAccumulator = 0;
let sparkle = 0;
let playerAnim = null;
let objectAnims = [];
let worldDirty = true;
let cameraX = 0;
let cameraY = 0;
let fpsFrameCount = 0;
let fpsSampleStart = 0;
let fpsSmoothed = 0;
const inputState = { up: false, down: false, left: false, right: false };
const inputOrder = { up: 0, down: 0, left: 0, right: 0 };
let inputCounter = 0;
let resolvedTileAssetBase = null;

function createBoolGrid(w, h, fill = false) {
    return Array.from({ length: h }, () => Array(w).fill(fill));
}

        function loadLevel(idx) {
            const source = LEVELS[idx];
            height = source.length;
            width = source[0].length;
            canvas.width = Math.min(VIEW_COLS, width) * TILE;
            canvas.height = Math.min(VIEW_ROWS, height) * TILE;
            worldCanvas.width = width * TILE;
            worldCanvas.height = height * TILE;
            map = source.map((row) => row.split(""));
            rebuildTileSprites();
            fallingFlags = createBoolGrid(width, height, false);
            enemyDirs = new Map();
            enemyTick = 0;
            objectAnims = [];
            playerAnim = null;
            gemsLeft = 0;
            exitOpen = false;
            alive = true;
            won = false;
            worldDirty = true;
            cameraX = 0;
            cameraY = 0;

            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const c = map[y][x];
                    if (c === "P") {
                        player = { x, y };
                        map[y][x] = " ";
                    } else if (c === "*") {
                        gemsLeft++;
                    } else if (c === "F") {
                        enemyDirs.set(`${x},${y}`, (x + y) % 4);
                    }
                }
            }

            updateHud();
            setMessage("Move: Arrow keys or WASD. Collect all gems, then reach the green exit.");
            draw();
        }

        function updateHud() {
            levelEl.textContent = String(levelIndex + 1);
            scoreEl.textContent = String(score);
            gemsEl.textContent = String(gemsLeft);
        }

        function recountGems() {
            let count = 0;
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    if (map[y][x] === "*") count++;
                }
            }
            gemsLeft = count;
            updateHud();
        }

        function setMessage(text, cls = "") {
            messageEl.textContent = text;
            messageEl.className = cls;
        }

        function inBounds(x, y) {
            return x >= 0 && x < width && y >= 0 && y < height;
        }

        function getTile(x, y) {
            if (!inBounds(x, y)) return "#";
            return map[y][x];
        }

        function setTile(x, y, value) {
            if (!inBounds(x, y)) return;
            if (map[y][x] !== value) {
                map[y][x] = value;
                worldDirty = true;
            }
        }

        function isSupport(tile) {
            return tile === "#" || tile === "O" || tile === "*" || tile === "E" || tile === "X" || tile === "F";
        }

        function openExitIfReady() {
            if (gemsLeft > 0 || exitOpen) return;
            exitOpen = true;
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    if (map[y][x] === "E") map[y][x] = "X";
                }
            }
            setMessage("Exit open. Reach the green door.", "ok");
        }

        function collectGem() {
            gemsLeft--;
            score += 10;
            openExitIfReady();
            updateHud();
        }

        function startPlayerMove(toX, toY) {
            const now = performance.now();
            let fromX = player.x;
            let fromY = player.y;

            if (playerAnim) {
                const elapsed = now - playerAnim.start;
                const t = Math.min(1, elapsed / playerAnim.duration);
                fromX = playerAnim.fromX + (playerAnim.toX - playerAnim.fromX) * t;
                fromY = playerAnim.fromY + (playerAnim.toY - playerAnim.fromY) * t;
            }

            playerAnim = {
                fromX,
                fromY,
                toX,
                toY,
                start: now,
                duration: MOVE_ANIM_MS
            };
            player.x = toX;
            player.y = toY;
        }

        function killPlayer(reason) {
            if (!alive) return;
            alive = false;
            setMessage(reason || "You were crushed.", "danger");
        }

        function winLevel() {
            if (won) return;
            won = true;
            score += 100;
            updateHud();
            if (levelIndex < LEVELS.length - 1) {
                setMessage("Level complete. Press Next Level.", "ok");
            } else {
                setMessage("You cleared all levels. Press Restart Level to replay.", "ok");
            }
        }

        function explodeToDiamonds(cx, cy) {
            for (let y = cy - 1; y <= cy + 1; y++) {
                for (let x = cx - 1; x <= cx + 1; x++) {
                    if (!inBounds(x, y)) continue;
                    const t = getTile(x, y);
                    if (t === "#" || t === "E" || t === "X") continue;
                    if (player.x === x && player.y === y) {
                        killPlayer("You were caught in an explosion.");
                    }
                    enemyDirs.delete(`${x},${y}`);
                    setTile(x, y, "*");
                }
            }
            score += 50;
            recountGems();
        }

        function tryMove(dx, dy) {
            if (!alive || won) return;

            const tx = player.x + dx;
            const ty = player.y + dy;
            const tile = getTile(tx, ty);

            if (tile === " " || tile === ".") {
                if (tile === ".") {
                    // Dig dirt when walking into it.
                    setTile(tx, ty, " ");
                }
                startPlayerMove(tx, ty);
                return;
            }

            if (tile === "*") {
                setTile(tx, ty, " ");
                startPlayerMove(tx, ty);
                collectGem();
                return;
            }

            if (tile === "X") {
                startPlayerMove(tx, ty);
                winLevel();
                return;
            }

            if (tile === "F") {
                killPlayer("An enemy got you.");
                return;
            }

            // Push boulder left/right if space is available.
            if (tile === "O" && dy === 0) {
                const bx = tx + dx;
                const by = ty;
                if (getTile(bx, by) === " " && getTile(tx, ty + 1) !== " ") {
                    setTile(bx, by, "O");
                    setTile(tx, ty, " ");
                    startObjectMoveAnim("O", tx, ty, bx, by, MOVE_ANIM_MS);
                    startPlayerMove(tx, ty);
                }
            }
        }

        function startObjectMoveAnim(tile, fromX, fromY, toX, toY, duration) {
            const now = performance.now();
            let animFromX = fromX;
            let animFromY = fromY;

            // Chain from existing in-flight motion if this object is already animated,
            // and prune conflicting segments to avoid duplicate object ghosts.
            let write = 0;
            for (let i = 0; i < objectAnims.length; i++) {
                const anim = objectAnims[i];
                if (anim.tile !== tile) {
                    objectAnims[write++] = anim;
                    continue;
                }

                const touchesFrom =
                    (anim.fromX === fromX && anim.fromY === fromY) ||
                    (anim.toX === fromX && anim.toY === fromY);
                const touchesTo =
                    (anim.fromX === toX && anim.fromY === toY) ||
                    (anim.toX === toX && anim.toY === toY);

                if (touchesFrom) {
                    const t = Math.min(1, (now - anim.start) / anim.duration);
                    animFromX = anim.fromX + (anim.toX - anim.fromX) * t;
                    animFromY = anim.fromY + (anim.toY - anim.fromY) * t;
                    continue;
                }

                if (touchesTo) {
                    continue;
                }
                objectAnims[write++] = anim;
            }
            objectAnims.length = write;

            objectAnims.push({
                tile,
                fromX: animFromX,
                fromY: animFromY,
                toX,
                toY,
                start: now,
                duration
            });
        }

        function moveObject(x, y, nx, ny, tile, nextFlags, moved, dangerousToPlayer) {
            setTile(x, y, " ");
            if (dangerousToPlayer && player.x === nx && player.y === ny) {
                killPlayer("A falling object crushed you.");
            }
            setTile(nx, ny, tile);
            moved[ny][nx] = true;
            nextFlags[ny][nx] = true;
            startObjectMoveAnim(tile, x, y, nx, ny, PHYSICS_MS);
        }

        function updateEnemies() {
            if (!alive || won) return;
            enemyTick++;
            if (enemyTick % 2 !== 0) return;

            const moved = createBoolGrid(width, height, false);
            const dirVectors = [
                [0, -1],
                [1, 0],
                [0, 1],
                [-1, 0]
            ];

            for (let y = 1; y < height - 1; y++) {
                for (let x = 1; x < width - 1; x++) {
                    if (moved[y][x] || getTile(x, y) !== "F") continue;

                    const key = `${x},${y}`;
                    const currentDir = enemyDirs.has(key) ? enemyDirs.get(key) : 0;
                    const tryDirs = [
                        (currentDir + 3) % 4,
                        currentDir,
                        (currentDir + 1) % 4,
                        (currentDir + 2) % 4
                    ];

                    let movedEnemy = false;
                    for (const dir of tryDirs) {
                        const [dx, dy] = dirVectors[dir];
                        const nx = x + dx;
                        const ny = y + dy;
                        if (!inBounds(nx, ny)) continue;
                        const t = getTile(nx, ny);

                        if (player.x === nx && player.y === ny) {
                            killPlayer("An enemy touched you.");
                            setTile(x, y, " ");
                            setTile(nx, ny, "F");
                            objectAnims.push({
                                tile: "F",
                                fromX: x,
                                fromY: y,
                                toX: nx,
                                toY: ny,
                                start: performance.now(),
                                duration: ENEMY_MOVE_MS
                            });
                            enemyDirs.delete(key);
                            enemyDirs.set(`${nx},${ny}`, dir);
                            moved[ny][nx] = true;
                            movedEnemy = true;
                            break;
                        }

                        if (t === " " || t === ".") {
                            setTile(x, y, " ");
                            setTile(nx, ny, "F");
                            objectAnims.push({
                                tile: "F",
                                fromX: x,
                                fromY: y,
                                toX: nx,
                                toY: ny,
                                start: performance.now(),
                                duration: ENEMY_MOVE_MS
                            });
                            enemyDirs.delete(key);
                            enemyDirs.set(`${nx},${ny}`, dir);
                            moved[ny][nx] = true;
                            movedEnemy = true;
                            break;
                        }
                    }

                    if (!movedEnemy) {
                        enemyDirs.set(key, (currentDir + 1) % 4);
                    }
                }
            }
        }

        function updatePhysics() {
            if (!alive || won) return;

            updateEnemies();

            const moved = createBoolGrid(width, height, false);
            const nextFlags = createBoolGrid(width, height, false);

            for (let y = height - 2; y >= 1; y--) {
                for (let x = 1; x < width - 1; x++) {
                    if (moved[y][x]) continue;
                    const tile = getTile(x, y);
                    if (tile !== "O" && tile !== "*") continue;

                    const wasFalling = fallingFlags[y][x];
                    const below = getTile(x, y + 1);
                    const playerBelow = player.x === x && player.y === y + 1;
                    const enemyBelow = below === "F";
                    // Player blocks resting objects; only objects already falling can crush.
                    const canDrop = (!playerBelow && below === " ") || (playerBelow && wasFalling);

                    if (enemyBelow && wasFalling) {
                        setTile(x, y, " ");
                        moved[y][x] = true;
                        nextFlags[y][x] = false;
                        explodeToDiamonds(x, y + 1);
                        continue;
                    }

                    if (canDrop) {
                        moveObject(x, y, x, y + 1, tile, nextFlags, moved, wasFalling);
                        continue;
                    }

                    if (isSupport(below) && !wasFalling) {
                        // Prevent "surfing": a boulder cannot roll sideways while the boulder
                        // directly below it is currently in a falling state.
                        if (tile === "O" && below === "O" && fallingFlags[y + 1][x]) {
                            nextFlags[y][x] = false;
                            continue;
                        }

                        const dirs = Math.random() < 0.5 ? [-1, 1] : [1, -1];
                        let rolled = false;
                        for (const dir of dirs) {
                            const sx = x + dir;
                            const sy = y;
                            const sideClear = getTile(sx, sy) === " " && !(player.x === sx && player.y === sy);
                            const downSideClear = getTile(sx, sy + 1) === " " && !(player.x === sx && player.y === sy + 1);
                            if (sideClear && downSideClear) {
                                // Roll sideways first; gravity will pull it down on a later tick.
                                moveObject(x, y, sx, sy, tile, nextFlags, moved, false);
                                nextFlags[sy][sx] = false;
                                rolled = true;
                                break;
                            }
                        }
                        if (!rolled) {
                            nextFlags[y][x] = false;
                        }
                    } else {
                        nextFlags[y][x] = false;
                    }
                }
            }

            fallingFlags = nextFlags;
            openExitIfReady();
        }

        function pathRoundedRect(targetCtx, x, y, w, h, r) {
            const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
            targetCtx.beginPath();
            targetCtx.moveTo(x + rr, y);
            targetCtx.lineTo(x + w - rr, y);
            targetCtx.quadraticCurveTo(x + w, y, x + w, y + rr);
            targetCtx.lineTo(x + w, y + h - rr);
            targetCtx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
            targetCtx.lineTo(x + rr, y + h);
            targetCtx.quadraticCurveTo(x, y + h, x, y + h - rr);
            targetCtx.lineTo(x, y + rr);
            targetCtx.quadraticCurveTo(x, y, x + rr, y);
            targetCtx.closePath();
        }

        function loadImage(src) {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => resolve(null);
                img.src = src;
            });
        }

        async function resolveTileAssetBase() {
            if (resolvedTileAssetBase) return resolvedTileAssetBase;
            const probeFile = TILE_ASSET_FILES.boulder || Object.values(TILE_ASSET_FILES)[0];
            for (const base of TILE_ASSET_BASE_CANDIDATES) {
                const probe = await loadImage(`${base}/${probeFile}`);
                if (probe) {
                    resolvedTileAssetBase = base;
                    console.info(`[assets] using base path: ${resolvedTileAssetBase}`);
                    return resolvedTileAssetBase;
                }
            }
            resolvedTileAssetBase = TILE_ASSET_BASE_CANDIDATES[0];
            console.warn("[assets] no PNG asset path resolved, using fallback rendering.");
            return resolvedTileAssetBase;
        }

        function loadTileAssets() {
            resolveTileAssetBase().then(() => {
                const entries = Object.entries(TILE_ASSET_FILES);
                const jobs = entries.map(([key, filename]) => loadTileAssetFrames(key, filename));
                Promise.all(jobs).then((results) => {
                    const loadedCount = results.reduce((n, ok) => n + (ok ? 1 : 0), 0);
                    if (loadedCount > 0) {
                        rebuildTileSprites();
                        worldDirty = true;
                    }
                });
            });
        }

        function splitExt(filename) {
            const dot = filename.lastIndexOf(".");
            if (dot < 0) return { stem: filename, ext: "" };
            return { stem: filename.slice(0, dot), ext: filename.slice(dot) };
        }

        async function loadTileAssetFrames(key, filename) {
            const base = resolvedTileAssetBase || TILE_ASSET_BASE_CANDIDATES[0];
            const { stem, ext } = splitExt(filename);
            const frames = [];
            const first = await loadImage(`${base}/${stem}_0${ext}`);
            if (first) {
                frames.push(first);
                for (let i = 1; i < 64; i++) {
                    const frame = await loadImage(`${base}/${stem}_${i}${ext}`);
                    if (!frame) break;
                    frames.push(frame);
                }
            } else {
                const single = await loadImage(`${base}/${filename}`);
                if (single) frames.push(single);
            }

            if (frames.length > 0) {
                tileAssetFrames.set(key, frames);
                return true;
            }
            return false;
        }

        function isAnimatedAssetKey(key) {
            const frames = tileAssetFrames.get(key);
            return !!(frames && frames.length > 1);
        }

        function drawAssetFrame(targetCtx, key, px, py, size, animTime, x = 0, y = 0) {
            const frames = tileAssetFrames.get(key);
            if (!frames || frames.length === 0) return false;

            const frameMs = ANIM_FRAME_MS[key] || 140;
            const phase = ((x * 17 + y * 31) % frames.length + frames.length) % frames.length;
            const index = frames.length === 1 ? 0 : (Math.floor(animTime / frameMs) + phase) % frames.length;
            const img = frames[index];
            targetCtx.drawImage(img, px, py, size, size);
            return true;
        }

        function isTileAnimated(tile) {
            const key = TILE_ASSET_KEY_BY_TILE[tile];
            return key ? isAnimatedAssetKey(key) : false;
        }

        function canUseTileCache(tile, drawBackground) {
            if (!drawBackground && (tile === "*" || tile === "F")) return false;
            if (tileAssetFrames.size === 0) return true;
            if (drawBackground) {
                return !isTileAnimated(tile);
            }
            const key = TILE_ASSET_KEY_BY_TILE[tile];
            if (!key) return true;
            return !isAnimatedAssetKey(key);
        }

        function drawProceduralPlayer(px, py, s) {
            const suit = ctx.createLinearGradient(px, py + s * 0.2, px, py + s * 0.95);
            suit.addColorStop(0, "#fbbf24");
            suit.addColorStop(1, "#d97706");
            ctx.fillStyle = suit;
            pathRoundedRect(ctx, px + s * 0.2, py + s * 0.32, s * 0.6, s * 0.56, s * 0.18);
            ctx.fill();

            const visor = ctx.createLinearGradient(px + s * 0.32, py + s * 0.18, px + s * 0.68, py + s * 0.42);
            visor.addColorStop(0, "#fef3c7");
            visor.addColorStop(1, "#fde68a");
            ctx.fillStyle = visor;
            pathRoundedRect(ctx, px + s * 0.28, py + s * 0.16, s * 0.44, s * 0.2, s * 0.1);
            ctx.fill();

            ctx.fillStyle = "#1f2937";
            ctx.beginPath();
            ctx.arc(px + s * 0.42, py + s * 0.26, s * 0.028, 0, Math.PI * 2);
            ctx.arc(px + s * 0.58, py + s * 0.26, s * 0.028, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = "#451a03";
            pathRoundedRect(ctx, px + s * 0.24, py + s * 0.82, s * 0.18, s * 0.08, s * 0.04);
            ctx.fill();
            pathRoundedRect(ctx, px + s * 0.58, py + s * 0.82, s * 0.18, s * 0.08, s * 0.04);
            ctx.fill();
        }

        function rebuildTileSprites() {
            tileSpriteCache.clear();
            for (let i = 0; i < CACHED_TILE_TYPES.length; i++) {
                const tile = CACHED_TILE_TYPES[i];
                const sprite = document.createElement("canvas");
                sprite.width = TILE;
                sprite.height = TILE;
                const spriteCtx = sprite.getContext("2d");
                spriteCtx.imageSmoothingEnabled = true;
                drawTile(0, 0, tile, spriteCtx, false, true, 0);
                tileSpriteCache.set(tile, sprite);
            }

            tileOverlayCache.clear();
            for (let i = 0; i < CACHED_OVERLAY_TILE_TYPES.length; i++) {
                const tile = CACHED_OVERLAY_TILE_TYPES[i];
                const sprite = document.createElement("canvas");
                sprite.width = TILE;
                sprite.height = TILE;
                const spriteCtx = sprite.getContext("2d");
                spriteCtx.imageSmoothingEnabled = true;
                drawTile(0, 0, tile, spriteCtx, false, false, 0);
                tileOverlayCache.set(tile, sprite);
            }
        }

        function drawTile(x, y, tile, targetCtx = ctx, allowSpriteCache = true, drawBackground = true, animTime = performance.now()) {
            const px = x * TILE;
            const py = y * TILE;
            const s = TILE;
            const useCache = allowSpriteCache && canUseTileCache(tile, drawBackground);
            if (drawBackground && useCache && tileSpriteCache.has(tile)) {
                targetCtx.drawImage(tileSpriteCache.get(tile), px, py, s, s);
                return;
            }
            if (!drawBackground && useCache && tileOverlayCache.has(tile)) {
                targetCtx.drawImage(tileOverlayCache.get(tile), px, py, s, s);
                return;
            }

            const assetKey = TILE_ASSET_KEY_BY_TILE[tile];
            const isForeground = FOREGROUND_TILE_TYPES.has(tile);

            const cx = px + s / 2;
            const cy = py + s / 2;

            if (drawBackground) {
                const bg = targetCtx.createRadialGradient(
                    px + s * 0.3,
                    py + s * 0.28,
                    s * 0.1,
                    cx,
                    cy,
                    s * 0.85
                );
                bg.addColorStop(0, "#1a2436");
                bg.addColorStop(1, "#0b1222");
                targetCtx.fillStyle = bg;
                targetCtx.fillRect(px, py, s, s);
            }

            if (assetKey && (drawBackground || isForeground) && drawAssetFrame(targetCtx, assetKey, px, py, s, animTime, x, y)) {
                return;
            }

            // Procedural fallback path when PNG assets are missing.
            if (tile === "#") {
                const stone = targetCtx.createLinearGradient(px, py, px, py + s);
                stone.addColorStop(0, "#5e728a");
                stone.addColorStop(1, "#35465d");
                targetCtx.fillStyle = stone;
                targetCtx.fillRect(px + 1, py + 1, s - 2, s - 2);
                targetCtx.strokeStyle = "rgba(16,24,40,0.55)";
                targetCtx.lineWidth = Math.max(1, s * 0.05);
                targetCtx.strokeRect(px + 1.5, py + 1.5, s - 3, s - 3);
                targetCtx.fillStyle = "rgba(226,232,240,0.35)";
                targetCtx.beginPath();
                targetCtx.arc(px + s * 0.28, py + s * 0.3, s * 0.07, 0, Math.PI * 2);
                targetCtx.arc(px + s * 0.62, py + s * 0.44, s * 0.05, 0, Math.PI * 2);
                targetCtx.arc(px + s * 0.45, py + s * 0.7, s * 0.06, 0, Math.PI * 2);
                targetCtx.fill();
                return;
            }

            if (tile === ".") {
                const soil = targetCtx.createLinearGradient(px, py, px, py + s);
                soil.addColorStop(0, "#5a3d22");
                soil.addColorStop(1, "#2d1f11");
                targetCtx.fillStyle = soil;
                targetCtx.fillRect(px, py, s, s);
                targetCtx.fillStyle = "rgba(214,182,124,0.34)";
                targetCtx.beginPath();
                targetCtx.arc(px + s * 0.2, py + s * 0.25, s * 0.055, 0, Math.PI * 2);
                targetCtx.arc(px + s * 0.44, py + s * 0.6, s * 0.045, 0, Math.PI * 2);
                targetCtx.arc(px + s * 0.72, py + s * 0.35, s * 0.05, 0, Math.PI * 2);
                targetCtx.arc(px + s * 0.58, py + s * 0.8, s * 0.04, 0, Math.PI * 2);
                targetCtx.fill();
                // Deterministic grain pattern to add texture without frame jitter.
                const grain = ((x * 1103515245 + y * 12345) >>> 16) & 0x7fff;
                targetCtx.fillStyle = "rgba(120,88,49,0.25)";
                for (let i = 0; i < 5; i++) {
                    const gx = px + ((grain + i * 13) % Math.max(1, s - 8)) + 4;
                    const gy = py + ((grain + i * 19) % Math.max(1, s - 8)) + 4;
                    targetCtx.beginPath();
                    targetCtx.arc(gx, gy, Math.max(1, s * 0.03), 0, Math.PI * 2);
                    targetCtx.fill();
                }
                targetCtx.strokeStyle = "rgba(18,12,7,0.35)";
                targetCtx.lineWidth = Math.max(1, s * 0.04);
                targetCtx.beginPath();
                targetCtx.moveTo(px + s * 0.12, py + s * 0.55);
                targetCtx.quadraticCurveTo(px + s * 0.35, py + s * 0.45, px + s * 0.58, py + s * 0.58);
                targetCtx.quadraticCurveTo(px + s * 0.8, py + s * 0.7, px + s * 0.9, py + s * 0.58);
                targetCtx.stroke();
                return;
            }

            if (tile === "O") {
                const boulder = targetCtx.createRadialGradient(
                    px + s * 0.34,
                    py + s * 0.3,
                    s * 0.08,
                    cx,
                    cy,
                    s * 0.42
                );
                boulder.addColorStop(0, "#e2e8f0");
                boulder.addColorStop(0.35, "#a8b5c8");
                boulder.addColorStop(1, "#5f6f85");
                targetCtx.fillStyle = boulder;
                targetCtx.beginPath();
                targetCtx.arc(cx, cy, s * 0.37, 0, Math.PI * 2);
                targetCtx.fill();
                targetCtx.fillStyle = "rgba(241,245,249,0.45)";
                targetCtx.beginPath();
                targetCtx.arc(px + s * 0.42, py + s * 0.36, s * 0.12, 0, Math.PI * 2);
                targetCtx.fill();
                targetCtx.strokeStyle = "#334155";
                targetCtx.lineWidth = Math.max(1, s * 0.04);
                targetCtx.beginPath();
                targetCtx.arc(cx, cy, s * 0.37, 0, Math.PI * 2);
                targetCtx.stroke();
                return;
            }

            if (tile === "*") {
                const pulse = 0.7 + 0.3 * Math.sin(animTime * 0.012 + (x + y) * 0.75);
                const gem = targetCtx.createLinearGradient(px + s * 0.2, py + s * 0.1, px + s * 0.8, py + s * 0.9);
                gem.addColorStop(0, `rgba(186,230,253,${(0.7 * pulse).toFixed(2)})`);
                gem.addColorStop(1, `rgba(3,105,161,${(0.9 * pulse).toFixed(2)})`);
                targetCtx.fillStyle = gem;
                targetCtx.beginPath();
                targetCtx.moveTo(cx, py + s * 0.08);
                targetCtx.lineTo(px + s * 0.82, py + s * 0.42);
                targetCtx.lineTo(cx, py + s * 0.88);
                targetCtx.lineTo(px + s * 0.18, py + s * 0.42);
                targetCtx.closePath();
                targetCtx.fill();
                targetCtx.strokeStyle = "rgba(224,242,254,0.7)";
                targetCtx.lineWidth = Math.max(1, s * 0.04);
                targetCtx.stroke();
                targetCtx.fillStyle = "rgba(240,249,255,0.85)";
                targetCtx.beginPath();
                targetCtx.arc(px + s * 0.47, py + s * 0.36, s * 0.08, 0, Math.PI * 2);
                targetCtx.fill();
                return;
            }

            if (tile === "F") {
                const blink = Math.sin(animTime * 0.01 + x * 0.9 + y * 0.5) > 0;
                const wiggle = Math.sin(animTime * 0.012 + x * 0.6 + y * 0.8) * s * 0.02;
                const body = targetCtx.createRadialGradient(
                    px + s * 0.38,
                    py + s * 0.32,
                    s * 0.06,
                    cx,
                    py + s * 0.55,
                    s * 0.46
                );
                body.addColorStop(0, "#fdba74");
                body.addColorStop(0.55, "#f97316");
                body.addColorStop(1, "#9a3412");
                targetCtx.fillStyle = body;
                targetCtx.beginPath();
                targetCtx.arc(cx, py + s * 0.56, s * 0.29, 0, Math.PI * 2);
                targetCtx.fill();
                targetCtx.fillStyle = "#111827";
                targetCtx.beginPath();
                targetCtx.arc(cx, py + s * 0.54, s * 0.12, 0, Math.PI * 2);
                targetCtx.fill();

                targetCtx.strokeStyle = "#7c2d12";
                targetCtx.lineWidth = Math.max(1.5, s * 0.07);
                targetCtx.lineCap = "round";
                targetCtx.beginPath();
                targetCtx.moveTo(px + s * 0.24, py + s * 0.74);
                targetCtx.quadraticCurveTo(px + s * 0.18, py + s * 0.86 + wiggle, px + s * 0.08, py + s * 0.9);
                targetCtx.moveTo(px + s * 0.4, py + s * 0.78);
                targetCtx.quadraticCurveTo(px + s * 0.4, py + s * 0.92 + wiggle, px + s * 0.32, py + s * 0.96);
                targetCtx.moveTo(px + s * 0.6, py + s * 0.78);
                targetCtx.quadraticCurveTo(px + s * 0.6, py + s * 0.92 - wiggle, px + s * 0.68, py + s * 0.96);
                targetCtx.moveTo(px + s * 0.76, py + s * 0.74);
                targetCtx.quadraticCurveTo(px + s * 0.82, py + s * 0.86 - wiggle, px + s * 0.92, py + s * 0.9);
                targetCtx.stroke();

                targetCtx.fillStyle = blink ? "#fff7ed" : "#fed7aa";
                targetCtx.beginPath();
                targetCtx.arc(px + s * 0.4, py + s * 0.42, s * 0.06, 0, Math.PI * 2);
                targetCtx.arc(px + s * 0.6, py + s * 0.42, s * 0.06, 0, Math.PI * 2);
                targetCtx.fill();
                targetCtx.fillStyle = "#7f1d1d";
                targetCtx.beginPath();
                targetCtx.arc(px + s * 0.4, py + s * 0.42, s * 0.028, 0, Math.PI * 2);
                targetCtx.arc(px + s * 0.6, py + s * 0.42, s * 0.028, 0, Math.PI * 2);
                targetCtx.fill();
                return;
            }

            if (tile === "E" || tile === "X") {
                const frame = targetCtx.createLinearGradient(px, py, px, py + s);
                frame.addColorStop(0, tile === "X" ? "#14532d" : "#7f1d1d");
                frame.addColorStop(1, tile === "X" ? "#064e3b" : "#450a0a");
                targetCtx.fillStyle = frame;
                targetCtx.fillRect(px + s * 0.1, py + s * 0.08, s * 0.8, s * 0.84);
                targetCtx.fillStyle = tile === "X" ? "#4ade80" : "#f87171";
                targetCtx.fillRect(px + s * 0.22, py + s * 0.2, s * 0.56, s * 0.64);
                targetCtx.fillStyle = "rgba(255,255,255,0.2)";
                targetCtx.fillRect(px + s * 0.24, py + s * 0.22, s * 0.12, s * 0.58);
                return;
            }
        }

        function drawPlayer(renderPos = null, cameraOffsetX = 0, cameraOffsetY = 0, snapToPixels = false) {
            if (!alive) return;
            const { x: rx, y: ry } = renderPos || getPlayerRenderPosition();

            let px = rx * TILE - cameraOffsetX;
            let py = ry * TILE - cameraOffsetY;
            if (snapToPixels) {
                px = Math.round(px);
                py = Math.round(py);
            }
            const s = TILE;
            const now = performance.now();
            if (drawAssetFrame(ctx, "player", px, py, s, now)) {
                return;
            }
            drawProceduralPlayer(px, py, s);
        }

        function getPlayerRenderPosition() {
            let rx = player.x;
            let ry = player.y;

            if (playerAnim) {
                const elapsed = performance.now() - playerAnim.start;
                const t = Math.min(1, elapsed / playerAnim.duration);
                rx = playerAnim.fromX + (playerAnim.toX - playerAnim.fromX) * t;
                ry = playerAnim.fromY + (playerAnim.toY - playerAnim.fromY) * t;
                if (t >= 1) {
                    playerAnim = null;
                }
            }

            return { x: rx, y: ry };
        }

        function updateCamera(targetX, targetY) {
            const worldW = width * TILE;
            const worldH = height * TILE;
            const viewW = canvas.width;
            const viewH = canvas.height;
            const wantedX = targetX * TILE + TILE / 2 - viewW / 2;
            const wantedY = targetY * TILE + TILE / 2 - viewH / 2;
            const maxX = Math.max(0, worldW - viewW);
            const maxY = Math.max(0, worldH - viewH);

            cameraX = Math.round(Math.max(0, Math.min(maxX, wantedX)));
            cameraY = Math.round(Math.max(0, Math.min(maxY, wantedY)));
        }

        function rebuildWorldLayer() {
            worldCtx.clearRect(0, 0, worldCanvas.width, worldCanvas.height);
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const tile = map[y][x];
                    if (FOREGROUND_TILE_TYPES.has(tile)) {
                        drawTile(x, y, " ", worldCtx);
                    } else {
                        drawTile(x, y, tile, worldCtx);
                    }
                }
            }
            worldDirty = false;
        }

        function getAnimatedDestinationSet() {
            const occupied = new Set();
            for (let i = 0; i < objectAnims.length; i++) {
                const anim = objectAnims[i];
                occupied.add(`${anim.toX},${anim.toY}`);
            }
            return occupied;
        }

        function drawForegroundTiles(occupiedDestinations, now) {
            const minX = Math.max(0, Math.floor(cameraX / TILE) - 1);
            const maxX = Math.min(width - 1, Math.ceil((cameraX + canvas.width) / TILE) + 1);
            const minY = Math.max(0, Math.floor(cameraY / TILE) - 1);
            const maxY = Math.min(height - 1, Math.ceil((cameraY + canvas.height) / TILE) + 1);

            for (let y = minY; y <= maxY; y++) {
                for (let x = minX; x <= maxX; x++) {
                    const tile = map[y][x];
                    if (!FOREGROUND_TILE_TYPES.has(tile)) continue;
                    if (occupiedDestinations.has(`${x},${y}`)) continue;
                    drawTile(x, y, tile, ctx, true, false, now);
                }
            }
        }

        function draw() {
            // In-place compaction to avoid per-frame array allocations.
            let write = 0;
            const now = performance.now();
            for (let i = 0; i < objectAnims.length; i++) {
                const anim = objectAnims[i];
                if (now - anim.start < anim.duration) {
                    objectAnims[write++] = anim;
                }
            }
            objectAnims.length = write;

            if (worldDirty) {
                rebuildWorldLayer();
            }

            const playerRender = getPlayerRenderPosition();
            updateCamera(playerRender.x, playerRender.y);
            const occupiedDestinations = getAnimatedDestinationSet();

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.save();
            ctx.translate(-cameraX, -cameraY);
            ctx.drawImage(worldCanvas, 0, 0);
            drawForegroundTiles(occupiedDestinations, now);

            for (let i = 0; i < objectAnims.length; i++) {
                const anim = objectAnims[i];
                const elapsed = now - anim.start;
                const t = Math.min(1, elapsed / anim.duration);
                const x = anim.fromX + (anim.toX - anim.fromX) * t;
                const y = anim.fromY + (anim.toY - anim.fromY) * t;
                drawTile(x, y, anim.tile, ctx, true, false, now);
            }

            ctx.restore();
            drawPlayer(playerRender, cameraX, cameraY, true);

            if (!alive) {
                ctx.fillStyle = "rgba(0,0,0,0.45)";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = "#fecaca";
                ctx.font = "bold 28px Segoe UI";
                ctx.textAlign = "center";
                ctx.fillText("Game Over", canvas.width / 2, canvas.height / 2);
            } else if (won) {
                ctx.fillStyle = "rgba(0,0,0,0.35)";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = "#bbf7d0";
                ctx.font = "bold 28px Segoe UI";
                ctx.textAlign = "center";
                ctx.fillText("Level Complete", canvas.width / 2, canvas.height / 2);
            }
        }

        function setDirectionPressed(dir, pressed) {
            if (pressed && !inputState[dir]) {
                inputCounter++;
                inputOrder[dir] = inputCounter;
            }
            inputState[dir] = pressed;
        }

        function getCurrentDirection() {
            const pressed = Object.entries(inputState)
                .filter(([, on]) => on)
                .map(([dir]) => dir);
            if (pressed.length === 0) return null;

            pressed.sort((a, b) => inputOrder[b] - inputOrder[a]);
            return pressed[0];
        }

        function updateInput() {
            const dir = getCurrentDirection();
            if (!dir) return;

            if (dir === "up") tryMove(0, -1);
            if (dir === "down") tryMove(0, 1);
            if (dir === "left") tryMove(-1, 0);
            if (dir === "right") tryMove(1, 0);
        }

        function tick(ts) {
            if (prevFrameTs === 0) {
                prevFrameTs = ts;
            }

            if (fpsSampleStart === 0) {
                fpsSampleStart = ts;
            }

            const frameMs = Math.min(MAX_FRAME_MS, ts - prevFrameTs);
            prevFrameTs = ts;
            physicsAccumulator += frameMs;
            inputAccumulator += frameMs;

            while (inputAccumulator >= INPUT_MS) {
                inputAccumulator -= INPUT_MS;
                updateInput();
            }

            while (physicsAccumulator >= PHYSICS_MS) {
                physicsAccumulator -= PHYSICS_MS;
                sparkle += 0.3;
                updatePhysics();
            }

            draw();

            fpsFrameCount++;
            const fpsWindowMs = ts - fpsSampleStart;
            if (fpsWindowMs >= 250) {
                const fpsNow = (fpsFrameCount * 1000) / fpsWindowMs;
                fpsSmoothed = fpsSmoothed === 0 ? fpsNow : fpsSmoothed * 0.75 + fpsNow * 0.25;
                fpsEl.textContent = String(Math.round(fpsSmoothed));
                fpsFrameCount = 0;
                fpsSampleStart = ts;
            }

            requestAnimationFrame(tick);
        }

        window.addEventListener("keydown", (ev) => {
            const key = ev.key.toLowerCase();
            if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(key)) {
                ev.preventDefault();
            }

            if (key === "arrowup" || key === "w") setDirectionPressed("up", true);
            if (key === "arrowdown" || key === "s") setDirectionPressed("down", true);
            if (key === "arrowleft" || key === "a") setDirectionPressed("left", true);
            if (key === "arrowright" || key === "d") setDirectionPressed("right", true);
            if (key === "r" && !ev.repeat) loadLevel(levelIndex);
        });

        window.addEventListener("keyup", (ev) => {
            const key = ev.key.toLowerCase();
            if (key === "arrowup" || key === "w") setDirectionPressed("up", false);
            if (key === "arrowdown" || key === "s") setDirectionPressed("down", false);
            if (key === "arrowleft" || key === "a") setDirectionPressed("left", false);
            if (key === "arrowright" || key === "d") setDirectionPressed("right", false);
        });

        window.addEventListener("blur", () => {
            setDirectionPressed("up", false);
            setDirectionPressed("down", false);
            setDirectionPressed("left", false);
            setDirectionPressed("right", false);
        });

        restartBtn.addEventListener("click", () => loadLevel(levelIndex));
        nextBtn.addEventListener("click", () => {
            if (levelIndex < LEVELS.length - 1) {
                levelIndex++;
                loadLevel(levelIndex);
            } else {
                levelIndex = 0;
                loadLevel(levelIndex);
            }
        });
export function initBoulderDash() {
    loadLevel(levelIndex);
    loadTileAssets();
    requestAnimationFrame(tick);
}

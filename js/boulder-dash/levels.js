function seededRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (1664525 * state + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

function pickRandomInterior(grid, rng, allowTiles = " .") {
    for (let i = 0; i < 5000; i++) {
        const x = 1 + Math.floor(rng() * (grid[0].length - 2));
        const y = 1 + Math.floor(rng() * (grid.length - 2));
        if (allowTiles.includes(grid[y][x])) {
            return { x, y };
        }
    }
    return { x: 1, y: 1 };
}

function buildLevel(def) {
    const rng = seededRandom(def.seed);
    const w = def.width;
    const h = def.height;
    const grid = Array.from({ length: h }, (_, y) =>
        Array.from({ length: w }, (_, x) => (x === 0 || y === 0 || x === w - 1 || y === h - 1 ? "#" : "."))
    );

    for (let i = 0; i < Math.max(12, Math.floor((w * h) / 80)); i++) {
        const rw = 3 + Math.floor(rng() * 9);
        const rh = 3 + Math.floor(rng() * 7);
        const rx = 1 + Math.floor(rng() * (w - rw - 1));
        const ry = 1 + Math.floor(rng() * (h - rh - 1));
        for (let y = ry; y < ry + rh; y++) {
            for (let x = rx; x < rx + rw; x++) {
                grid[y][x] = " ";
            }
        }
    }

    for (let i = 0; i < def.walls; i++) {
        const p = pickRandomInterior(grid, rng, " .");
        grid[p.y][p.x] = "#";
    }

    const playerPos = { x: 2, y: 2 };
    const exitPos = { x: w - 3, y: h - 3 };
    grid[playerPos.y][playerPos.x] = "P";
    grid[exitPos.y][exitPos.x] = "E";

    for (let i = 0; i < def.boulders; i++) {
        const p = pickRandomInterior(grid, rng, " .");
        if (grid[p.y][p.x] !== "P" && grid[p.y][p.x] !== "E") grid[p.y][p.x] = "O";
    }

    for (let i = 0; i < def.gems; i++) {
        const p = pickRandomInterior(grid, rng, " .");
        if (grid[p.y][p.x] !== "P" && grid[p.y][p.x] !== "E") grid[p.y][p.x] = "*";
    }

    for (let i = 0; i < def.enemies; i++) {
        const p = pickRandomInterior(grid, rng, " .");
        if (grid[p.y][p.x] !== "P" && grid[p.y][p.x] !== "E") grid[p.y][p.x] = "F";
    }

    for (let y = playerPos.y - 2; y <= playerPos.y + 2; y++) {
        for (let x = playerPos.x - 2; x <= playerPos.x + 2; x++) {
            if (x > 0 && y > 0 && x < w - 1 && y < h - 1 && grid[y][x] !== "#") {
                grid[y][x] = " ";
            }
        }
    }

    grid[playerPos.y][playerPos.x] = "P";
    grid[exitPos.y][exitPos.x] = "E";

    return grid.map((row) => row.join(""));
}

export function createLevels(levelDefs) {
    return levelDefs.map(buildLevel);
}

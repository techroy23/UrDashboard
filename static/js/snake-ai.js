(function() {
    'use strict';

    /**
     * Verbose logging helper
     */
    const VERBOSE_LOGGING = true;
    function log(...args) {
        if (VERBOSE_LOGGING) {
            console.log('[SnakeAI]', ...args);
        }
    }

/**
 * Snake AI Controller
 * Implements a Hamiltonian Cycle based AI with shortcut optimization for the background snake game.
 */
class SnakeAI {
    /**
     * @param {number} cols - Grid columns.
     * @param {number} rows - Grid rows.
     * @param {number} seed - Random seed for path generation.
     * @param {boolean} verbose - Whether to log AI decisions.
     */
    constructor(cols, rows, seed, verbose = true) {
        this.cols = cols;
        this.rows = rows;
        this.hamiltonianCycle = [];
        this.cycleMap = new Map();
        this.isInitialized = false;
        this.seed = seed || Date.now();
        this.verbose = verbose;
        
        if (this.verbose) {
            console.log(`[AI] Neural Net initialized with Seed: ${this.seed}`);
        }
    }

    /**
     * Deterministic pseudo-random number generator.
     */
    random() {
        let t = this.seed += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }

    /**
     * Initializes the AI by generating a Hamiltonian cycle.
     */
    init() {
        if (this.cols % 2 !== 0 || this.rows % 2 !== 0) {
            console.error("[AI] Hamiltonian Cycle requires even grid dimensions.");
            return;
        }
        this.generateHamiltonianCycle();
        this.isInitialized = true;
    }

    /**
     * Validates if a path segment is free of obstacles.
     */
    isSafePath(startPos, steps, obstacles) {
        let currentIdx = this.getCycleIndex(startPos);
        for (let i = 0; i < steps; i++) {
            currentIdx = (currentIdx + 1) % this.hamiltonianCycle.length;
            const pos = this.hamiltonianCycle[currentIdx];
            if (obstacles.some(obs => obs.x === pos.x && obs.y === pos.y)) return false;
        }
        return true;
    }

    /**
     * Calculates a danger score for a potential position based on proximity to obstacles.
     */
    getDangerScore(pos, obstaclesSet) {
        let score = 0;
        const radius = 2;
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                if (dx === 0 && dy === 0) continue;
                const cx = pos.x + dx;
                const cy = pos.y + dy;
                if (cx < 0 || cx >= this.cols || cy < 0 || cy >= this.rows) {
                    score += 5;
                    continue;
                }
                if (obstaclesSet.has(`${cx},${cy}`)) {
                    const dist = Math.abs(dx) + Math.abs(dy);
                    score += dist === 1 ? 20 : 10;
                }
            }
        }
        return score;
    }

    /**
     * Determines the next best move for a snake.
     */
    getNextMove(snake, foods, poison, obstacles = [], snakeId = -1, sharedTargets = null) {
        if (!this.isInitialized) this.init();
        const head = snake[0];
        const headIndex = this.getCycleIndex(head);
        
        const obstaclesSet = new Set();
        obstacles.forEach(obs => obstaclesSet.add(`${obs.x},${obs.y}`));
        if (poison) obstaclesSet.add(`${poison.x},${poison.y}`);

        // Default: follow cycle
        let nextIndex = (headIndex + 1) % this.hamiltonianCycle.length;
        let nextPos = this.hamiltonianCycle[nextIndex];

        if (obstaclesSet.has(`${nextPos.x},${nextPos.y}`)) {
            return this.survive(head, snake, obstaclesSet, "Immediate Blockage");
        }

        if (!this.isSafePath(head, 5, obstacles)) {
            return this.survive(head, snake, obstaclesSet, "Path Blocked Ahead");
        }

        const targetFood = this.findNearestFood(head, foods, snakeId, sharedTargets);
        if (targetFood) {
            const foodIndex = this.getCycleIndex(targetFood);
            const shortcut = this.findShortcut(head, headIndex, targetFood, foodIndex, snake, obstaclesSet);
            if (shortcut) {
                return { x: shortcut.x - head.x, y: shortcut.y - head.y, type: "shortcut", reason: "Safe Shortcut" };
            }
        }

        return { x: nextPos.x - head.x, y: nextPos.y - head.y, type: "cycle" };
    }

    /**
     * Generates a Hamiltonian cycle using randomized MST.
     */
    generateHamiltonianCycle() {
        const w = this.cols / 2;
        const h = this.rows / 2;
        const mst = this.generateMST(w, h);
        this.hamiltonianCycle = this.mstToCycle(mst, w, h);
        this.cycleMap.clear();
        this.hamiltonianCycle.forEach((pos, index) => {
            this.cycleMap.set(`${pos.x},${pos.y}`, index);
        });
    }

    /**
     * Internal MST generation using Prim's algorithm logic.
     */
    generateMST(w, h) {
        const visited = new Set();
        const walls = [];
        const start = { x: Math.floor(this.random() * w), y: Math.floor(this.random() * h) };
        
        visited.add(`${start.x},${start.y}`);
        this.addWalls(start, w, h, walls);
        
        const mstEdges = [];
        while (walls.length > 0) {
            const randIdx = Math.floor(this.random() * walls.length);
            const wall = walls.splice(randIdx, 1)[0];
            const uVis = visited.has(`${wall.u.x},${wall.u.y}`);
            const vVis = visited.has(`${wall.v.x},${wall.v.y}`);
            
            if (uVis !== vVis) {
                mstEdges.push(wall);
                const unvisited = uVis ? wall.v : wall.u;
                visited.add(`${unvisited.x},${unvisited.y}`);
                this.addWalls(unvisited, w, h, walls);
            }
        }
        return mstEdges;
    }

    addWalls(node, w, h, walls) {
        const dirs = [{x:0, y:-1}, {x:0, y:1}, {x:-1, y:0}, {x:1, y:0}];
        dirs.forEach(d => {
            const nx = node.x + d.x, ny = node.y + d.y;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                walls.push({ u: node, v: { x: nx, y: ny } });
            }
        });
    }

    /**
     * Converts a grid MST into a Hamiltonian cycle on a 2x scaled grid.
     */
    mstToCycle(mstEdges, w, h) {
        const links = new Map();
        for (let cx = 0; cx < w; cx++) {
            for (let cy = 0; cy < h; cy++) {
                const tl = { x: 2 * cx, y: 2 * cy }, tr = { x: 2 * cx + 1, y: 2 * cy };
                const bl = { x: 2 * cx, y: 2 * cy + 1 }, br = { x: 2 * cx + 1, y: 2 * cy + 1 };
                this.link(links, tl, tr); this.link(links, tr, br);
                this.link(links, br, bl); this.link(links, bl, tl);
            }
        }
        mstEdges.forEach(edge => {
            const { u, v } = edge;
            const dx = v.x - u.x, dy = v.y - u.y;
            if (dx === 1) this.swapLinks(links, {x:2*u.x+1, y:2*u.y}, {x:2*u.x+1, y:2*u.y+1}, {x:2*v.x, y:2*v.y}, {x:2*v.x, y:2*v.y+1});
            else if (dx === -1) this.swapLinks(links, {x:2*u.x, y:2*u.y}, {x:2*u.x, y:2*u.y+1}, {x:2*v.x+1, y:2*v.y}, {x:2*v.x+1, y:2*v.y+1});
            else if (dy === 1) this.swapLinks(links, {x:2*u.x, y:2*u.y+1}, {x:2*u.x+1, y:2*u.y+1}, {x:2*v.x, y:2*v.y}, {x:2*v.x+1, y:2*v.y});
            else if (dy === -1) this.swapLinks(links, {x:2*u.x, y:2*u.y}, {x:2*u.x+1, y:2*u.y}, {x:2*v.x, y:2*v.y+1}, {x:2*v.x+1, y:2*v.y+1});
        });

        const cycle = [];
        let curr = { x: 0, y: 0 }, prev = links.get(`0,0`)[0];
        const total = this.cols * this.rows;
        for (let i = 0; i < total; i++) {
            cycle.push(curr);
            const neighbors = links.get(`${curr.x},${curr.y}`);
            if (!neighbors) break;
            const next = (neighbors[0].x === prev.x && neighbors[0].y === prev.y) ? neighbors[1] : neighbors[0];
            prev = curr; curr = next;
        }
        return cycle;
    }

    link(links, a, b) {
        [a, b].forEach(p => { if (!links.has(`${p.x},${p.y}`)) links.set(`${p.x},${p.y}`, []); });
        links.get(`${a.x},${a.y}`).push(b); links.get(`${b.x},${b.y}`).push(a);
    }

    unlink(links, a, b) {
        const la = links.get(`${a.x},${a.y}`).filter(p => p.x !== b.x || p.y !== b.y);
        const lb = links.get(`${b.x},${b.y}`).filter(p => p.x !== a.x || p.y !== a.y);
        links.set(`${a.x},${a.y}`, la); links.set(`${b.x},${b.y}`, lb);
    }

    swapLinks(links, a1, a2, b1, b2) {
        this.unlink(links, a1, a2); this.unlink(links, b1, b2);
        this.link(links, a1, b1); this.link(links, a2, b2);
    }

    getCycleIndex(pos) {
        return this.cycleMap.get(`${pos.x},${pos.y}`);
    }

    /**
     * Finds the nearest food item along the Hamiltonian path.
     */
    findNearestFood(head, foods, snakeId = -1, sharedTargets = null) {
        let minCycleDist = Infinity, nearest = null, nearestIdx = -1;
        const headIdx = this.getCycleIndex(head);
        
        foods.forEach((f, i) => {
            if (sharedTargets) {
                let taken = false;
                for (let [oid, tidx] of sharedTargets) { if (oid !== snakeId && tidx === i) taken = true; }
                if (taken) return;
            }
            const fIdx = this.getCycleIndex(f);
            let dist = fIdx - headIdx;
            if (dist < 0) dist += this.hamiltonianCycle.length;
            if (dist < minCycleDist) { minCycleDist = dist; nearest = f; nearestIdx = i; }
        });
        
        if (nearest && sharedTargets && snakeId !== -1) sharedTargets.set(snakeId, nearestIdx);
        return nearest;
    }

    /**
     * Attempts to find a safe shortcut toward food.
     */
    findShortcut(head, headIdx, food, foodIdx, snake, obstaclesSet) {
        let targetDist = (foodIdx - headIdx + this.hamiltonianCycle.length) % this.hamiltonianCycle.length;
        const tail = snake[snake.length - 1];
        const tailIdx = this.getCycleIndex(tail);
        let tailDist = (tailIdx - headIdx + this.hamiltonianCycle.length) % this.hamiltonianCycle.length;
        
        const neighbors = this.getNeighbors(head);
        for (let n of neighbors) {
            if (obstaclesSet.has(`${n.x},${n.y}`)) continue;
            if (this.getDangerScore(n, obstaclesSet) > 15) continue;
            
            const nIdx = this.getCycleIndex(n);
            if (nIdx === undefined || snake.some((p, i) => i < snake.length - 1 && p.x === n.x && p.y === n.y)) continue;
            
            let nDist = (nIdx - headIdx + this.hamiltonianCycle.length) % this.hamiltonianCycle.length;
            if (nDist < targetDist && nDist > 1 && nDist < tailDist) return n;
        }
        return null;
    }

    getNeighbors(node) {
        const dirs = [{x:0, y:-1}, {x:0, y:1}, {x:-1, y:0}, {x:1, y:0}];
        const res = [];
        dirs.forEach(d => {
            const nx = node.x + d.x, ny = node.y + d.y;
            if (nx >= 0 && nx < this.cols && ny >= 0 && ny < this.rows) res.push({ x: nx, y: ny });
        });
        return res;
    }

    /**
     * Fallback logic to move toward the largest free space if the cycle is blocked.
     */
    survive(head, snake, obstaclesSet, reason = "Unknown") {
        const neighbors = this.getNeighbors(head);
        let bestMove = null, bestScore = -Infinity;
        const snakeSet = new Set(snake.map(p => `${p.x},${p.y}`));
        const allObs = new Set([...obstaclesSet, ...snakeSet]);
        
        neighbors.forEach(n => {
            if (!snakeSet.has(`${n.x},${n.y}`) && !obstaclesSet.has(`${n.x},${n.y}`)) {
                const score = this.floodFill(n, allObs) - this.getDangerScore(n, obstaclesSet) * 2;
                if (score > bestScore) { bestScore = score; bestMove = n; }
            }
        });
        return bestMove ? { x: bestMove.x - head.x, y: bestMove.y - head.y, type: "survival", reason, score: bestScore } : null;
    }

    floodFill(start, obstacles) {
        const queue = [start], visited = new Set([`${start.x},${start.y}`]);
        let count = 0;
        while (queue.length > 0 && count < 300) {
            const curr = queue.shift(); count++;
            this.getNeighbors(curr).forEach(n => {
                if (!obstacles.has(`${n.x},${n.y}`) && !visited.has(`${n.x},${n.y}`)) {
                    visited.add(`${n.x},${n.y}`); queue.push(n);
                }
            });
        }
        return count;
    }

    /**
     * Generates a random starting state for a new snake.
     */
    getStartState(seedOffset = 0) {
        if (!this.isInitialized) this.init();
        let rng = (this.random() + seedOffset) % 1;
        const len = 3;
        const headIdx = Math.floor(rng * (this.hamiltonianCycle.length - len));
        const snake = [];
        for (let i = 0; i < len; i++) {
            let idx = (headIdx - i + this.hamiltonianCycle.length) % this.hamiltonianCycle.length;
            snake.push(this.hamiltonianCycle[idx]);
        }
        return { snake, dx: snake[0].x - snake[1].x, dy: snake[0].y - snake[1].y };
    }
}

// Export
window.SnakeAI = SnakeAI;

})();

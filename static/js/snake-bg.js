(function() {
    'use strict';

    /**
     * Verbose logging helper
     */
    const VERBOSE_LOGGING = true;
    function log(...args) {
        if (VERBOSE_LOGGING) {
            console.log('[SnakeBG]', ...args);
        }
    }

/**
 * Snake Background Module
 * Implements an interactive AI-driven snake game as a background visualization.
 */
const canvas = document.getElementById("snake-bg-canvas");
const ctx = canvas.getContext("2d");

// Configuration and state
let GRID_SIZE = 40;
let TILE_COLS = 0;
let TILE_ROWS = 0;
const BASE_GAME_SPEED = 60;

let snakes = [];
let foods = [];
let gameTimeout;
let aiController = null;
let currentSeed = Date.now();
const VERBOSE_AI = false;
let snakeTargets = new Map();

const SNAKE_COLORS = [
    { headLight: "#333333", bodyLight: "#007bff", headDark: "#ffffff", bodyDark: "#00ccff" },
    { headLight: "#333333", bodyLight: "#28a745", headDark: "#ffffff", bodyDark: "#00ff40" }
];

/**
 * Resizes the canvas and re-initializes the AI controller.
 */
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    TILE_COLS = Math.floor(canvas.width / GRID_SIZE);
    TILE_ROWS = Math.floor(canvas.height / GRID_SIZE);
    
    // Ensure even dimensions for Hamiltonian cycle
    if (TILE_COLS % 2 !== 0) TILE_COLS--;
    if (TILE_ROWS % 2 !== 0) TILE_ROWS--;
    
    currentSeed = Date.now();
    aiController = new SnakeAI(TILE_COLS, TILE_ROWS, currentSeed, VERBOSE_AI);
    initGame();
}

/**
 * Initializes snakes and food for a new game session.
 */
function initGame() {
    snakes = [];
    if (aiController) {
        for (let i = 0; i < 2; i++) {
            const startState = aiController.getStartState(i * 0.5);
            snakes.push({
                body: startState.snake,
                dx: startState.dx,
                dy: startState.dy,
                nextDx: startState.dx,
                nextDy: startState.dy,
                colorIndex: i % SNAKE_COLORS.length,
                id: i
            });
        }
    }
    foods = [];
    maintainFoodCount();
    if (gameTimeout) clearTimeout(gameTimeout);
    gameTick();
}

/**
 * Ensures a minimum amount of food is always present on the grid.
 */
function maintainFoodCount() {
    while (foods.length < 5) {
        spawnSingleFood();
    }
}

/**
 * Spawns a single piece of food in a valid, unoccupied tile.
 */
function spawnSingleFood() {
    let attempts = 0;
    while (attempts < 50) {
        const newFood = {
            x: Math.floor(Math.random() * TILE_COLS),
            y: Math.floor(Math.random() * TILE_ROWS)
        };
        
        let isValid = true;
        for (const s of snakes) {
            if (s.body.some(p => p.x === newFood.x && p.y === newFood.y)) {
                isValid = false;
                break;
            }
        }
        
        if (isValid && foods.some(f => f.x === newFood.x && f.y === newFood.y)) {
            isValid = false;
        }

        if (isValid) {
            foods.push(newFood);
            return;
        }
        attempts++;
    }
}

/**
 * Main animation tick.
 */
function gameTick() {
    gameLoop();
    gameTimeout = setTimeout(gameTick, BASE_GAME_SPEED);
}

/**
 * Updates game logic and movement.
 */
function gameLoop() {
    for (let i = 0; i < snakes.length; i++) {
        const s = snakes[i];
        let otherParts = [];
        snakes.forEach((other, idx) => {
            if (i !== idx) otherParts = otherParts.concat(other.body);
        });

        if (aiController) {
            const move = aiController.getNextMove(s.body, foods, null, otherParts, s.id, snakeTargets);
            if (move) {
                s.nextDx = move.x;
                s.nextDy = move.y;
            }
        }

        s.dx = s.nextDx;
        s.dy = s.nextDy;
        
        const head = { x: s.body[0].x + s.dx, y: s.body[0].y + s.dy };
        let collision = head.x < 0 || head.x >= TILE_COLS || head.y < 0 || head.y >= TILE_ROWS;

        if (!collision) {
            collision = s.body.some(p => p.x === head.x && p.y === head.y);
        }
        
        if (!collision) {
            collision = snakes.some(other => other.id !== s.id && other.body.some(p => p.x === head.x && p.y === head.y));
        }

        if (collision) {
            const startState = aiController.getStartState(Math.random() * 1000);
            snakes[i] = {
                body: startState.snake,
                dx: startState.dx,
                dy: startState.dy,
                nextDx: startState.dx,
                nextDy: startState.dy,
                colorIndex: s.colorIndex,
                id: s.id
            };
            continue;
        }

        s.body.unshift(head);
        const foodIndex = foods.findIndex(f => head.x === f.x && head.y === f.y);
        
        if (foodIndex !== -1) {
            foods.splice(foodIndex, 1);
            snakeTargets.delete(s.id);
            maintainFoodCount();
        } else {
            s.body.pop();
        }
    }
    draw();
}

/**
 * Renders the game state to the canvas.
 */
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw Food
    ctx.fillStyle = "#ff4444";
    for (const f of foods) {
        ctx.fillRect(f.x * GRID_SIZE, f.y * GRID_SIZE, GRID_SIZE - 2, GRID_SIZE - 2);
    }
    
    const isDark = document.documentElement.getAttribute("data-bs-theme") === "dark";
    
    // Draw Snakes
    for (const s of snakes) {
        const colors = SNAKE_COLORS[s.colorIndex];
        s.body.forEach((part, idx) => {
            if (idx === 0) {
                ctx.fillStyle = isDark ? colors.headDark : colors.headLight;
            } else {
                ctx.fillStyle = isDark ? colors.bodyDark : colors.bodyLight;
            }
            ctx.fillRect(part.x * GRID_SIZE, part.y * GRID_SIZE, GRID_SIZE - 2, GRID_SIZE - 2);
        });
    }
}

// Window event listeners
window.addEventListener("resize", () => {
    clearTimeout(gameTimeout);
    setTimeout(resizeCanvas, 200);
});

// Initial boot
resizeCanvas();

})();

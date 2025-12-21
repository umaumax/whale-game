import { FISH_TYPES, MAX_DROP_LEVEL, GAME_WIDTH, GAME_HEIGHT, WALL_THICKNESS, DEADLINE_Y } from './constants.js';
import { AudioManager } from './audio.js';

// --- Matter.js Aliases ---
const Engine = Matter.Engine,
      Render = Matter.Render,
      Runner = Matter.Runner,
      Bodies = Matter.Bodies,
      Composite = Matter.Composite,
      Events = Matter.Events,
      World = Matter.World,
      Body = Matter.Body;

// --- Game Variables ---
let engine, render, runner;
let audioManager;
let currentFish = null;
let nextFishLevel = 1;
let isDropping = false;
let score = 0;
let bestScore = localStorage.getItem('shusseuo_best') || 0;
let gameOver = false;
let gameContainer = document.getElementById('game-container');

// --- Initialization ---
async function init() {
    // Update Best Score UI
    document.getElementById('best-score').innerText = bestScore;

    // Setup Audio
    audioManager = new AudioManager();

    // 画像をプリロードしてスケールを計算
    await preloadImages();

    // Setup Engine
    engine = Engine.create();
    engine.world.gravity.y = 1.5; // 6. 物理パラメータ: 重力調整

    // Setup Render
    render = Render.create({
        element: gameContainer,
        engine: engine,
        options: {
            width: GAME_WIDTH,
            height: GAME_HEIGHT,
            wireframes: false,
            background: '#222'
        }
    });

    // Create Walls (U-shape)
    const ground = Bodies.rectangle(GAME_WIDTH / 2, GAME_HEIGHT + WALL_THICKNESS / 2 - 10, GAME_WIDTH, WALL_THICKNESS, { isStatic: true, render: { fillStyle: '#555' } });
    const leftWall = Bodies.rectangle(0 - WALL_THICKNESS / 2, GAME_HEIGHT / 2, WALL_THICKNESS, GAME_HEIGHT * 2, { isStatic: true, render: { fillStyle: '#555' } });
    const rightWall = Bodies.rectangle(GAME_WIDTH + WALL_THICKNESS / 2, GAME_HEIGHT / 2, WALL_THICKNESS, GAME_HEIGHT * 2, { isStatic: true, render: { fillStyle: '#555' } });

    Composite.add(engine.world, [ground, leftWall, rightWall]);

    // Input Handling
    render.canvas.addEventListener('mousemove', handleInputMove);
    render.canvas.addEventListener('touchmove', handleInputMove, { passive: false });
    render.canvas.addEventListener('click', handleInputDrop);
    render.canvas.addEventListener('touchend', handleInputDrop);

    // Collision Handling (Merge)
    Events.on(engine, 'collisionStart', handleCollisions);

    // Game Loop Events
    Events.on(engine, 'beforeUpdate', checkGameOver);
    
    // Custom Rendering for Text
    Events.on(render, 'afterRender', renderFishLabels);
    Events.on(render, 'afterRender', renderDeadline);

    // Start
    Render.run(render);
    runner = Runner.create();
    Runner.run(runner, engine);

    // Initial Fish
    setNextFish();
    spawnCurrentFish();
}

// --- Game Logic ---

function preloadImages() {
    const promises = FISH_TYPES.map(fish => {
        return new Promise((resolve) => {
            if (!fish.image) {
                resolve();
                return;
            }
            const img = new Image();
            img.src = fish.image;
            img.onload = () => {
                // 画像の長辺を直径(radius * 2)に合わせるためのスケールを計算
                const maxDimension = Math.max(img.width, img.height);
                fish.renderScale = (fish.radius * 2) / maxDimension;
                resolve();
            };
            img.onerror = () => {
                console.warn(`Failed to load image: ${fish.image}`);
                resolve();
            };
        });
    });
    return Promise.all(promises);
}

function getRandomDropLevel() {
    return Math.floor(Math.random() * MAX_DROP_LEVEL) + 1;
}

function setNextFish() {
    nextFishLevel = getRandomDropLevel();
    const fishType = FISH_TYPES[nextFishLevel - 1];
    const nextCircle = document.getElementById('next-fish-circle');
    nextCircle.style.backgroundColor = fishType.color;
    nextCircle.innerText = fishType.name;
    // Adjust text color for visibility
    nextCircle.style.color = (nextFishLevel === 9) ? 'white' : '#333'; 
}

function spawnCurrentFish() {
    if (gameOver) return;

    const fishType = FISH_TYPES[nextFishLevel - 1];
    
    // 画像設定がある場合はスプライトを使用、なければ色を使用
    const renderConfig = fishType.image ? {
        sprite: {
            texture: fishType.image,
            xScale: fishType.renderScale || 1,
            yScale: fishType.renderScale || 1
        }
    } : { fillStyle: fishType.color };

    // Create a sensor body (static-ish) for positioning
    currentFish = Bodies.circle(GAME_WIDTH / 2, 50, fishType.radius, {
        isStatic: true,
        label: 'current_fish',
        render: renderConfig,
        collisionFilter: { group: -1 } // Don't collide yet
    });
    
    // Custom property to store level
    currentFish.gameLevel = nextFishLevel;

    Composite.add(engine.world, currentFish);
    isDropping = false;
    
    setNextFish();
}

function handleInputMove(e) {
    if (gameOver || isDropping || !currentFish) return;
    e.preventDefault();

    const rect = render.canvas.getBoundingClientRect();
    let clientX = e.clientX;
    if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
    }

    let x = clientX - rect.left;
    
    // Clamp x within walls
    const radius = currentFish.circleRadius;
    if (x < radius) x = radius;
    if (x > GAME_WIDTH - radius) x = GAME_WIDTH - radius;

    Body.setPosition(currentFish, { x: x, y: 50 });
}

function handleInputDrop(e) {
    if (gameOver || isDropping || !currentFish) return;
    e.preventDefault(); // Prevent double firing on some devices

    isDropping = true;
    audioManager.playDrop();
    
    // Make dynamic
    Body.setStatic(currentFish, false);
    
    // 修正: 衝突フィルタをリセットして他の魚と衝突するようにする
    currentFish.collisionFilter = { group: 0, category: 1, mask: 0xFFFFFFFF };
    
    // 6. 物理パラメータ: 反発係数, 摩擦
    currentFish.restitution = 0.2; 
    currentFish.friction = 0.5;
    currentFish.label = 'fish'; // Change label to active fish

    // Wait before spawning next
    setTimeout(() => {
        spawnCurrentFish();
    }, 1000);
}

function handleCollisions(event) {
    const pairs = event.pairs;

    for (let i = 0; i < pairs.length; i++) {
        const bodyA = pairs[i].bodyA;
        const bodyB = pairs[i].bodyB;

        // Check if both are fish and have same level
        if (bodyA.label === 'fish' && bodyB.label === 'fish' && 
            bodyA.gameLevel === bodyB.gameLevel) {
            
            // Avoid double processing
            if (bodyA.isRemoving || bodyB.isRemoving) continue;

            const level = bodyA.gameLevel;
            
            // Max level reached? (Whale)
            if (level >= FISH_TYPES.length) {
                continue; 
            }

            // Mark for removal
            bodyA.isRemoving = true;
            bodyB.isRemoving = true;

            // Calculate midpoint
            const midX = (bodyA.position.x + bodyB.position.x) / 2;
            const midY = (bodyA.position.y + bodyB.position.y) / 2;

            // Remove bodies
            Composite.remove(engine.world, [bodyA, bodyB]);

            // Add score
            addScore(FISH_TYPES[level - 1].score); // Score for the merge

            // Create new fish (Level + 1)
            const newLevel = level + 1;
            audioManager.playMerge(newLevel);
            const newFishType = FISH_TYPES[newLevel - 1];
            
            // 進化後の魚のレンダリング設定
            const renderConfig = newFishType.image ? {
                sprite: {
                    texture: newFishType.image,
                    xScale: newFishType.renderScale || 1,
                    yScale: newFishType.renderScale || 1
                }
            } : { fillStyle: newFishType.color };

            const newBody = Bodies.circle(midX, midY, newFishType.radius, {
                label: 'fish',
                render: renderConfig,
                restitution: 0.2,
                friction: 0.5
            });
            newBody.gameLevel = newLevel;

            Composite.add(engine.world, newBody);
        }
    }
}

function addScore(points) {
    score += points;
    document.getElementById('score').innerText = score;
    if (score > bestScore) {
        bestScore = score;
        localStorage.setItem('shusseuo_best', bestScore);
        document.getElementById('best-score').innerText = bestScore;
    }
}

// Game Over Logic
let gameOverTimer = 0;
function checkGameOver() {
    if (gameOver) return;

    const bodies = Composite.allBodies(engine.world);
    let isOverLine = false;

    for (let body of bodies) {
        if (body.label === 'fish' && !body.isStatic) {
            // Check if velocity is low (settled) and position is above deadline
            if (body.position.y < DEADLINE_Y && Math.abs(body.velocity.y) < 0.5) {
                isOverLine = true;
                break;
            }
        }
    }

    if (isOverLine) {
        gameOverTimer += 16.6; // approx ms per frame
        if (gameOverTimer > 2000) { // 2 seconds threshold
            triggerGameOver();
        }
    } else {
        gameOverTimer = 0;
    }
}

function triggerGameOver() {
    gameOver = true;
    document.getElementById('final-score').innerText = "Score: " + score;
    document.getElementById('game-over-screen').style.display = 'flex';
    Runner.stop(runner);
}

window.resetGame = function() {
    location.reload(); // Simple reload for module based reset
};

// --- Custom Rendering ---
function renderFishLabels() {
    const ctx = render.context;
    const bodies = Composite.allBodies(engine.world);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#333';
    ctx.font = 'bold 12px Arial';

    for (let body of bodies) {
        if (body.gameLevel) {
            const fish = FISH_TYPES[body.gameLevel - 1];
            // Adjust text color based on background
            ctx.fillStyle = (body.gameLevel === 9) ? 'white' : '#333'; 
            
            // Simple text drawing
            ctx.fillText(fish.name, body.position.x, body.position.y);
            
            // 画像がない場合のみ顔（目）を描画
            if (!fish.image) {
                ctx.fillStyle = (body.gameLevel === 9) ? 'white' : 'black'; 
                ctx.beginPath();
                ctx.arc(body.position.x - 10, body.position.y - 10, 2, 0, 2 * Math.PI);
                ctx.arc(body.position.x + 10, body.position.y - 10, 2, 0, 2 * Math.PI);
                ctx.fill();
            }
        }
    }
}

function renderDeadline() {
    const ctx = render.context;
    ctx.beginPath();
    ctx.moveTo(0, DEADLINE_Y);
    ctx.lineTo(GAME_WIDTH, DEADLINE_Y);
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
}

// Start Game
init();

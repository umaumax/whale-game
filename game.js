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
let lastDropX = GAME_WIDTH / 2;
let score = 0;
let bestScore = localStorage.getItem('shusseuo_best') || 0;
let gameOver = false;
let gameContainer;
let confettiParticles = []; // 紙吹雪用配列
let isDebugMode = false;
let debugFishLevel = 1;
let showColliders = false;

// --- Initialization ---
async function init() {
    gameContainer = document.getElementById('game-container');

    // Update Best Score UI
    document.getElementById('best-score').innerText = bestScore;

    // Setup Audio
    audioManager = new AudioManager();

    // 画像をプリロードしてスケールを計算
    await preloadImages();

    // デバッグUIのセットアップ
    setupDebugUI();

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
    Events.on(render, 'afterRender', renderConfetti); // 紙吹雪の描画
    Events.on(render, 'afterRender', renderGuideLine); // ガイドラインの描画
    Events.on(render, 'afterRender', renderDebugColliders); // デバッグ用コライダー描画

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
    if (isDebugMode) {
        nextFishLevel = debugFishLevel;
    } else {
        nextFishLevel = getRandomDropLevel();
    }
    const fishType = FISH_TYPES[nextFishLevel - 1];
    const nextCircle = document.getElementById('next-fish-circle');

    if (fishType.image) {
        nextCircle.style.backgroundColor = 'transparent';
        nextCircle.innerText = '';
        nextCircle.style.backgroundImage = `url(${fishType.image})`;
        nextCircle.style.backgroundSize = 'contain';
        nextCircle.style.backgroundRepeat = 'no-repeat';
        nextCircle.style.backgroundPosition = 'center';
    } else {
        nextCircle.style.backgroundImage = 'none';
        nextCircle.style.backgroundColor = fishType.color;
        nextCircle.innerText = fishType.name;
        // Adjust text color for visibility
        nextCircle.style.color = (nextFishLevel === 9) ? 'white' : '#333'; 
    }
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

    // 前回のドロップ位置を使用（壁へのめり込み防止）
    let spawnX = lastDropX;
    if (spawnX < fishType.radius) spawnX = fishType.radius;
    if (spawnX > GAME_WIDTH - fishType.radius) spawnX = GAME_WIDTH - fishType.radius;

    // Create a sensor body (static-ish) for positioning
    currentFish = Bodies.circle(spawnX, 50, fishType.radius, {
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
    lastDropX = currentFish.position.x;
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
            
            if (newLevel === FISH_TYPES.length) { // クジラ(レベル11)の場合
                audioManager.playFanfare();
                triggerConfetti(midX, midY);
            } else {
                audioManager.playMerge(newLevel);
            }
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

// --- Confetti Effect ---
function triggerConfetti(x, y) {
    for (let i = 0; i < 100; i++) {
        confettiParticles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 15,
            vy: (Math.random() - 1) * 15 - 5, // 上方向に吹き出す
            color: `hsl(${Math.random() * 360}, 100%, 50%)`,
            size: Math.random() * 8 + 4,
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: (Math.random() - 0.5) * 0.3,
            life: 1.0
        });
    }
}

function renderConfetti() {
    const ctx = render.context;
    for (let i = confettiParticles.length - 1; i >= 0; i--) {
        let p = confettiParticles[i];
        
        // Update
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.5; // 重力
        p.rotation += p.rotationSpeed;
        p.life -= 0.015; // 寿命を減らす
        
        if (p.life <= 0 || p.y > GAME_HEIGHT) {
            confettiParticles.splice(i, 1);
            continue;
        }
        
        // Draw
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
    }
}

// --- Guide Line ---
function renderGuideLine() {
    if (gameOver || isDropping || !currentFish) return;

    const ctx = render.context;
    const x = currentFish.position.x;
    const y = currentFish.position.y;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, GAME_HEIGHT);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
}

// --- Debug Functions ---
function setupDebugUI() {
    const panel = document.getElementById('debug-panel');
    const toggleBtn = document.getElementById('debug-toggle-btn');
    const modeToggle = document.getElementById('debug-mode-toggle');
    const fishSelect = document.getElementById('debug-fish-select');
    const colliderToggle = document.getElementById('debug-show-colliders');

    // 要素が見つからない場合は処理をスキップ（HTMLが更新されていない場合などの対策）
    if (!panel || !toggleBtn || !modeToggle || !fishSelect || !colliderToggle) {
        return;
    }

    // 魚リストの生成
    FISH_TYPES.forEach(fish => {
        const option = document.createElement('option');
        option.value = fish.level;
        option.text = `${fish.level}: ${fish.name}`;
        fishSelect.appendChild(option);
    });

    // パネル開閉
    toggleBtn.addEventListener('click', () => {
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });

    // デバッグモード切替
    modeToggle.addEventListener('change', (e) => {
        isDebugMode = e.target.checked;
        fishSelect.disabled = !isDebugMode;
        updateCurrentFishIfIdle();
    });

    // 魚選択
    fishSelect.addEventListener('change', (e) => {
        debugFishLevel = parseInt(e.target.value);
        updateCurrentFishIfIdle();
    });

    // コライダー表示切替
    colliderToggle.addEventListener('change', (e) => {
        showColliders = e.target.checked;
    });
}

function updateCurrentFishIfIdle() {
    // 待機中（ドロップ前）なら、手持ちの魚を即座に更新する
    if (isDebugMode) {
        nextFishLevel = debugFishLevel;
        if (currentFish && !isDropping) {
            Composite.remove(engine.world, currentFish);
            spawnCurrentFish();
        } else {
            setNextFish(); // UI更新のみ
        }
    }
}

function renderDebugColliders() {
    if (!showColliders) return;
    const ctx = render.context;
    const bodies = Composite.allBodies(engine.world);
    
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#00FF00'; // 緑色で表示
    
    for (let body of bodies) {
        if (body.circleRadius) { // 円形のみ描画
            ctx.beginPath();
            ctx.arc(body.position.x, body.position.y, body.circleRadius, 0, 2 * Math.PI);
            ctx.stroke();
            
            // 中心点
            ctx.fillStyle = '#00FF00';
            ctx.fillRect(body.position.x - 2, body.position.y - 2, 4, 4);
        }
    }
}

// Start Game
init();

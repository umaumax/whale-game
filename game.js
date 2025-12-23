import { THEMES, MAX_DROP_LEVEL, GAME_WIDTH, GAME_HEIGHT, WALL_THICKNESS, DEADLINE_Y } from './constants.js';
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
let glowEffects = []; // 合体時の光エフェクト用
let shakeTimer = 0; // 画面揺れタイマー
let shakeIntensity = 0; // 画面揺れの強さ
let isDebugMode = false;
let debugFishLevel = 1;
let showColliders = false;
let currentFishTypes = THEMES.fish; // デフォルトテーマ
let currentThemeName = 'fish';
let currentGravity = 1.5;
let showBallLabels = false;
let comboCount = 0;
let lastMergeTime = 0;
let isPaused = false;
let isGameStarted = false;
let bubbleInterval = null;
let fruitInterval = null;
const WALL_OFFSET = 14; // 見た目の枠線の太さ（物理判定のオフセット）

// --- Initialization ---
async function init() {
    gameContainer = document.getElementById('game-container');

    // 魚テーマの色設定を「出世魚」に合わせて更新（淡い水色 -> 深海 -> 金）
    if (THEMES.fish) {
        const shusseuoColors = [
            "#E1F5FE", // Lv1: 卵/稚魚
            "#B3E5FC", // Lv2
            "#81D4FA", // Lv3
            "#4FC3F7", // Lv4
            "#29B6F6", // Lv5
            "#039BE5", // Lv6
            "#0288D1", // Lv7
            "#0277BD", // Lv8
            "#01579B", // Lv9: 深海魚
            "#304FFE", // Lv10: ヌシ手前
            "#FFD700"  // Lv11: ヌシ（金）
        ];
        THEMES.fish.forEach((fish, index) => {
            if (shusseuoColors[index]) fish.color = shusseuoColors[index];
        });
    }

    // Update Best Score UI
    document.getElementById('best-score').innerText = bestScore;

    // Setup Audio
    audioManager = new AudioManager();

    // デバッグ設定の読み込み
    loadDebugSettings();

    // 背景テーマの適用
    updateThemeBackground(currentThemeName);

    // セーブデータの存在確認
    // 画像読み込み前にスプラッシュを隠すことで、リロード時のチラつきを防ぐ
    const hasSaveData = localStorage.getItem('shusseuo_game_state') !== null;
    if (hasSaveData) {
        const splash = document.getElementById('splash-screen');
        if (splash) splash.style.display = 'none';
    }

    // 画像をプリロードしてスケールを計算
    await preloadImages();

    // スプラッシュ画面のアニメーションセットアップ
    setupSplashAnimation();

    // デバッグUIのセットアップ
    setupDebugUI();

    // ゲーム状態の復元を試みる
    const isRestored = loadGameState();

    // もし復元に失敗した場合（データ破損など）はスプラッシュを再表示
    if (hasSaveData && !isRestored) {
        const splash = document.getElementById('splash-screen');
        if (splash) splash.style.display = 'flex';
    }

    // Setup Engine
    engine = Engine.create();
    engine.world.gravity.y = currentGravity;
    // Setup Render
    render = Render.create({
        element: gameContainer,
        engine: engine,
        options: {
            width: GAME_WIDTH,
            height: GAME_HEIGHT,
            wireframes: false,
            background: 'transparent' // CSSで背景を設定するため透明にする
        }
    });

    // Create Walls (U-shape)
    const wallOptions = {
        isStatic: true,
        render: { visible: false }, // 物理壁は非表示にして、renderWallsで描画する
        label: 'wall',
        restitution: 0.0
    };
    // 床: 上面が GAME_HEIGHT - WALL_OFFSET になるように配置
    const ground = Bodies.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - WALL_OFFSET + WALL_THICKNESS / 2, GAME_WIDTH, WALL_THICKNESS, wallOptions);
    // 左壁: 右側面が WALL_OFFSET になるように配置
    const leftWall = Bodies.rectangle(WALL_OFFSET - WALL_THICKNESS / 2, GAME_HEIGHT / 2, WALL_THICKNESS, GAME_HEIGHT * 2, wallOptions);
    // 右壁: 左側面が GAME_WIDTH - WALL_OFFSET になるように配置
    const rightWall = Bodies.rectangle(GAME_WIDTH - WALL_OFFSET + WALL_THICKNESS / 2, GAME_HEIGHT / 2, WALL_THICKNESS, GAME_HEIGHT * 2, wallOptions);

    Composite.add(engine.world, [ground, leftWall, rightWall]);
    
    // 復元した魚があればワールドに追加
    if (isRestored && window.restoredBodies) {
        Composite.add(engine.world, window.restoredBodies);
    }

    // Input Handling
    window.addEventListener('mousemove', handleInputMove);
    window.addEventListener('touchmove', handleInputMove, { passive: false });
    window.addEventListener('click', handleInputDrop);
    window.addEventListener('touchend', handleInputDrop);

    // Pause Button
    document.getElementById('pause-btn').addEventListener('click', togglePause);

    // ページを離れるときに保存
    window.addEventListener('beforeunload', () => saveGameState());
    window.addEventListener('pagehide', () => saveGameState());
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            saveGameState();
        }
    });
    window.addEventListener('blur', () => saveGameState()); // フォーカスが外れた時も保存

    // Collision Handling (Merge)
    Events.on(engine, 'collisionStart', handleCollisions);

    // Game Loop Events
    Events.on(engine, 'beforeUpdate', checkGameOver);
    Events.on(engine, 'beforeUpdate', updateShake); // 画面揺れの更新
    
    // Custom Rendering for Text
    Events.on(render, 'afterRender', renderFishLabels);
    Events.on(render, 'afterRender', renderGlows); // 光エフェクトの描画
    Events.on(render, 'afterRender', renderDeadline);
    Events.on(render, 'afterRender', renderConfetti); // 紙吹雪の描画
    Events.on(render, 'afterRender', renderGuideLine); // ガイドラインの描画
    Events.on(render, 'afterRender', renderWalls); // 壁の描画
    Events.on(render, 'afterRender', renderDebugColliders); // デバッグ用コライダー描画

    // Start
    Render.run(render);
    runner = Runner.create();
    // Runner.run(runner, engine); // ここではまだ開始しない
    // スプラッシュ画面が表示されている

    // Initial Fish
    setNextFish(isRestored); // 復元時はレベルを維持
    spawnCurrentFish();

    // Enable Start Button when ready
    const startBtn = document.getElementById('start-btn');
    if (startBtn) {
        startBtn.disabled = false;
        startBtn.innerText = "START";
    }

    // 復元に成功した場合はスプラッシュ画面をスキップして開始
    if (isRestored) {
        startGame();
    }
}

// --- Game Logic ---

function preloadImages() {
    const promises = currentFishTypes.map(fish => {
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
                fish.image = null; // 画像読み込み失敗時はnullにして色表示にフォールバック
                resolve();
            };
        });
    });
    return Promise.all(promises);
}

function getRandomDropLevel() {
    return Math.floor(Math.random() * MAX_DROP_LEVEL) + 1;
}

function setNextFish(keepCurrentLevel = false) {
    if (!keepCurrentLevel) {
        if (isDebugMode) {
            nextFishLevel = debugFishLevel;
        } else {
            nextFishLevel = getRandomDropLevel();
        }
    }
    const fishType = currentFishTypes[nextFishLevel - 1];
    const nextCircle = document.getElementById('next-fish-circle');

    // NEXTのサイズを実際の物理サイズに合わせる
    const diameter = fishType.radius * 2;
    nextCircle.style.width = `${diameter}px`;
    nextCircle.style.height = `${diameter}px`;

    if (fishType.image) {
        nextCircle.style.backgroundImage = `url(${fishType.image})`;
        nextCircle.style.backgroundSize = 'contain';
        nextCircle.style.backgroundRepeat = 'no-repeat';
        nextCircle.style.backgroundPosition = 'center';
        nextCircle.style.backgroundColor = 'transparent';
        nextCircle.innerText = '';
    } else {
        nextCircle.style.backgroundImage = 'none';
        nextCircle.style.backgroundColor = fishType.color;
        nextCircle.innerText = fishType.name;
        // Adjust text color for visibility
        nextCircle.style.color = (nextFishLevel === 9) ? 'white' : '#333';
    }
    
    // 枠線をボールの色にする
    nextCircle.style.border = `2px solid ${fishType.color}`;
}

function spawnCurrentFish() {
    if (gameOver) return;

    const fishType = currentFishTypes[nextFishLevel - 1];
    
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
        collisionFilter: { mask: 0 } // ドロップ前は誰とも衝突しない
    });
    
    // Custom property to store level
    currentFish.gameLevel = nextFishLevel;

    Composite.add(engine.world, currentFish);
    isDropping = false;
    
    setNextFish();
    saveGameState(); // 状態保存
}

function handleInputMove(e) {
    if (gameOver || isDropping || !currentFish || isPaused || !isGameStarted) return;
    e.preventDefault();

    const rect = render.canvas.getBoundingClientRect();
    let clientX = e.clientX;
    if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
    }

    let x = clientX - rect.left;
    
    // Clamp x within walls
    const radius = currentFish.circleRadius;
    if (x < radius + WALL_OFFSET) x = radius + WALL_OFFSET;
    if (x > GAME_WIDTH - radius - WALL_OFFSET) x = GAME_WIDTH - radius - WALL_OFFSET;

    Body.setPosition(currentFish, { x: x, y: 50 });
}

function handleInputDrop(e) {
    // UI要素（ボタン、入力、デバッグパネル等）への操作は無視する
    if (e.target.closest('button, input, select, label, #debug-panel, #debug-toggle-btn, #pause-btn')) return;

    if (gameOver || isDropping || !currentFish || isPaused || !isGameStarted) return;
    e.preventDefault(); // Prevent double firing on some devices

    // タップ/クリックした位置にボールを移動させる
    if (!isDropping) {
        const rect = render.canvas.getBoundingClientRect();
        let clientX = e.clientX; // click event
        if (e.changedTouches && e.changedTouches.length > 0) { // touchend event
            clientX = e.changedTouches[0].clientX;
        }

        if (clientX !== undefined) {
            let x = clientX - rect.left;
            
            // Clamp x within walls
            const radius = currentFish.circleRadius;
            if (x < radius + WALL_OFFSET) x = radius + WALL_OFFSET;
            if (x > GAME_WIDTH - radius - WALL_OFFSET) x = GAME_WIDTH - radius - WALL_OFFSET;

            Body.setPosition(currentFish, { x: x, y: 50 });
        }
    }

    isDropping = true;
    lastDropX = currentFish.position.x;
    audioManager.playDrop();
    
    // Make dynamic
    Body.setStatic(currentFish, false);
    
    // 衝突フィルタをデフォルトに戻して衝突するようにする
    currentFish.collisionFilter = { category: 0x0001, mask: 0xFFFFFFFF, group: 0 };
    
    // 6. 物理パラメータ: 反発係数, 摩擦
    currentFish.restitution = 0.1; // 少し反発させることで重なりを解消しやすくする
    currentFish.friction = 0.1;
    currentFish.label = 'fish'; // Change label to active fish

    // Wait before spawning next
    spawnCurrentFish();
}

function handleCollisions(event) {
    const pairs = event.pairs;
    let stateChanged = false;

    for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i];
        const bodyA = pair.bodyA;
        const bodyB = pair.bodyB;

        // Check if both are fish and have same level
        if (bodyA.label === 'fish' && bodyB.label === 'fish' && 
            bodyA.gameLevel === bodyB.gameLevel) {
            
            // Avoid double processing
            if (bodyA.isRemoving || bodyB.isRemoving) continue;

            const level = bodyA.gameLevel;
            
            // Mark for removal
            bodyA.isRemoving = true;
            bodyB.isRemoving = true;
            stateChanged = true;

            // コンボ判定
            const now = Date.now();
            if (now - lastMergeTime < 1500) { // 1.5秒以内の連続合体
                comboCount++;
            } else {
                comboCount = 1;
            }
            lastMergeTime = now;

            // Calculate midpoint
            const midX = (bodyA.position.x + bodyB.position.x) / 2;
            const midY = (bodyA.position.y + bodyB.position.y) / 2;

            // Remove bodies
            Composite.remove(engine.world, [bodyA, bodyB]);

            // Add score
            addScore(currentFishTypes[level - 1].score); // Score for the merge

            // If max level (Whale), they disappear without creating a new one
            if (level >= currentFishTypes.length) {
                audioManager.playFanfare();
                const mergedFishType = currentFishTypes[level - 1];
                triggerGlow(midX, midY, mergedFishType.radius, mergedFishType.color);
                triggerConfetti(midX, midY, 300);
                if (comboCount > 1) {
                    triggerShake(20, 400); // コンボ時のみ揺らす
                }
                continue;
            }

            // Create new fish (Level + 1)
            const newLevel = level + 1;
            
            if (newLevel === currentFishTypes.length) { // クジラ(レベル11)の場合
                audioManager.playFanfare();
                triggerConfetti(midX, midY);
                if (comboCount > 1) {
                    triggerShake(15, 300);
                }
            } else {
                audioManager.playMerge(newLevel);
                if (comboCount > 1) {
                    triggerShake(newLevel * 1.5, 150); // コンボ時のみ揺らす
                }
            }
            const newFishType = currentFishTypes[newLevel - 1];
            triggerGlow(midX, midY, newFishType.radius, newFishType.color);
            
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
                restitution: 0.1,
                friction: 0.1
            });
            newBody.gameLevel = newLevel;

            Composite.add(engine.world, newBody);
        }
    }

    if (stateChanged) {
        saveGameState();
    }
}

function addScore(points) {
    score += points;
    const scoreEl = document.getElementById('score');
    scoreEl.innerText = score;

    // アニメーション再生（リフロー強制でリセット）
    scoreEl.classList.remove('score-pop');
    void scoreEl.offsetWidth;
    scoreEl.classList.add('score-pop');

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
        if (gameOverTimer > 1000) { // 1 second threshold
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
    localStorage.removeItem('shusseuo_game_state'); // ゲームオーバー時はセーブデータを削除
    Runner.stop(runner);
}

function resetGame() {
    // ゲームオーバー状態の解除
    gameOver = false;
    document.getElementById('game-over-screen').style.display = 'none';
    document.getElementById('pause-screen').style.display = 'none';
    isPaused = false;

    // スコアのリセット
    score = 0;
    localStorage.removeItem('shusseuo_game_state'); // セーブデータを削除
    document.getElementById('score').innerText = score;

    // 物理世界のオブジェクトをクリア（魚のみ削除、壁は残す）
    const bodies = Composite.allBodies(engine.world);
    const bodiesToRemove = [];
    for (const body of bodies) {
        if (body.label === 'fish' || body.label === 'current_fish') {
            bodiesToRemove.push(body);
        }
    }
    Composite.remove(engine.world, bodiesToRemove);

    // 紙吹雪のリセット
    confettiParticles = [];

    // シェイクリセット
    shakeTimer = 0;
    shakeIntensity = 0;
    comboCount = 0;
    lastMergeTime = 0;
    if (gameContainer) gameContainer.style.transform = 'none';

    // 変数リセット
    currentFish = null;
    isDropping = false;
    lastDropX = GAME_WIDTH / 2;

    // ランナーの再開（停止していた場合）
    Runner.stop(runner); // 念のため一度止める
    Runner.run(runner, engine);
    
    // 新しい魚の生成
    setNextFish();
    spawnCurrentFish();
}

// HTMLのボタンから呼べるようにグローバルに公開
window.resetGame = resetGame;

function startGame() {
    isGameStarted = true;
    const splash = document.getElementById('splash-screen');
    if (splash) splash.style.display = 'none';
    
    if (audioManager) audioManager.resume();
    // ランナー開始
    Runner.run(runner, engine);
}
window.startGame = startGame;

function togglePause() {
    if (gameOver) return;
    
    isPaused = !isPaused;
    const pauseScreen = document.getElementById('pause-screen');
    
    if (isPaused) {
        pauseScreen.style.display = 'flex';
        Runner.stop(runner);
    } else {
        pauseScreen.style.display = 'none';
        Runner.run(runner, engine);
    }
}
// HTMLから呼べるようにグローバルに公開
window.togglePause = togglePause;

function backToTitle() {
    // ゲームリセット（物理演算停止含む）
    isGameStarted = false;
    resetGame();
    // ランナーを停止
    Runner.stop(runner);
    // 画面切り替え
    document.getElementById('game-over-screen').style.display = 'none';
    document.getElementById('splash-screen').style.display = 'flex';
    document.getElementById('pause-screen').style.display = 'none';
}
window.backToTitle = backToTitle;

// --- Screen Shake ---
function triggerShake(intensity, duration) {
    // より強い揺れ、または長い時間を優先して更新
    shakeIntensity = Math.max(shakeIntensity, intensity);
    shakeTimer = Math.max(shakeTimer, duration);
}

function updateShake() {
    if (shakeTimer > 0) {
        shakeTimer -= 16.66; // 60fps想定で減算
        if (shakeTimer <= 0) {
            shakeTimer = 0;
            shakeIntensity = 0;
            gameContainer.style.transform = 'none';
        } else {
            // ランダムに位置をずらす
            // 時間経過とともに減衰させる処理を入れるとより自然になりますが、
            // ここではシンプルに一定時間揺らします
            const x = (Math.random() - 0.5) * 2 * shakeIntensity;
            const y = (Math.random() - 0.5) * 2 * shakeIntensity;
            gameContainer.style.transform = `translate(${x}px, ${y}px)`;
        }
    }
}

// --- Glow Effect ---
function triggerGlow(x, y, radius, color) {
    glowEffects.push({
        x,
        y,
        radius,
        color,
        life: 1.0,
    });
}

function renderGlows() {
    const ctx = render.context;
    for (let i = glowEffects.length - 1; i >= 0; i--) {
        const glow = glowEffects[i];
        
        glow.life -= 0.04; // フェードアウト速度
        
        if (glow.life <= 0) {
            glowEffects.splice(i, 1);
            continue;
        }
        
        // フェードアウトしながら少し拡大
        const currentRadius = glow.radius * (1.1 + (1 - glow.life) * 0.5);
        const alpha = glow.life * 0.7;
        
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(glow.x, glow.y, currentRadius, 0, Math.PI * 2);
        ctx.fillStyle = glow.color;
        
        // 影を使って光っているように見せる
        ctx.shadowColor = glow.color;
        ctx.shadowBlur = 30 * glow.life;
        
        ctx.fill();
        ctx.restore();
    }
}

// --- Custom Rendering ---
function renderFishLabels() {
    const ctx = render.context;
    const bodies = Composite.allBodies(engine.world);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 12px Arial';

    for (let body of bodies) {
        if (body.gameLevel) {
            const fish = currentFishTypes[body.gameLevel - 1];
            
            ctx.save();
            ctx.translate(body.position.x, body.position.y);
            ctx.rotate(body.angle);

            // 枠線の描画
            ctx.beginPath();
            ctx.arc(0, 0, fish.radius, 0, 2 * Math.PI);
            ctx.lineWidth = 2;
            ctx.strokeStyle = fish.color;
            ctx.stroke();

            if (showBallLabels) {
                // Adjust text color based on background
                ctx.fillStyle = (body.gameLevel === 9) ? 'white' : '#333'; 
                
                // Simple text drawing
                ctx.fillText(fish.name, 0, 0);
                
                // 画像がない場合のみ顔（目）を描画
                if (!fish.image) {
                    ctx.fillStyle = (body.gameLevel === 9) ? 'white' : 'black'; 
                    ctx.beginPath();
                    ctx.arc(-10, -10, 2, 0, 2 * Math.PI);
                    ctx.arc(10, -10, 2, 0, 2 * Math.PI);
                    ctx.fill();
                }
            }
            ctx.restore();
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
function triggerConfetti(x, y, count = 100) {
    for (let i = 0; i < count; i++) {
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

// --- Wall Rendering ---
function renderWalls() {
    if (!render || !render.context) return;
    const ctx = render.context;
    
    // デザイン設定
    const thickness = WALL_OFFSET; // 太さ
    let baseColor, glowColor;

    // テーマに応じた色設定
    if (currentThemeName === 'fruit') {
        baseColor = 'rgba(255, 240, 200, 0.4)'; // 暖色系の半透明
        glowColor = 'rgba(255, 160, 50, 0.8)';  // オレンジの光
    } else {
        // fish (default)
        baseColor = 'rgba(200, 240, 255, 0.3)'; // 青系の半透明
        glowColor = 'rgba(50, 200, 255, 0.8)';  // 水色の光
    }

    ctx.save();
    ctx.beginPath();
    // U字型のパスを作成（上部は画面外からスタートして角を見せない）
    ctx.moveTo(thickness / 2, -50); 
    ctx.lineTo(thickness / 2, GAME_HEIGHT - thickness / 2); // 左下
    ctx.lineTo(GAME_WIDTH - thickness / 2, GAME_HEIGHT - thickness / 2); // 右下
    ctx.lineTo(GAME_WIDTH - thickness / 2, -50); // 右上

    ctx.lineWidth = thickness;
    ctx.strokeStyle = baseColor;
    ctx.lineJoin = 'round'; // 角を丸くする
    ctx.lineCap = 'round';
    ctx.shadowBlur = 20; // 光彩の強さ
    ctx.shadowColor = glowColor;
    ctx.stroke();

    // 内側のハイライト（ガラスの質感）
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.stroke();

    ctx.restore();
}

// --- Debug Functions ---
function setupDebugUI() {
    const panel = document.getElementById('debug-panel');
    const toggleBtn = document.getElementById('debug-toggle-btn');
    const modeToggle = document.getElementById('debug-mode-toggle');
    const fishSelect = document.getElementById('debug-fish-select');
    const colliderToggle = document.getElementById('debug-show-colliders');
    const closeBtn = document.getElementById('debug-close-btn');
    const themeSelect = document.getElementById('debug-theme-select');
    const gravitySlider = document.getElementById('debug-gravity-slider');
    const gravityValue = document.getElementById('debug-gravity-value');
    const labelsToggle = document.getElementById('debug-show-labels');

    // UIの状態を現在の設定に合わせる
    if (modeToggle) modeToggle.checked = isDebugMode;
    if (colliderToggle) colliderToggle.checked = showColliders;
    if (fishSelect) fishSelect.disabled = !isDebugMode;
    if (themeSelect) themeSelect.value = currentThemeName;
    if (gravitySlider) gravitySlider.value = currentGravity;
    if (gravityValue) gravityValue.innerText = currentGravity.toFixed(1);
    if (labelsToggle) labelsToggle.checked = showBallLabels;

    // 要素が見つからない場合は処理をスキップ（HTMLが更新されていない場合などの対策）
    if (!panel || !toggleBtn || !modeToggle || !fishSelect || !colliderToggle || !closeBtn || !themeSelect || !gravitySlider || !gravityValue || !labelsToggle) {
        return;
    }

    // テーマリストの生成
    Object.keys(THEMES).forEach(theme => {
        const option = document.createElement('option');
        option.value = theme;
        option.text = theme.charAt(0).toUpperCase() + theme.slice(1);
        themeSelect.appendChild(option);
    });

    // テーマ選択の初期値を設定
    themeSelect.value = currentThemeName;

    // 魚リストの生成（初期）
    updateDebugFishList(fishSelect);

    // パネル開閉
    toggleBtn.addEventListener('click', () => {
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });

    // パネル閉じる
    closeBtn.addEventListener('click', () => {
        panel.style.display = 'none';
    });

    // デバッグモード切替
    modeToggle.addEventListener('change', (e) => {
        isDebugMode = e.target.checked;
        fishSelect.disabled = !isDebugMode;
        updateCurrentFishIfIdle();
        saveDebugSettings();
    });

    // 魚選択
    fishSelect.addEventListener('change', (e) => {
        debugFishLevel = parseInt(e.target.value);
        updateCurrentFishIfIdle();
    });

    // コライダー表示切替
    colliderToggle.addEventListener('change', (e) => {
        showColliders = e.target.checked;
        saveDebugSettings();
    });

    // テーマ切り替え
    themeSelect.addEventListener('change', async (e) => {
        const newTheme = e.target.value;
        currentThemeName = newTheme;
        updateThemeBackground(newTheme); // 背景を更新
        currentFishTypes = THEMES[newTheme];
        try {
            await preloadImages();
        } catch (error) {
            console.error("Failed to preload images:", error);
        }
        updateDebugFishList(fishSelect);
        updateExistingFishes(); // リセットせずに既存の魚を更新
        saveDebugSettings();
    });

    // 重力スライダー
    gravitySlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        currentGravity = val;
        if (engine) engine.world.gravity.y = currentGravity;
        gravityValue.innerText = val.toFixed(1);
        saveDebugSettings();
    });

    // ラベル表示切替
    labelsToggle.addEventListener('change', (e) => {
        showBallLabels = e.target.checked;
        saveDebugSettings();
    });
}

function updateDebugFishList(selectElement) {
    // 既存のオプションをクリア
    selectElement.innerHTML = '';
    
    // 現在のテーマに基づいてリストを再生成
    currentFishTypes.forEach(fish => {
        const option = document.createElement('option');
        option.value = fish.level;
        option.text = `${fish.level}: ${fish.name}`;
        selectElement.appendChild(option);
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

// テーマに応じた背景クラスを適用する関数
function updateThemeBackground(theme) {
    if (!gameContainer) return;
    
    // 既存のテーマクラスを削除
    gameContainer.classList.remove('theme-fish', 'theme-fruit');
    
    // 新しいテーマクラスを追加
    gameContainer.classList.add(`theme-${theme}`);

    // 魚テーマの場合のみ泡アニメーションを開始
    if (theme === 'fish') {
        startBubbleAnimation();
        stopFruitAnimation();
    } else if (theme === 'fruit') {
        stopBubbleAnimation();
        startFruitAnimation();
    } else {
        stopBubbleAnimation();
        stopFruitAnimation();
    }
}

function startBubbleAnimation() {
    if (bubbleInterval) return;
    createBubble(); // 即座に1つ生成
    // 1.5秒ごとに泡を生成
    bubbleInterval = setInterval(createBubble, 1500);
}

function stopBubbleAnimation() {
    if (bubbleInterval) {
        clearInterval(bubbleInterval);
        bubbleInterval = null;
    }
    // 既存の泡を削除
    const bubbles = document.querySelectorAll('.bubble');
    bubbles.forEach(b => b.remove());
}

function createBubble() {
    if (!gameContainer || document.hidden) return;

    const bubble = document.createElement('div');
    bubble.classList.add('bubble');
    
    const size = Math.random() * 20 + 10; // 10px - 30px
    bubble.style.width = `${size}px`;
    bubble.style.height = `${size}px`;
    bubble.style.left = `${Math.random() * 100}%`;
    
    const duration = Math.random() * 5 + 8; // 8s - 13s (ゆっくり昇る)
    bubble.style.animationDuration = `${duration}s`;
    
    gameContainer.appendChild(bubble);
    
    // アニメーション終了後に削除
    setTimeout(() => {
        if (bubble.parentNode) bubble.remove();
    }, duration * 1000);
}

function startFruitAnimation() {
    if (fruitInterval) return;
    createFruit(); // 即座に1つ生成
    // 2秒ごとにフルーツを生成
    fruitInterval = setInterval(createFruit, 2000);
}

function stopFruitAnimation() {
    if (fruitInterval) {
        clearInterval(fruitInterval);
        fruitInterval = null;
    }
    // 既存のフルーツを削除
    const fruits = document.querySelectorAll('.fruit-particle');
    fruits.forEach(f => f.remove());
}

function createFruit() {
    if (!gameContainer || document.hidden) return;

    const fruit = document.createElement('div');
    fruit.classList.add('fruit-particle');
    
    // ランダムなフルーツ絵文字
    const fruits = ['🍎', '🍊', '🍇', '🍑', '🍒', '🍓', '🍍', '🍈'];
    fruit.innerText = fruits[Math.floor(Math.random() * fruits.length)];
    
    const size = Math.random() * 20 + 20; // 20px - 40px
    fruit.style.fontSize = `${size}px`;
    fruit.style.left = `${Math.random() * 90 + 5}%`; // 画面端すぎないように
    
    const duration = Math.random() * 5 + 5; // 5s - 10s
    fruit.style.animationDuration = `${duration}s`;
    
    gameContainer.appendChild(fruit);
    
    setTimeout(() => {
        if (fruit.parentNode) fruit.remove();
    }, duration * 1000);
}

// 盤面上の魚の見た目を現在のテーマに合わせて更新する
function updateExistingFishes() {
    const bodies = Composite.allBodies(engine.world);
    for (const body of bodies) {
        // fish または current_fish (ドロップ待ち) の場合
        if (body.gameLevel) {
            const newType = currentFishTypes[body.gameLevel - 1];
            
            // レンダリング設定の作成
            const renderConfig = newType.image ? {
                sprite: {
                    texture: newType.image,
                    xScale: newType.renderScale || 1,
                    yScale: newType.renderScale || 1
                }
            } : { fillStyle: newType.color };

            // ボディのrenderプロパティを更新
            body.render = renderConfig;
        }
    }
    // NEXT表示も更新
    setNextFish();
}

function saveDebugSettings() {
    const settings = {
        isDebugMode,
        showColliders,
        currentThemeName,
        currentGravity,
        showBallLabels
    };
    localStorage.setItem('shusseuo_debug_settings', JSON.stringify(settings));
}

function loadDebugSettings() {
    const saved = localStorage.getItem('shusseuo_debug_settings');
    if (saved) {
        try {
            const settings = JSON.parse(saved);
            if (typeof settings.isDebugMode === 'boolean') isDebugMode = settings.isDebugMode;
            if (typeof settings.showColliders === 'boolean') showColliders = settings.showColliders;
            if (settings.currentThemeName && THEMES[settings.currentThemeName]) {
                currentThemeName = settings.currentThemeName;
                currentFishTypes = THEMES[currentThemeName];
            }
            if (typeof settings.currentGravity === 'number') currentGravity = settings.currentGravity;
            if (typeof settings.showBallLabels === 'boolean') showBallLabels = settings.showBallLabels;
        } catch (e) {
            console.error("Failed to load debug settings", e);
        }
    }
}

function renderDebugColliders() {
    if (!showColliders) return;
    const ctx = render.context;
    const bodies = Composite.allBodies(engine.world);
    
    ctx.lineWidth = 2;
    
    for (let body of bodies) {
        if (body.circleRadius) { // 円形のみ描画
            if (body.gameLevel) {
                ctx.strokeStyle = currentFishTypes[body.gameLevel - 1].color;
            } else {
                ctx.strokeStyle = '#00FF00';
            }
            ctx.beginPath();
            ctx.arc(body.position.x, body.position.y, body.circleRadius, 0, 2 * Math.PI);
            ctx.stroke();
        }
    }
}

// --- Save/Load Game State ---
function saveGameState() {
    if (gameOver) return;
    if (!engine || !engine.world) return;

    const bodies = Composite.allBodies(engine.world);
    const fishes = [];
    for (const body of bodies) {
        // 盤面にある魚のみ保存（操作中の魚は保存しない）
        if (body.label === 'fish' && body.gameLevel) {
            fishes.push({
                x: body.position.x,
                y: body.position.y,
                angle: body.angle,
                level: body.gameLevel
            });
        }
    }

    const state = {
        score,
        nextFishLevel,
        fishes
    };
    localStorage.setItem('shusseuo_game_state', JSON.stringify(state));
}

function loadGameState() {
    const saved = localStorage.getItem('shusseuo_game_state');
    if (!saved) return false;

    try {
        const state = JSON.parse(saved);
        score = state.score || 0;
        nextFishLevel = state.nextFishLevel || 1;
        
        // スコア表示更新
        document.getElementById('score').innerText = score;

        // 魚の復元用データを準備
        if (state.fishes && Array.isArray(state.fishes)) {
            window.restoredBodies = [];
            for (const fishData of state.fishes) {
                const fishType = currentFishTypes[fishData.level - 1];
                if (!fishType) continue;

                const renderConfig = fishType.image ? {
                    sprite: {
                        texture: fishType.image,
                        xScale: fishType.renderScale || 1,
                        yScale: fishType.renderScale || 1
                    }
                } : { fillStyle: fishType.color };

                const body = Bodies.circle(fishData.x, fishData.y, fishType.radius, {
                    label: 'fish',
                    angle: fishData.angle,
                    render: renderConfig,
                    restitution: 0.1,
                    friction: 0.1
                });
                body.gameLevel = fishData.level;
                window.restoredBodies.push(body);
            }
        }
        return true;
    } catch (e) {
        console.error("Failed to load game state", e);
        return false;
    }
}

// --- Splash Animation ---
function setupSplashAnimation() {
    const container = document.getElementById('splash-bg');
    if (!container) return;
    
    container.innerHTML = ''; // クリア

    const fishImages = currentFishTypes.map(f => f.image).filter(i => i);
    
    // 15匹程度生成
    for (let i = 0; i < 15; i++) {
        const wrapper = document.createElement('div');
        wrapper.className = 'fish-wrapper';
        
        const fish = document.createElement('div');
        fish.className = 'fish-body';
        
        // ランダムな画像または色
        const img = fishImages[Math.floor(Math.random() * fishImages.length)];
        if (img) {
            fish.style.backgroundImage = `url(${img})`;
        } else {
            fish.style.backgroundColor = currentFishTypes[i % currentFishTypes.length].color;
            fish.style.borderRadius = '50%';
        }

        const size = 30 + Math.random() * 50;
        wrapper.style.width = `${size}px`;
        wrapper.style.height = `${size}px`;
        wrapper.style.top = `${Math.random() * 100}%`;
        
        const duration = 15 + Math.random() * 20;
        const delay = Math.random() * -30;
        const animName = Math.random() > 0.5 ? 'floatRight' : 'floatLeft';
        
        wrapper.style.animation = `${animName} ${duration}s linear ${delay}s infinite`;
        
        // クリックインタラクション
        wrapper.addEventListener('click', (e) => {
            e.stopPropagation();
            fish.classList.add('popped');
            if (audioManager) audioManager.playDrop(); // 音を鳴らす
            setTimeout(() => wrapper.remove(), 200); // アニメーション後に削除
        });

        wrapper.appendChild(fish);
        container.appendChild(wrapper);
    }
}

// Start Game
init();

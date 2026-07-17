(() => {
    "use strict";

    const MAX_MISSES = 10;
    const FIXED_STEP = 1 / 60;
    const SPEED_INCREASE_PER_CATCH = 3;
    const MAX_CATCH_SPEED_BONUS = 120;
    const STORAGE = {
        highScore: "catchTheFood.highScore",
        muted: "catchTheFood.muted"
    };

    const FOOD = {
        corn: { name: "Corn", color: "#f3bd38", image: "assets/food/corn.svg" },
        tomato: { name: "Tomato", color: "#e95745", image: "assets/food/tomato.svg" },
        carrot: { name: "Carrot", color: "#ef8734", image: "assets/food/carrot.svg" },
        lettuce: { name: "Lettuce", color: "#70a957", image: "assets/food/lettuce.svg" }
    };

    const CHARACTERS = [
        { id: "kitty", name: "Kitty", unlockScore: 0, image: "assets/characters/kitty.svg" },
        { id: "dog", name: "Dog", unlockScore: 50, image: "assets/characters/dog.svg" },
        { id: "mouse", name: "Mouse", unlockScore: 100, image: "assets/characters/mouse.svg" },
        { id: "pig", name: "Pig", unlockScore: 150, image: "assets/characters/pig.svg" },
        { id: "fox", name: "Fox", unlockScore: 200, image: "assets/characters/fox.svg" }
    ];

    const canvas = document.getElementById("gameCanvas");
    const ctx = canvas.getContext("2d");
    const frameElement = document.querySelector(".game-frame");
    const hud = document.getElementById("hud");
    const scoreValue = document.getElementById("scoreValue");
    const highScoreValue = document.getElementById("highScoreValue");
    const targetCard = document.getElementById("targetCard");
    const targetImage = document.getElementById("targetImage");
    const targetName = document.getElementById("targetName");
    const missMeter = document.getElementById("missMeter");
    const selectionScreen = document.getElementById("selectionScreen");
    const selectionHighScore = document.getElementById("selectionHighScore");
    const characterGrid = document.getElementById("characterGrid");
    const pauseScreen = document.getElementById("pauseScreen");
    const gameOverScreen = document.getElementById("gameOverScreen");
    const finalScoreValue = document.getElementById("finalScoreValue");
    const gameOverEyebrow = document.getElementById("gameOverEyebrow");
    const gameOverTitle = document.getElementById("gameOverTitle");
    const gameOverMessage = document.getElementById("gameOverMessage");
    const unlockMessage = document.getElementById("unlockMessage");
    const pauseButton = document.getElementById("pauseButton");
    const resumeButton = document.getElementById("resumeButton");
    const muteButton = document.getElementById("muteButton");
    const muteIcon = document.getElementById("muteIcon");
    const playAgainButton = document.getElementById("playAgainButton");
    const chooseCharacterButton = document.getElementById("chooseCharacterButton");
    const touchControls = document.getElementById("touchControls");
    const moveLeftButton = document.getElementById("moveLeftButton");
    const moveRightButton = document.getElementById("moveRightButton");
    const liveStatus = document.getElementById("liveStatus");

    const foodKeys = Object.keys(FOOD);
    const foodImages = Object.fromEntries(foodKeys.map((key) => [key, loadImage(FOOD[key].image)]));
    const characterImages = Object.fromEntries(CHARACTERS.map((character) => [character.id, loadImage(character.image)]));
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarsePointer = window.matchMedia("(pointer: coarse)");

    let width = 0;
    let height = 0;
    let groundY = 0;
    let lastTime = null;
    let accumulator = 0;
    let announcementTimer = 0;

    const input = { left: false, right: false };
    const state = {
        mode: "select",
        paused: false,
        muted: readBoolean(STORAGE.muted),
        highScore: readHighScore(),
        runStartHighScore: 0,
        score: 0,
        misses: 0,
        selectedCharacter: null,
        target: "corn",
        lastTarget: null,
        guaranteedTargetSpawns: 1,
        spawnTimer: 0,
        foods: [],
        particles: [],
        floaters: [],
        splats: [],
        character: {
            x: 0,
            y: 0,
            width: 96,
            height: 96,
            speed: 390,
            catchPulse: 0,
            wrongPulse: 0
        }
    };

    class SoundBus {
        constructor() {
            this.context = null;
        }

        setMuted(muted) {
            state.muted = muted;
            localStorage.setItem(STORAGE.muted, String(muted));
            updateMuteButton();
        }

        ensureContext() {
            if (state.muted) return null;
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return null;
            if (!this.context) this.context = new AudioContextClass();
            if (this.context.state === "suspended") this.context.resume().catch(() => {});
            return this.context;
        }

        play(kind) {
            const audioContext = this.ensureContext();
            if (!audioContext) return;

            const now = audioContext.currentTime;
            const gain = audioContext.createGain();
            gain.connect(audioContext.destination);

            if (kind === "catch") {
                gain.gain.setValueAtTime(0.0001, now);
                gain.gain.exponentialRampToValueAtTime(0.16, now + 0.01);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
                [620, 880].forEach((frequency, index) => {
                    const oscillator = audioContext.createOscillator();
                    oscillator.type = "sine";
                    oscillator.frequency.setValueAtTime(frequency, now + index * 0.06);
                    oscillator.connect(gain);
                    oscillator.start(now + index * 0.06);
                    oscillator.stop(now + 0.23);
                });
                return;
            }

            const oscillator = audioContext.createOscillator();
            oscillator.connect(gain);
            oscillator.type = kind === "miss" ? "triangle" : "sine";
            const startFrequency = kind === "miss" ? 150 : 260;
            const endFrequency = kind === "miss" ? 75 : 190;
            oscillator.frequency.setValueAtTime(startFrequency, now);
            oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + 0.18);
            gain.gain.setValueAtTime(0.09, now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
            oscillator.start(now);
            oscillator.stop(now + 0.21);
        }
    }

    const sounds = new SoundBus();

    function loadImage(src) {
        const image = new Image();
        image.src = src;
        return image;
    }

    function readHighScore() {
        const current = Number.parseInt(localStorage.getItem(STORAGE.highScore), 10);
        const legacy = Number.parseInt(localStorage.getItem("highScore"), 10);
        return Math.max(Number.isFinite(current) ? current : 0, Number.isFinite(legacy) ? legacy : 0);
    }

    function readBoolean(key) {
        return localStorage.getItem(key) === "true";
    }

    function clamp(value, minimum, maximum) {
        return Math.min(maximum, Math.max(minimum, value));
    }

    function randomBetween(minimum, maximum) {
        return minimum + Math.random() * (maximum - minimum);
    }

    function chooseTarget() {
        const options = foodKeys.filter((key) => key !== state.target);
        state.lastTarget = state.target;
        state.target = options[Math.floor(Math.random() * options.length)];
        state.guaranteedTargetSpawns = 1;
        updateTargetCard();
    }

    function catchSpeedBonus(score) {
        const successfulCatches = Math.floor(score / 10);
        return Math.min(MAX_CATCH_SPEED_BONUS, successfulCatches * SPEED_INCREASE_PER_CATCH);
    }

    function difficultyForScore(score) {
        const speedBonus = catchSpeedBonus(score);
        let interval = 0.48;
        if (score < 50) interval = 0.75;
        else if (score < 100) interval = 0.65;
        else if (score < 200) interval = 0.55;
        return {
            interval,
            minimumSpeed: 110 + speedBonus,
            maximumSpeed: 170 + speedBonus
        };
    }

    function resizeCanvas() {
        const rectangle = frameElement.getBoundingClientRect();
        const previousWidth = width;
        const oldCenterRatio = previousWidth > 0
            ? (state.character.x + state.character.width / 2) / previousWidth
            : 0.5;

        width = Math.max(280, rectangle.width);
        height = Math.max(240, rectangle.height);
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const characterSize = clamp(width * 0.12, 78, 108);
        state.character.width = characterSize;
        state.character.height = characterSize;
        groundY = height - clamp(height * 0.16, 82, 112);
        state.character.x = clamp(oldCenterRatio * width - characterSize / 2, 0, width - characterSize);
        state.character.y = groundY - characterSize + 8;

        state.foods.forEach((food) => {
            food.x = clamp(food.x, 0, Math.max(0, width - food.size));
        });
    }

    function buildMissMeter() {
        const fragment = document.createDocumentFragment();
        for (let index = 0; index < MAX_MISSES; index += 1) {
            const pip = document.createElement("span");
            pip.className = "chance-pip";
            pip.setAttribute("aria-hidden", "true");
            fragment.append(pip);
        }
        missMeter.replaceChildren(fragment);
    }

    function buildCharacterCards() {
        const fragment = document.createDocumentFragment();
        CHARACTERS.forEach((character) => {
            const unlocked = state.highScore >= character.unlockScore;
            const button = document.createElement("button");
            button.type = "button";
            button.className = "character-card";
            button.disabled = !unlocked;
            button.dataset.character = character.id;
            button.setAttribute("aria-label", unlocked
                ? `Play as ${character.name}`
                : `${character.name} locked. Score ${character.unlockScore} to unlock.`);

            const image = document.createElement("img");
            image.src = character.image;
            image.alt = "";

            const name = document.createElement("span");
            name.className = "character-name";
            name.textContent = character.name;

            const progress = document.createElement("span");
            progress.className = "character-progress";
            progress.textContent = unlocked
                ? character.unlockScore === 0 ? "Ready!" : "Unlocked"
                : `${Math.min(state.highScore, character.unlockScore)} / ${character.unlockScore}`;

            button.append(image, name, progress);
            if (!unlocked) {
                const lock = document.createElement("span");
                lock.className = "lock-badge";
                lock.textContent = "🔒";
                lock.setAttribute("aria-hidden", "true");
                button.append(lock);
            }

            button.addEventListener("click", () => startGame(character.id));
            fragment.append(button);
        });
        characterGrid.replaceChildren(fragment);
        selectionHighScore.textContent = String(state.highScore);
    }

    function resetRun() {
        state.runStartHighScore = state.highScore;
        state.score = 0;
        state.misses = 0;
        state.paused = false;
        state.foods = [];
        state.particles = [];
        state.floaters = [];
        state.splats = [];
        state.spawnTimer = 0;
        state.target = foodKeys[Math.floor(Math.random() * foodKeys.length)];
        state.lastTarget = null;
        state.guaranteedTargetSpawns = 1;
        state.character.x = width / 2 - state.character.width / 2;
        state.character.y = groundY - state.character.height + 8;
        state.character.catchPulse = 0;
        state.character.wrongPulse = 0;
        input.left = false;
        input.right = false;
        lastTime = null;
        accumulator = 0;
        updateHud();
        updateTargetCard(false);
    }

    function startGame(characterId) {
        sounds.ensureContext();
        state.selectedCharacter = characterId;
        state.mode = "playing";
        resetRun();
        selectionScreen.hidden = true;
        pauseScreen.hidden = true;
        gameOverScreen.hidden = true;
        hud.hidden = false;
        pauseButton.hidden = false;
        pauseButton.setAttribute("aria-label", "Pause game");
        pauseButton.querySelector("span").textContent = "Ⅱ";
        updateTouchControls();
        announce(`Playing as ${CHARACTERS.find((character) => character.id === characterId).name}. Catch ${FOOD[state.target].name}.`);
    }

    function showSelection() {
        state.mode = "select";
        state.paused = false;
        state.foods = [];
        input.left = false;
        input.right = false;
        buildCharacterCards();
        selectionScreen.hidden = false;
        pauseScreen.hidden = true;
        gameOverScreen.hidden = true;
        hud.hidden = true;
        pauseButton.hidden = true;
        touchControls.hidden = true;
        window.setTimeout(() => {
            const firstUnlocked = characterGrid.querySelector("button:not(:disabled)");
            if (firstUnlocked) firstUnlocked.focus();
        }, 0);
    }

    function playAgain() {
        if (!state.selectedCharacter) {
            showSelection();
            return;
        }
        state.mode = "playing";
        resetRun();
        gameOverScreen.hidden = true;
        hud.hidden = false;
        pauseButton.hidden = false;
        updateTouchControls();
        announce(`New round. Catch ${FOOD[state.target].name}.`);
    }

    function togglePause(forcePaused) {
        if (state.mode !== "playing") return;
        const nextPaused = typeof forcePaused === "boolean" ? forcePaused : !state.paused;
        if (nextPaused === state.paused) return;
        state.paused = nextPaused;
        input.left = false;
        input.right = false;
        pauseScreen.hidden = !state.paused;
        pauseButton.setAttribute("aria-label", state.paused ? "Resume game" : "Pause game");
        pauseButton.querySelector("span").textContent = state.paused ? "▶" : "Ⅱ";
        updateTouchControls();
        lastTime = null;
        announce(state.paused ? "Game paused." : "Game resumed.");
        if (state.paused) {
            resumeButton.focus();
        } else {
            pauseButton.focus();
        }
    }

    function finishGame() {
        state.mode = "gameover";
        input.left = false;
        input.right = false;
        if (state.score > state.highScore) {
            state.highScore = state.score;
            localStorage.setItem(STORAGE.highScore, String(state.highScore));
        }

        const newlyUnlocked = CHARACTERS.filter((character) =>
            character.unlockScore > state.runStartHighScore && character.unlockScore <= state.highScore
        );

        hud.hidden = true;
        pauseButton.hidden = true;
        touchControls.hidden = true;
        gameOverScreen.hidden = false;
        finalScoreValue.textContent = String(state.score);

        if (state.score > state.runStartHighScore) {
            gameOverEyebrow.textContent = "New best score";
            gameOverTitle.textContent = "Picnic legend!";
            gameOverMessage.textContent = `Your new high score is ${state.highScore}.`;
        } else {
            gameOverEyebrow.textContent = "Picnic complete";
            gameOverTitle.textContent = "Great catching!";
            gameOverMessage.textContent = `Your best score is ${state.highScore}. Ready for another round?`;
        }

        if (newlyUnlocked.length > 0) {
            unlockMessage.hidden = false;
            unlockMessage.textContent = `${newlyUnlocked.map((character) => character.name).join(" and ")} unlocked!`;
        } else {
            unlockMessage.hidden = true;
        }

        announce(`Game over. Final score ${state.score}. High score ${state.highScore}.`);
        playAgainButton.focus();
    }

    function updateTargetCard(animate = true) {
        const target = FOOD[state.target];
        targetImage.src = target.image;
        targetImage.alt = target.name;
        targetName.textContent = target.name;
        if (animate && !reducedMotion.matches) {
            targetCard.classList.remove("is-changing");
            void targetCard.offsetWidth;
            targetCard.classList.add("is-changing");
        }
    }

    function updateHud() {
        scoreValue.textContent = String(state.score);
        highScoreValue.textContent = String(Math.max(state.highScore, state.score));
        const pips = missMeter.children;
        for (let index = 0; index < pips.length; index += 1) {
            pips[index].classList.toggle("is-spent", index < state.misses);
        }
        const chances = MAX_MISSES - state.misses;
        missMeter.setAttribute("aria-label", `${chances} ${chances === 1 ? "chance" : "chances"} remaining`);
    }

    function updateMuteButton() {
        muteButton.setAttribute("aria-pressed", String(state.muted));
        muteButton.setAttribute("aria-label", state.muted ? "Turn sound on" : "Mute sound");
        muteIcon.textContent = state.muted ? "×" : "♪";
    }

    function updateTouchControls() {
        touchControls.hidden = !(coarsePointer.matches && state.mode === "playing" && !state.paused);
    }

    function spawnFood() {
        const difficulty = difficultyForScore(state.score);
        let type;
        if (state.guaranteedTargetSpawns > 0) {
            type = state.target;
            state.guaranteedTargetSpawns -= 1;
        } else {
            type = foodKeys[Math.floor(Math.random() * foodKeys.length)];
        }
        const size = clamp(width * 0.06, 42, 54);
        state.foods.push({
            type,
            x: randomBetween(4, Math.max(5, width - size - 4)),
            y: -size - 8,
            size,
            speed: randomBetween(difficulty.minimumSpeed, difficulty.maximumSpeed),
            rotation: randomBetween(-0.18, 0.18),
            spin: randomBetween(-0.5, 0.5)
        });
    }

    function collides(food, character) {
        const inset = food.size * 0.14;
        const characterInset = character.width * 0.12;
        return food.x + inset < character.x + character.width - characterInset
            && food.x + food.size - inset > character.x + characterInset
            && food.y + inset < character.y + character.height
            && food.y + food.size - inset > character.y + characterInset;
    }

    function createCatchEffects(food, correct) {
        const centerX = food.x + food.size / 2;
        const centerY = food.y + food.size / 2;
        const count = reducedMotion.matches ? 3 : correct ? 12 : 6;
        for (let index = 0; index < count; index += 1) {
            const angle = randomBetween(Math.PI, Math.PI * 2);
            const speed = randomBetween(60, correct ? 190 : 110);
            state.particles.push({
                x: centerX,
                y: centerY,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: randomBetween(0.35, 0.65),
                maximumLife: 0.65,
                size: randomBetween(4, 9),
                color: correct ? FOOD[food.type].color : "#8a7469"
            });
        }
        state.floaters.push({
            x: centerX,
            y: centerY - 10,
            text: correct ? "+10" : "Not that one!",
            color: correct ? "#2f7a43" : "#8e4f3f",
            life: 0.85
        });
    }

    function catchFood(food) {
        const correct = food.type === state.target;
        createCatchEffects(food, correct);
        if (correct) {
            const previousSpeedBonus = catchSpeedBonus(state.score);
            state.score += 10;
            const speedIncrease = catchSpeedBonus(state.score) - previousSpeedBonus;
            state.foods.forEach((fallingFood) => {
                fallingFood.speed += speedIncrease;
            });
            state.character.catchPulse = 0.28;
            if (state.score > state.highScore) {
                state.highScore = state.score;
                localStorage.setItem(STORAGE.highScore, String(state.highScore));
            }
            sounds.play("catch");
            chooseTarget();
            announce(`Nice catch! Score ${state.score}. Now catch ${FOOD[state.target].name}.`, 250);
        } else {
            state.character.wrongPulse = 0.24;
            sounds.play("wrong");
            announce(`That was ${FOOD[food.type].name}. Keep looking for ${FOOD[state.target].name}.`, 250);
        }
        updateHud();
    }

    function missFood(food) {
        const wasTarget = food.type === state.target;
        state.splats.push({
            x: food.x + food.size / 2,
            y: groundY + 5,
            width: food.size * randomBetween(0.8, 1.3),
            color: FOOD[food.type].color,
            life: 3.4
        });

        if (wasTarget) {
            state.misses += 1;
            sounds.play("miss");
            updateHud();
            const remaining = MAX_MISSES - state.misses;
            announce(remaining > 0
                ? `Missed ${FOOD[food.type].name}. ${remaining} ${remaining === 1 ? "chance" : "chances"} left.`
                : `Missed ${FOOD[food.type].name}. Game over.`, 150);
            if (state.misses >= MAX_MISSES) finishGame();
        } else {
            sounds.play("wrong");
        }
    }

    function update(dt) {
        if (state.mode !== "playing" || state.paused) return;

        const direction = Number(input.right) - Number(input.left);
        state.character.x = clamp(
            state.character.x + direction * state.character.speed * dt,
            0,
            width - state.character.width
        );

        state.character.catchPulse = Math.max(0, state.character.catchPulse - dt);
        state.character.wrongPulse = Math.max(0, state.character.wrongPulse - dt);

        const difficulty = difficultyForScore(state.score);
        state.spawnTimer += dt;
        while (state.spawnTimer >= difficulty.interval) {
            state.spawnTimer -= difficulty.interval;
            spawnFood();
        }

        for (let index = state.foods.length - 1; index >= 0; index -= 1) {
            const food = state.foods[index];
            food.y += food.speed * dt;
            food.rotation += food.spin * dt;

            if (collides(food, state.character)) {
                state.foods.splice(index, 1);
                catchFood(food);
                continue;
            }

            if (food.y + food.size >= groundY) {
                state.foods.splice(index, 1);
                missFood(food);
                if (state.mode === "gameover") break;
            }
        }

        for (let index = state.particles.length - 1; index >= 0; index -= 1) {
            const particle = state.particles[index];
            particle.life -= dt;
            particle.vy += 360 * dt;
            particle.x += particle.vx * dt;
            particle.y += particle.vy * dt;
            if (particle.life <= 0) state.particles.splice(index, 1);
        }

        for (let index = state.floaters.length - 1; index >= 0; index -= 1) {
            const floater = state.floaters[index];
            floater.life -= dt;
            floater.y -= 34 * dt;
            if (floater.life <= 0) state.floaters.splice(index, 1);
        }

        for (let index = state.splats.length - 1; index >= 0; index -= 1) {
            state.splats[index].life -= dt;
            if (state.splats[index].life <= 0) state.splats.splice(index, 1);
        }
    }

    function drawBackground(time) {
        const sky = ctx.createLinearGradient(0, 0, 0, groundY);
        sky.addColorStop(0, "#9edfec");
        sky.addColorStop(1, "#e7f5cf");
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, width, height);

        const sunX = width * 0.82;
        const sunY = height * 0.18;
        ctx.fillStyle = "rgba(255, 226, 113, 0.8)";
        ctx.beginPath();
        ctx.arc(sunX, sunY, clamp(width * 0.06, 28, 56), 0, Math.PI * 2);
        ctx.fill();

        const drift = reducedMotion.matches ? 0 : (time * 0.004) % (width + 180);
        drawCloud(((width * 0.18 + drift) % (width + 180)) - 90, height * 0.19, 0.8);
        drawCloud(((width * 0.64 + drift * 0.55) % (width + 220)) - 110, height * 0.32, 1.05);

        ctx.fillStyle = "#8cc16a";
        ctx.beginPath();
        ctx.moveTo(0, groundY);
        ctx.quadraticCurveTo(width * 0.22, groundY - 85, width * 0.45, groundY - 22);
        ctx.quadraticCurveTo(width * 0.7, groundY - 105, width, groundY - 28);
        ctx.lineTo(width, groundY);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "#5f9e55";
        ctx.fillRect(0, groundY - 13, width, 18);
        ctx.fillStyle = "#76513b";
        ctx.fillRect(0, groundY + 5, width, height - groundY);

        ctx.strokeStyle = "rgba(255, 240, 184, 0.2)";
        ctx.lineWidth = 3;
        for (let y = groundY + 25; y < height; y += 28) {
            ctx.beginPath();
            ctx.moveTo((y * 3) % 38, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
    }

    function drawCloud(x, y, scale) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
        ctx.beginPath();
        ctx.arc(0, 10, 24, 0, Math.PI * 2);
        ctx.arc(28, 0, 31, 0, Math.PI * 2);
        ctx.arc(62, 12, 23, 0, Math.PI * 2);
        ctx.fillRect(0, 10, 64, 24);
        ctx.fill();
        ctx.restore();
    }

    function drawCharacter(time) {
        const character = state.character;
        const image = characterImages[state.selectedCharacter];
        if (!image || !image.complete) return;

        const moving = input.left || input.right;
        const bob = moving && !state.paused ? Math.sin(time * 0.015) * 3 : 0;
        const catchScale = character.catchPulse > 0 ? 1 + Math.sin(character.catchPulse * 30) * 0.1 : 1;
        const wrongTilt = character.wrongPulse > 0 ? Math.sin(character.wrongPulse * 55) * 0.1 : 0;

        ctx.save();
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = "#3d302b";
        ctx.beginPath();
        ctx.ellipse(character.x + character.width / 2, groundY + 4, character.width * 0.36, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.translate(character.x + character.width / 2, character.y + character.height / 2 + bob);
        ctx.rotate(wrongTilt);
        ctx.scale(catchScale, 2 - catchScale);
        ctx.drawImage(image, -character.width / 2, -character.height / 2, character.width, character.height);
        ctx.restore();
    }

    function drawFood(food) {
        const image = foodImages[food.type];
        if (!image || !image.complete) return;
        ctx.save();
        ctx.translate(food.x + food.size / 2, food.y + food.size / 2);
        ctx.rotate(food.rotation);
        ctx.drawImage(image, -food.size / 2, -food.size / 2, food.size, food.size);
        ctx.restore();
    }

    function drawEffects() {
        state.splats.forEach((splat) => {
            ctx.save();
            ctx.globalAlpha = Math.min(0.72, splat.life / 1.2);
            ctx.fillStyle = splat.color;
            ctx.beginPath();
            ctx.ellipse(splat.x, splat.y, splat.width / 2, 8, -0.08, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });

        state.particles.forEach((particle) => {
            ctx.save();
            ctx.globalAlpha = clamp(particle.life / particle.maximumLife, 0, 1);
            ctx.fillStyle = particle.color;
            ctx.beginPath();
            ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });

        state.floaters.forEach((floater) => {
            ctx.save();
            ctx.globalAlpha = clamp(floater.life / 0.4, 0, 1);
            ctx.fillStyle = floater.color;
            ctx.strokeStyle = "rgba(255, 253, 246, 0.95)";
            ctx.lineWidth = 5;
            ctx.font = "900 18px ui-rounded, system-ui, sans-serif";
            ctx.textAlign = "center";
            ctx.strokeText(floater.text, floater.x, floater.y);
            ctx.fillText(floater.text, floater.x, floater.y);
            ctx.restore();
        });
    }

    function draw(time) {
        drawBackground(time);
        if (state.mode === "playing" || state.mode === "gameover") {
            state.foods.forEach(drawFood);
            drawCharacter(time);
            drawEffects();
        }
    }

    function frame(time) {
        if (lastTime === null) lastTime = time;
        const elapsed = Math.min(0.1, Math.max(0, (time - lastTime) / 1000));
        lastTime = time;

        if (!state.paused) {
            accumulator += elapsed;
            while (accumulator >= FIXED_STEP) {
                update(FIXED_STEP);
                accumulator -= FIXED_STEP;
            }
        }

        draw(time);
        window.requestAnimationFrame(frame);
    }

    function announce(message, delay = 0) {
        window.clearTimeout(announcementTimer);
        announcementTimer = window.setTimeout(() => {
            liveStatus.textContent = "";
            window.setTimeout(() => {
                liveStatus.textContent = message;
            }, 20);
        }, delay);
    }

    function setButtonDirection(button, direction) {
        const start = (event) => {
            if (state.mode !== "playing" || state.paused) return;
            event.preventDefault();
            sounds.ensureContext();
            input[direction] = true;
            button.classList.add("is-pressed");
            if (button.setPointerCapture) button.setPointerCapture(event.pointerId);
        };
        const stop = (event) => {
            if (event) event.preventDefault();
            input[direction] = false;
            button.classList.remove("is-pressed");
        };
        button.addEventListener("pointerdown", start);
        button.addEventListener("pointerup", stop);
        button.addEventListener("pointercancel", stop);
        button.addEventListener("lostpointercapture", stop);
    }

    document.addEventListener("keydown", (event) => {
        const key = event.key.toLowerCase();
        if (["arrowleft", "arrowright", "a", "d", "p", "escape"].includes(key)) {
            if (state.mode === "playing") event.preventDefault();
        }
        if ((key === "p" || key === "escape") && state.mode === "playing" && !event.repeat) {
            togglePause();
            return;
        }
        if (state.mode !== "playing" || state.paused) return;
        if (key === "arrowleft" || key === "a") input.left = true;
        if (key === "arrowright" || key === "d") input.right = true;
    });

    document.addEventListener("keyup", (event) => {
        const key = event.key.toLowerCase();
        if (key === "arrowleft" || key === "a") input.left = false;
        if (key === "arrowright" || key === "d") input.right = false;
    });

    window.addEventListener("blur", () => {
        input.left = false;
        input.right = false;
        if (state.mode === "playing" && !state.paused) togglePause(true);
    });

    document.addEventListener("visibilitychange", () => {
        if (document.hidden && state.mode === "playing" && !state.paused) togglePause(true);
    });

    pauseButton.addEventListener("click", () => togglePause());
    resumeButton.addEventListener("click", () => togglePause(false));
    muteButton.addEventListener("click", () => {
        sounds.setMuted(!state.muted);
        if (!state.muted) sounds.play("catch");
    });
    playAgainButton.addEventListener("click", playAgain);
    chooseCharacterButton.addEventListener("click", showSelection);
    coarsePointer.addEventListener("change", updateTouchControls);
    ["selectstart", "contextmenu", "dragstart"].forEach((eventName) => {
        frameElement.addEventListener(eventName, (event) => event.preventDefault());
    });
    setButtonDirection(moveLeftButton, "left");
    setButtonDirection(moveRightButton, "right");

    buildMissMeter();
    buildCharacterCards();
    updateMuteButton();
    resizeCanvas();
    new ResizeObserver(resizeCanvas).observe(frameElement);
    const previewCharacter = new URLSearchParams(window.location.search).get("play");
    const previewCharacterData = CHARACTERS.find((character) => character.id === previewCharacter);
    if (previewCharacterData && state.highScore >= previewCharacterData.unlockScore) {
        startGame(previewCharacter);
    }
    window.requestAnimationFrame(frame);
})();

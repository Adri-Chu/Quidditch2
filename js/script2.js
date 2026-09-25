
"use strict";

window.addEventListener("DOMContentLoaded", function () {
    const bludgerCountElement = document.getElementById("bludgerCount");
    const minusBludgers = document.getElementById("minusBludgers");
    const plusBludgers = document.getElementById("plusBludgers");

    const canvas = document.getElementById("game");
    const ctx = canvas.getContext("2d");

    const scoreElement = document.getElementById("score");
    const snitchesElement = document.getElementById("snitches");
    const timerElement = document.getElementById("timer");
    const timeBar = document.getElementById("timeBar");

    const startScreen = document.getElementById("startScreen");
    const pauseScreen = document.getElementById("pauseScreen");
    const gameOverScreen = document.getElementById("gameOverScreen");

    const startButton = document.getElementById("startButton");
    const resumeButton = document.getElementById("resumeButton");
    const restartButton = document.getElementById("restartButton");
    const restartPauseButton = document.getElementById("restartPauseButton");

    const finalScore = document.getElementById("finalScore");
    const snitchMessage = document.getElementById("snitchMessage");
    const leaderboardList = document.getElementById("leaderboardList");

    const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0, height = 0, dpr = 1;
    let gameState = "start", score = 0, snitchesCaught = 0, elapsed = 0, lastTime = 0;
    let snitchTimer = 0, snitchActive = false, snitchLife = 0, messageTimer = 0;
    let audioContext = null;

    const keys = {};
    let pointerActive = false, pointerX = 0, pointerY = 0;

    window.addEventListener("keydown", function (event) {
        const key = event.key.toLowerCase();
        keys[key] = true;
        if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
        if (key === "p" || key === "escape") {
            if (gameState === "playing") pauseGame();
            else if (gameState === "paused") resumeGame();
        }
    });

    window.addEventListener("keyup", function (event) { keys[event.key.toLowerCase()] = false; });

    canvas.addEventListener("pointerdown", function (event) {
        if (gameState !== "playing") return;
        pointerActive = true;
        pointerX = event.clientX;
        pointerY = event.clientY;
    });

    canvas.addEventListener("pointermove", function (event) {
        if (!pointerActive || gameState !== "playing") return;
        pointerX = event.clientX;
        pointerY = event.clientY;
    });

    window.addEventListener("pointerup", function () { pointerActive = false; });

    function resizeCanvas() {
        width = window.innerWidth;
        height = window.innerHeight;
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
        canvas.style.width = width + "px";
        canvas.style.height = height + "px";
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();

    function random(min, max) { return Math.random() * (max - min) + min; }
    function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
    function distance(a, b) {
        const dx = a.x - b.x, dy = a.y - b.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    const player = {
        x: 0, y: 0, targetX: 0, targetY: 0, vx: 0, vy: 0,
        radius: 18, speed: 390, invulnerable: 0, blinkTimer: 0, trail: []
    };

    function resetPlayer() {
        player.x = width / 2;
        player.y = height * 0.72;
        player.targetX = player.x;
        player.targetY = player.y;
        player.vx = 0; player.vy = 0;
        player.invulnerable = 0; player.blinkTimer = 0; player.trail = [];
    }

    const bludgers = [];
    let BLUDGER_COUNT = 5;
    minusBludgers.addEventListener("click", function () {
        BLUDGER_COUNT = Math.max(1, BLUDGER_COUNT - 1);
        bludgerCountElement.textContent = BLUDGER_COUNT;
    });
    plusBludgers.addEventListener("click", function () {
        BLUDGER_COUNT = Math.min(15, BLUDGER_COUNT + 1);
        bludgerCountElement.textContent = BLUDGER_COUNT;
    });

    function createBludger() {
        const angle = random(0, Math.PI * 2), speed = random(90, 180);
        return {
            x: random(35, Math.max(36, width - 35)),
            y: random(90, Math.max(91, height - 50)),
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            radius: random(11, 15),
            rotation: random(0, Math.PI * 2)
        };
    }

    function resetBludgers() {
        bludgers.length = 0;
        for (let i = 0; i < BLUDGER_COUNT; i++) bludgers.push(createBludger());
    }

    const snitch = {
        x: 0, y: 0, baseX: 0, baseY: 0, radius: 11, age: 0,
        phaseX: 0, phaseY: 0, speedX: 2, speedY: 1.5, amplitudeX: 90, amplitudeY: 75
    };

    function scheduleSnitch() {
        snitchActive = false;
        snitchTimer = random(2, 5);
    }

    function spawnSnitch() {
        snitchActive = true;
        snitchLife = 5;
        snitch.age = 0;
        snitch.baseX = random(70, Math.max(71, width - 70));
        snitch.baseY = random(130, Math.max(131, height - 90));
        snitch.x = snitch.baseX;
        snitch.y = snitch.baseY;
        snitch.phaseX = random(0, Math.PI * 2);
        snitch.phaseY = random(0, Math.PI * 2);
        snitch.speedX = random(1.5, 2.5);
        snitch.speedY = random(1.2, 2.2);
        showSnitchMessage();
        playSound("snitch");
    }

    function showSnitchMessage() {
        snitchMessage.classList.add("show");
        messageTimer = 2;
    }

    const particles = [];
    function createParticle(x, y, type = "gold") {
        const amount = reducedMotion ? 1 : 2;
        for (let i = 0; i < amount; i++) {
            const angle = random(0, Math.PI * 2), speed = random(40, 180);
            particles.push({
                x: x, y: y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                life: random(0.4, 0.9), maxLife: 0.9, size: random(2, 5), type: type
            });
        }
    }

    function createSnitchExplosion(x, y) {
        const amount = reducedMotion ? 12 : 45;
        for (let i = 0; i < amount; i++) {
            const angle = random(0, Math.PI * 2), speed = random(70, 330);
            particles.push({
                x: x, y: y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                life: random(0.5, 1.2), maxLife: 1.2, size: random(2, 6), type: "gold"
            });
        }
    }

    function addTrail() {
        if (reducedMotion) return;
        player.trail.push({ x: player.x, y: player.y, life: 0.35, size: random(4, 8) });
        if (player.trail.length > 25) player.trail.shift();
    }

    function initAudio() {
        try {
            if (!audioContext) {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (AudioCtx) audioContext = new AudioCtx();
            }
            if (audioContext && audioContext.state === "suspended") audioContext.resume();
        } catch (e) { }
    }

    function playSound(type) {
        if (!audioContext || audioContext.state !== "running") return;
        try {
            const now = audioContext.currentTime;
            const oscillator = audioContext.createOscillator();
            const gain = audioContext.createGain();
            oscillator.connect(gain);
            gain.connect(audioContext.destination);

            if (type === "snitch") {
                oscillator.type = "sine";
                oscillator.frequency.setValueAtTime(520, now);
                oscillator.frequency.exponentialRampToValueAtTime(1040, now + 0.18);
                gain.gain.setValueAtTime(0.0001, now);
                gain.gain.exponentialRampToValueAtTime(0.13, now + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
                oscillator.start(now); oscillator.stop(now + 0.36);
            } else if (type === "hit") {
                oscillator.type = "sawtooth";
                oscillator.frequency.setValueAtTime(150, now);
                oscillator.frequency.exponentialRampToValueAtTime(60, now + 0.18);
                gain.gain.setValueAtTime(0.0001, now);
                gain.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
                oscillator.start(now); oscillator.stop(now + 0.23);
            } else if (type === "catch") {
                oscillator.type = "triangle";
                oscillator.frequency.setValueAtTime(600, now);
                oscillator.frequency.exponentialRampToValueAtTime(1200, now + 0.12);
                oscillator.frequency.exponentialRampToValueAtTime(900, now + 0.3);
                gain.gain.setValueAtTime(0.0001, now);
                gain.gain.exponentialRampToValueAtTime(0.2, now + 0.015);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
                oscillator.start(now); oscillator.stop(now + 0.36);
            }
        } catch (e) { }
    }

    function startGame() {
        initAudio();
        gameState = "playing";
        score = 0; snitchesCaught = 0; elapsed = 0;
        lastTime = performance.now();
        startScreen.style.display = "none";
        startScreen.classList.add("hidden");
        pauseScreen.style.display = "none";
        gameOverScreen.style.display = "none";
        resetPlayer(); resetBludgers(); scheduleSnitch(); updateHUD();
    }

    function pauseGame() {
        if (gameState !== "playing") return;
        gameState = "paused";
        pauseScreen.style.display = "flex";
    }

    function resumeGame() {
        if (gameState !== "paused") return;
        gameState = "playing";
        pauseScreen.style.display = "none";
        lastTime = performance.now();
    }

    function updateLeaderboard(newScore) {
        let scores = JSON.parse(localStorage.getItem("quidditchScores")) || [];
        scores.push(newScore);
        scores.sort((a, b) => b - a);
        scores = scores.slice(0, 5);
        localStorage.setItem("quidditchScores", JSON.stringify(scores));

        leaderboardList.innerHTML = "";
        scores.forEach((s, index) => {
            const li = document.createElement("li");
            li.innerHTML = `<span>#${index + 1}</span> <span>${s} pts</span>`;
            if (s === newScore) {
                li.style.color = "#fff";
                li.style.background = "rgba(246, 200, 95, 0.3)";
            }
            leaderboardList.appendChild(li);
        });
    }

    function endGame() {
        gameState = "gameover";
        snitchMessage.classList.remove("show");
        gameOverScreen.style.display = "flex";
        finalScore.textContent = score;
        updateLeaderboard(score);
    }

    function restartGame() {
        gameState = "start";
        gameOverScreen.style.display = "none";
        pauseScreen.style.display = "none";
        startScreen.classList.remove("hidden");
        startScreen.style.display = "flex";
        score = 0; snitchesCaught = 0; elapsed = 0; lastTime = 0;
        resetPlayer(); resetBludgers(); updateHUD();
    }

    function updatePlayer(dt) {
        let dx = 0, dy = 0;
        if (keys["w"] || keys["arrowup"]) dy -= 1;
        if (keys["s"] || keys["arrowdown"]) dy += 1;
        if (keys["a"] || keys["arrowleft"]) dx -= 1;
        if (keys["d"] || keys["arrowright"]) dx += 1;

        if (dx !== 0 || dy !== 0) {
            const length = Math.sqrt(dx * dx + dy * dy);
            dx /= length; dy /= length;
            player.vx = dx * player.speed;
            player.vy = dy * player.speed;
            player.targetX = player.x + dx * 100;
            player.targetY = player.y + dy * 100;
        } else {
            player.vx *= Math.pow(0.001, dt);
            player.vy *= Math.pow(0.001, dt);
        }

        if (pointerActive) {
            player.targetX = pointerX; player.targetY = pointerY;
            const tx = player.targetX - player.x, ty = player.targetY - player.y;
            const dist = Math.sqrt(tx * tx + ty * ty);
            if (dist > 3) {
                const desiredSpeed = Math.min(player.speed * 1.3, dist * 8);
                player.vx = tx / dist * desiredSpeed;
                player.vy = ty / dist * desiredSpeed;
            }
        }

        player.x += player.vx * dt;
        player.y += player.vy * dt;
        player.x = clamp(player.x, 28, width - 28);
        player.y = clamp(player.y, 85, height - 45);

        if (Math.abs(player.vx) > 20 || Math.abs(player.vy) > 20) {
            addTrail();
            if (!reducedMotion && Math.random() < 0.35) {
                createParticle(player.x - player.vx * 0.025, player.y - player.vy * 0.025, "trail");
            }
        }

        if (player.invulnerable > 0) {
            player.invulnerable -= dt;
            player.blinkTimer += dt;
            if (player.invulnerable <= 0) player.invulnerable = 0;
        }
    }

    function updateBludgers(dt) {
        for (const b of bludgers) {
            b.x += b.vx * dt; b.y += b.vy * dt; b.rotation += dt * 3;
            if (b.x < b.radius) { b.x = b.radius; b.vx *= -1; }
            if (b.x > width - b.radius) { b.x = width - b.radius; b.vx *= -1; }
            if (b.y < 75 + b.radius) { b.y = 75 + b.radius; b.vy *= -1; }
            if (b.y > height - 35 - b.radius) { b.y = height - 35 - b.radius; b.vy *= -1; }

            if (player.invulnerable <= 0 && distance(player, b) < player.radius + b.radius) {
                hitPlayer();
            }
        }
    }

    function hitPlayer() {
        score -= 50;
        player.invulnerable = 1.5;
        player.blinkTimer = 0;
        playSound("hit");
        createSnitchExplosion(player.x, player.y);
        updateHUD();
    }

    function updateSnitch(dt) {
        if (!snitchActive) {
            snitchTimer -= dt;
            if (snitchTimer <= 0) spawnSnitch();
            return;
        }
        snitchLife -= dt; snitch.age += dt;
        const t = snitch.age;
        snitch.x = snitch.baseX + Math.sin(t * snitch.speedX + snitch.phaseX) * snitch.amplitudeX + Math.sin(t * 3.7 + snitch.phaseY) * 30;
        snitch.y = snitch.baseY + Math.sin(t * snitch.speedY + snitch.phaseY) * snitch.amplitudeY + Math.cos(t * 4.2 + snitch.phaseX) * 25;
        snitch.x = clamp(snitch.x, 35, width - 35);
        snitch.y = clamp(snitch.y, 90, height - 55);

        if (distance(player, snitch) < player.radius + snitch.radius + 8) {
            catchSnitch();
            return;
        }
        if (snitchLife <= 0) {
            snitchActive = false;
            scheduleSnitch();
        }
    }

    function catchSnitch() {
        score += 100;
        snitchesCaught++;
        createSnitchExplosion(snitch.x, snitch.y);
        playSound("catch");
        snitchActive = false;
        scheduleSnitch();
        updateHUD();
    }

    function updateParticles(dt) {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.life -= dt;
            p.x += p.vx * dt; p.y += p.vy * dt;
            p.vx *= Math.pow(0.08, dt); p.vy *= Math.pow(0.08, dt);
            p.vy += 20 * dt;
            if (p.life <= 0) particles.splice(i, 1);
        }
    }

    function updateTrail(dt) {
        for (let i = player.trail.length - 1; i >= 0; i--) {
            player.trail[i].life -= dt;
            if (player.trail[i].life <= 0) player.trail.splice(i, 1);
        }
    }

    function update(dt) {
        if (gameState !== "playing") return;
        elapsed += dt;

        if (elapsed >= 60) {
            elapsed = 60;
            endGame();
            return;
        }

        updatePlayer(dt);
        updateBludgers(dt);
        updateSnitch(dt);
        updateParticles(dt);
        updateTrail(dt);

        if (messageTimer > 0) {
            messageTimer -= dt;
            if (messageTimer <= 0) snitchMessage.classList.remove("show");
        }
        updateHUD();
    }

    function updateHUD() {
        scoreElement.textContent = score;
        snitchesElement.textContent = snitchesCaught;
        timerElement.textContent = Math.ceil(60 - elapsed);
        const percentage = Math.max(0, (60 - elapsed) / 60) * 100;
        timeBar.style.width = percentage + "%";
    }

    function drawBackground() {
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, "#071c18");
        gradient.addColorStop(0.5, "#0a2921");
        gradient.addColorStop(1, "#061611");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        ctx.save();
        ctx.globalAlpha = 0.045;
        ctx.strokeStyle = "#e9d7ad";
        ctx.lineWidth = 1;
        const spacing = 80;
        const offset = (elapsed * 25) % spacing;
        for (let x = -spacing + offset; x < width + spacing; x += spacing) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        ctx.restore();
        drawFieldMarkings();
    }

    function drawFieldMarkings() {
        ctx.save();
        ctx.strokeStyle = "rgba(225, 209, 162, 0.11)";
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, height * 0.5); ctx.lineTo(width, height * 0.5); ctx.stroke();
        ctx.beginPath(); ctx.arc(width / 2, height / 2, Math.min(width, height) * 0.18, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(width * 0.16, height * 0.5, 50, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(width * 0.84, height * 0.5, 50, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
    }

    function drawTrail() {
        if (player.trail.length === 0) return;
        ctx.save();
        for (const t of player.trail) {
            const alpha = Math.max(0, t.life / 0.35) * 0.35;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = "#d8ad51";
            ctx.beginPath();
            ctx.arc(t.x, t.y, t.size * (t.life / 0.35), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    function drawBludger(b) {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rotation);

        const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, b.radius * 2.8);
        glow.addColorStop(0, "rgba(255, 70, 70, 0.45)");
        glow.addColorStop(0.45, "rgba(220, 40, 40, 0.18)");
        glow.addColorStop(1, "rgba(220, 40, 40, 0)");
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(0, 0, b.radius * 2.8, 0, Math.PI * 2); ctx.fill();

        const ball = ctx.createRadialGradient(-b.radius * 0.35, -b.radius * 0.35, 1, 0, 0, b.radius);
        ball.addColorStop(0, "#555555");
        ball.addColorStop(0.35, "#292929");
        ball.addColorStop(0.75, "#111111");
        ball.addColorStop(1, "#050505");
        ctx.fillStyle = ball;
        ctx.beginPath(); ctx.arc(0, 0, b.radius, 0, Math.PI * 2); ctx.fill();

        ctx.strokeStyle = "#ff5757"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, b.radius + 2, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
    }

    function drawSnitch() {
        if (!snitchActive) return;
        ctx.save();
        const pulse = 1 + Math.sin(snitch.age * 8) * 0.08;
        ctx.translate(snitch.x, snitch.y);
        ctx.scale(pulse, pulse);

        const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 42);
        glow.addColorStop(0, "rgba(255, 230, 130, 0.5)");
        glow.addColorStop(0.35, "rgba(246, 200, 95, 0.2)");
        glow.addColorStop(1, "rgba(246, 200, 95, 0)");
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(0, 0, 42, 0, Math.PI * 2); ctx.fill();

        const wingMotion = Math.sin(snitch.age * 12) * 0.35;
        ctx.save();
        ctx.rotate(wingMotion);
        ctx.fillStyle = "rgba(255, 235, 170, 0.9)";
        ctx.beginPath(); ctx.ellipse(-17, -2, 20, 6, -0.25, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(17, -2, 20, 6, 0.25, 0, Math.PI * 2); ctx.fill();
        ctx.restore();

        const gold = ctx.createRadialGradient(-3, -4, 1, 0, 0, 13);
        gold.addColorStop(0, "#fff4bb"); gold.addColorStop(0.35, "#f6c85f"); gold.addColorStop(1, "#b77d18");
        ctx.fillStyle = gold;
        ctx.beginPath(); ctx.arc(0, 0, snitch.radius, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }

    function drawPlayer() {
        if (player.invulnerable > 0 && Math.floor(player.blinkTimer * 12) % 2 === 0) return;
        ctx.save();
        ctx.translate(player.x, player.y);

        const angle = Math.atan2(player.vy, player.vx);
        if (Math.abs(player.vx) > 10 || Math.abs(player.vy) > 10) ctx.rotate(angle * 0.08);

        ctx.strokeStyle = "#9c6d35"; ctx.lineWidth = 5; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(-27, 5); ctx.lineTo(25, -4); ctx.stroke();

        ctx.fillStyle = "#203e34";
        ctx.beginPath(); ctx.ellipse(0, -3, 12, 16, 0, 0, Math.PI * 2); ctx.fill();

        ctx.fillStyle = "#d7a77a";
        ctx.beginPath(); ctx.arc(0, -16, 7, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }

    function drawParticles() {
        ctx.save();
        for (const p of particles) {
            ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
            ctx.fillStyle = p.type === "gold" ? "#f6c85f" : "#d6b56a";
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    }

    function render() {
        ctx.clearRect(0, 0, width, height);
        drawBackground();
        drawTrail();
        for (const b of bludgers) drawBludger(b);
        drawSnitch();
        drawParticles();
        drawPlayer();
    }

    function gameLoop(timestamp) {
        if (!lastTime) lastTime = timestamp;
        let dt = (timestamp - lastTime) / 1000;
        lastTime = timestamp;
        dt = Math.min(dt, 0.05);
        update(dt);
        render();
        requestAnimationFrame(gameLoop);
    }

    startButton.addEventListener("click", startGame);
    resumeButton.addEventListener("click", resumeGame);
    restartButton.addEventListener("click", restartGame);
    restartPauseButton.addEventListener("click", restartGame);

    resetPlayer(); resetBludgers(); scheduleSnitch(); updateHUD();
    requestAnimationFrame(gameLoop);
});
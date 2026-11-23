const W = 360, H = 560, LANES = 3, LW = W / LANES;
const cv = document.getElementById("c"), ctx = cv.getContext("2d");
const $ = id => document.getElementById(id);

// Item types stored as an array of objects
const TYPES = [
  { emoji: "🧍", kind: "passenger", pts: 10, weight: 3 },
  { emoji: "👩‍🎓", kind: "passenger", pts: 15, weight: 2 },
  { emoji: "👵", kind: "passenger", pts: 20, weight: 1 },
  { emoji: "⛽", kind: "fuel", weight: 1 },
  { emoji: "🛡️", kind: "shield", weight: 0.5 },
  { emoji: "🧲", kind: "magnet", weight: 0.5 },
  { emoji: "⏳", kind: "slow", weight: 0.5 },
  { emoji: "🚗", kind: "hazard", weight: 4 },
  { emoji: "🚧", kind: "hazard", weight: 3 },
  { emoji: "🕳️", kind: "hazard", weight: 2 }
];
const SCENERY = ["🌴", "🏠", "🏪", "🌳", "💡"];

let game = null, running = false, last = 0, hiScore = 0;

try { hiScore = parseInt(localStorage.getItem("jeepneyDashBest"), 10) || 0; } catch (e) { hiScore = 0; }
$("hs").textContent = "Best " + hiScore;

let audioCtx = null, muted = false;
let intensity = 0, beatT = 0, beatN = 0; // intensity: 0 (slow) to 1 (fastest)
try { muted = localStorage.getItem("jeepneyMuted") === "1"; } catch (e) {}

// Sound effects made with the Web Audio API (no audio files needed)
function tone(freq, dur, type = "square", vol = 0.06, slideTo = null, delay = 0) {
  if (muted) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const t0 = audioCtx.currentTime + delay;
    const o = audioCtx.createOscillator(), v = audioCtx.createGain();
    const m = 1 + intensity * 0.35; vol *= 1 + intensity * 0.5; // sounds get higher and louder as the game speeds up
    o.type = type; o.frequency.setValueAtTime(freq * m, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo * m, t0 + dur);
    v.gain.setValueAtTime(vol, t0); v.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(v); v.connect(audioCtx.destination); o.start(t0); o.stop(t0 + dur);
  } catch (e) {}
}
const SFX = {
  move: () => tone(300, 0.05, "triangle", 0.04, 420),
  pickup: () => { tone(660, 0.08, "square", 0.05); tone(880, 0.12, "square", 0.05, null, 0.07); },
  fuel: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.1, "triangle", 0.07, null, i * 0.06)),
  crash: () => { tone(160, 0.35, "sawtooth", 0.1, 40); tone(90, 0.3, "square", 0.08, 30); },
  levelup: () => [440, 554, 659].forEach((f, i) => tone(f, 0.12, "square", 0.05, null, i * 0.08)),
  over: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.22, "sawtooth", 0.07, null, i * 0.18)),
  start: () => { tone(262, 0.1, "square", 0.05); tone(392, 0.16, "square", 0.05, null, 0.1); },
  combo: m => [523, 659, 784, 1047].slice(0, 2 + Math.min(2, m - 1)).forEach((f, i) => tone(f, 0.09, "square", 0.05, null, i * 0.05)),
  power: () => [392, 523, 659, 784].forEach((f, i) => tone(f, 0.08, "triangle", 0.07, null, i * 0.05)),
  honk: () => { tone(330, 0.25, "sawtooth", 0.07); tone(415, 0.25, "sawtooth", 0.06); },
  near: () => tone(900, 0.07, "sine", 0.05, 1400),
  heart: () => { tone(70, 0.1, "sine", 0.12, 45); tone(70, 0.1, "sine", 0.1, 45, 0.16); }
};

// Engine sound: a rumble that gets higher, brighter and faster with speed
let engine = null;
function engineStart() {
  if (muted) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    engineStop();
    const o = audioCtx.createOscillator(), f = audioCtx.createBiquadFilter(), v = audioCtx.createGain();
    const lfo = audioCtx.createOscillator(), lg = audioCtx.createGain();
    o.type = "sawtooth"; o.frequency.value = 50;
    f.type = "lowpass"; f.frequency.value = 250;
    v.gain.value = 0.03; lfo.frequency.value = 7; lg.gain.value = 0.015;
    lfo.connect(lg); lg.connect(v.gain);
    o.connect(f); f.connect(v); v.connect(audioCtx.destination);
    o.start(); lfo.start();
    const nb = audioCtx.createBuffer(1, audioCtx.sampleRate, audioCtx.sampleRate), d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const ns = audioCtx.createBufferSource(), nf = audioCtx.createBiquadFilter(), ng = audioCtx.createGain();
    ns.buffer = nb; ns.loop = true; nf.type = "highpass"; nf.frequency.value = 1500; ng.gain.value = 0;
    ns.connect(nf); nf.connect(ng); ng.connect(audioCtx.destination); ns.start();
    engine = { o, f, v, lfo, ns, ng };
  } catch (e) {}
}
function engineUpdate() {
  if (!engine) return;
  const t = audioCtx.currentTime;
  engine.o.frequency.setTargetAtTime(50 + intensity * 90, t, 0.1);
  engine.f.frequency.setTargetAtTime(250 + intensity * 900, t, 0.1);
  engine.lfo.frequency.setTargetAtTime(7 + intensity * 20, t, 0.1);
  engine.v.gain.setTargetAtTime(0.03 + intensity * 0.03, t, 0.1);
  engine.ng.gain.setTargetAtTime(rainAmt() * 0.05, t, 0.3);
}
function engineStop() {
  if (!engine) return;
  try { engine.o.stop(); engine.lfo.stop(); engine.ns.stop(); } catch (e) {}
  engine = null;
}

// Visual effects: particles and floating text
function burst(x, y, colors, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 200, life = 0.5 + Math.random() * 0.4;
    game.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life, max: life, color: colors[i % colors.length], size: 3 + Math.random() * 4 });
  }
}
function floatText(text, x, y, color) { game.texts.push({ text, x, y, life: 0.9, color }); }
function flashScreen(color) { game.flash = color; game.flashT = 0.18; }

const nightAmt = () => 0.5 - 0.5 * Math.cos(game.dist / 20000 * Math.PI * 2);               // 0 day, 1 night
const rainAmt = () => Math.max(0, Math.min(1, Math.sin(game.dist / 8000 + 4) * 1.6 - 0.6)); // 0 to 1

// Picking up items: passengers (with combos), fuel, power-ups and hazards
function collect(it, ix, py) {
  const g = game, k = it.type.kind;
  if (k === "passenger") {
    g.combo++;
    const mult = Math.min(5, 1 + Math.floor(g.combo / 3)), pts = it.type.pts * mult;
    g.score += pts; flashScreen("#6bff8a");
    burst(ix, py, ["#6bff8a", "#ffd23f", "#ffffff"], 14);
    floatText("+" + pts + (mult > 1 ? " x" + mult : ""), ix, py - 40, "#6bff8a");
    if (g.combo >= 3 && g.combo % 3 === 0) { floatText("Combo x" + mult + "!", W / 2, 190, "#ff9f1c"); SFX.combo(mult); } else SFX.pickup();
  } else if (k === "fuel") {
    g.score += 25; g.lives = Math.min(3, g.lives + 1); flashScreen("#ffd23f");
    burst(ix, py, ["#ffd23f", "#ff9f1c", "#ffffff"], 22); floatText("+25 ❤️", ix, py - 40, "#ffd23f"); SFX.fuel();
  } else if (k === "shield" || k === "magnet" || k === "slow") {
    if (k === "shield") g.shield = true; else if (k === "magnet") g.magnet = 6; else g.slow = 5;
    flashScreen("#5ac8ff"); burst(ix, py, ["#5ac8ff", "#ffffff"], 18);
    floatText(k === "shield" ? "Shield!" : k === "magnet" ? "Magnet!" : "Slow-mo!", ix, py - 40, "#5ac8ff"); SFX.power();
  } else if (g.shield) {
    g.shield = false; burst(ix, py, ["#5ac8ff", "#ffffff"], 20); floatText("Blocked!", ix, py - 40, "#5ac8ff"); SFX.power();
  } else {
    g.lives--; g.combo = 0; g.shake = 0.35; flashScreen("#ff4d4d");
    burst(ix, py, ["#ff4d4d", "#ff9f1c", "#999999"], 26); floatText("Ouch!", ix, py - 40, "#ff6b6b"); SFX.crash();
  }
}

// Horn: clears hazards ahead in your lane (4 second cooldown)
function honk() {
  if (!running || game.honk > 0) return;
  game.honk = 4; game.shake = 0.15; SFX.honk();
  for (const it of game.items)
    if (it.type.kind === "hazard" && it.lane === game.lane && it.y < H - 130) { burst(it.x, it.y, ["#ffffff", "#ffd23f"], 10); it.dead = true; }
  game.items = game.items.filter(it => !it.dead);
  floatText("HONK!", game.x, H - 150, "#ffffff");
}

function pickType() {
  const total = TYPES.reduce((s, t) => s + t.weight, 0);
  let r = Math.random() * total;
  for (const t of TYPES) { r -= t.weight; if (r <= 0) return t; }
  return TYPES[0];
}

function newGame() {
  return { lane: 1, x: LW * 1.5, score: 0, lives: 3, items: [], spawn: 0, roadY: 0, shake: 0, flash: "", flashT: 0, dist: 0, level: 0, tilt: 0, particles: [], texts: [], smoke: [], scenery: [], smokeT: 0, sceneT: 0, hbT: 0, combo: 0, shield: false, magnet: 0, slow: 0, honk: 0 };
}

function show(id) {
  ["start", "how", "over"].forEach(s => $(s).classList.remove("on"));
  if (id) $(id).classList.add("on");
}

function startGame() {
  game = newGame();
  show(null);
  updateHud();
  intensity = 0; beatT = 0; beatN = 0;
  SFX.start();
  engineStart();
  $("hornBtn").hidden = false;
  running = true;
  last = performance.now();
  requestAnimationFrame(loop);
}

function updateHud() {
  $("sc").textContent = "Score " + game.score;
  $("hs").textContent = "Best " + Math.max(hiScore, game.score);
  $("lv").textContent = "❤️".repeat(game.lives) + "🖤".repeat(3 - game.lives);
  $("lv").classList.toggle("danger", game.lives === 1);
}

function move(dir) {
  if (!running) return;
  const old = game.lane;
  game.lane = Math.max(0, Math.min(LANES - 1, game.lane + dir));
  if (game.lane !== old) SFX.move();
}

function spawnItem() {
  // Each wave drops 1 or 2 items in different lanes, never blocking all 3
  const count = Math.random() < 0.35 + game.score / 1500 ? 2 : 1;
  const lanes = [0, 1, 2].sort(() => Math.random() - 0.5).slice(0, count);
  for (const l of lanes) game.items.push({ lane: l, x: l * LW + LW / 2, y: -40, type: pickType() });
}

function endGame(reason) {
  running = false;
  engineStop();
  $("hornBtn").hidden = true;
  SFX.over();
  let isNew = false;
  if (game.score > hiScore) {
    hiScore = game.score; isNew = true;
    try { localStorage.setItem("jeepneyDashBest", String(hiScore)); } catch (e) {}
  }
  $("reason").textContent = reason;
  $("final").textContent = game.score;
  $("best").textContent = isNew ? "New best score!" : "Best score: " + hiScore;
  show("over");
}

function update(dt) {
  const g = game;
  const speed = Math.min(190 + g.score * 1.6, 480) * (g.slow > 0 ? 0.55 : 1);
  g.roadY = (g.roadY + speed * dt) % 60;
  g.dist += speed * dt;
  // the faster the game, the higher the intensity (0 to 1)
  intensity = Math.max(0, Math.min(1, (speed - 190) / 290));
  engineUpdate();
  // background beat that gets quicker with speed
  beatT -= dt;
  if (beatT <= 0) {
    beatT = 0.62 - intensity * 0.36; beatN++;
    tone(90, 0.1, "sine", 0.07, 50);
    if (beatN % 2) tone(1200, 0.03, "square", 0.012);
  }
  g.x += (g.lane * LW + LW / 2 - g.x) * Math.min(1, dt * 14);

  g.spawn -= dt;
  if (g.spawn <= 0) { spawnItem(); g.spawn = Math.max(0.45, 1.1 - g.score / 600); }

  const py = H - 90;
  for (let i = g.items.length - 1; i >= 0; i--) {
    const it = g.items[i];
    it.y += speed * dt;
    it.x += (it.lane * LW + LW / 2 - it.x) * Math.min(1, dt * 8);
    if (g.magnet > 0 && (it.type.kind === "passenger" || it.type.kind === "fuel") && it.y > 100) it.lane = g.lane;
    if (it.type.kind === "hazard" && !it.near && Math.abs(it.lane - g.lane) === 1 && Math.abs(it.y - py) < 14) {
      it.near = true; g.score += 5; updateHud(); floatText("Close call! +5", g.x, py - 70, "#9be7ff"); SFX.near();
    }
    if (it.lane === g.lane && Math.abs(it.y - py) < 44) {
      collect(it, it.x, py);
      g.items.splice(i, 1);
      updateHud();
      if (g.lives <= 0) { endGame("Your jeepney broke down."); return; }
    } else if (it.y > H + 40) { if (it.type.kind === "passenger") g.combo = 0; g.items.splice(i, 1); }
  }
  // timers, exhaust smoke, roadside scenery, low-heart heartbeat
  g.magnet = Math.max(0, g.magnet - dt); g.slow = Math.max(0, g.slow - dt); g.honk = Math.max(0, g.honk - dt);
  $("hornBtn").style.opacity = g.honk > 0 ? 0.4 : 1;
  g.smokeT -= dt;
  if (g.smokeT <= 0) { g.smokeT = 0.08 - intensity * 0.04; g.smoke.push({ x: g.x + (Math.random() - 0.5) * 12, y: H - 58, r: 4, life: 0.5 }); }
  for (let i = g.smoke.length - 1; i >= 0; i--) {
    const s = g.smoke[i]; s.life -= dt; s.y += (80 + speed * 0.4) * dt; s.r += 16 * dt;
    if (s.life <= 0) g.smoke.splice(i, 1);
  }
  g.sceneT -= dt;
  if (g.sceneT <= 0) { g.sceneT = 0.7; g.scenery.push({ x: Math.random() < 0.5 ? 16 : W - 16, y: -30, e: SCENERY[Math.floor(Math.random() * SCENERY.length)] }); }
  for (let i = g.scenery.length - 1; i >= 0; i--) {
    g.scenery[i].y += speed * dt;
    if (g.scenery[i].y > H + 30) g.scenery.splice(i, 1);
  }
  if (g.lives === 1) { g.hbT -= dt; if (g.hbT <= 0) { g.hbT = 0.8; SFX.heart(); } }
  // level up every 100 points
  const lvl = Math.floor(g.score / 100);
  if (lvl > g.level) { g.level = lvl; floatText("Faster!", W / 2, 150, "#ffd23f"); flashScreen("#ffd23f"); g.shake = 0.25; SFX.levelup(); }
  // update particles and floating texts
  for (let i = g.particles.length - 1; i >= 0; i--) {
    const p = g.particles[i];
    p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 400 * dt;
    if (p.life <= 0) g.particles.splice(i, 1);
  }
  for (let i = g.texts.length - 1; i >= 0; i--) {
    g.texts[i].life -= dt; g.texts[i].y -= 50 * dt;
    if (g.texts[i].life <= 0) g.texts.splice(i, 1);
  }
  // jeep leans toward the lane it is moving to
  g.tilt += ((g.lane * LW + LW / 2 - g.x) / LW * 0.35 - g.tilt) * Math.min(1, dt * 12);
  g.shake = Math.max(0, g.shake - dt);
  g.flashT -= dt;
  if (g.flash && g.flashT <= 0) g.flash = "";
}

function draw() {
  const g = game;
  ctx.save();
  if (g.shake > 0) ctx.translate((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--road");
  ctx.fillRect(0, 0, W, H);
  // lane dashes
  ctx.fillStyle = "#ffd23f";
  for (let l = 1; l < LANES; l++)
    for (let y = -60 + g.roadY; y < H; y += 60) ctx.fillRect(l * LW - 3, y, 6, 30);
  // speed lines at the road edges
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  for (let i = 0; i < 8; i++) {
    const y = (g.dist * 1.4 + i * 97) % H;
    ctx.fillRect(10 + (i % 2) * (W - 22), y, 3, 36);
  }
  ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = "28px serif";
  for (const s of g.scenery) ctx.fillText(s.e, s.x, s.y);
  for (const s of g.smoke) { ctx.fillStyle = "rgba(200,200,200," + (s.life * 0.5) + ")"; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill(); }
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = "42px serif";
  for (const it of g.items) {
    const good = it.type.kind !== "hazard"; // good items glow
    ctx.shadowColor = good ? "#ffd23f" : "transparent"; ctx.shadowBlur = good ? 16 : 0;
    ctx.fillText(it.type.emoji, it.x, it.y);
  }
  ctx.shadowBlur = 0;
  ctx.save(); ctx.translate(g.x, H - 90); ctx.rotate(g.tilt);
  ctx.font = "56px serif"; ctx.fillText("🚌", 0, 0); ctx.restore();
  if (g.shield) { ctx.strokeStyle = "rgba(90,200,255,0.8)"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(g.x, H - 90, 42, 0, Math.PI * 2); ctx.stroke(); }
  // day-night cycle: dusk tint, darkness and headlights
  const night = nightAmt(), dusk = 1 - Math.abs(night - 0.5) * 2;
  ctx.fillStyle = "rgba(255,120,40," + (dusk * 0.12) + ")"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(5,10,40," + (night * 0.5) + ")"; ctx.fillRect(0, 0, W, H);
  if (night > 0.25) {
    const gr = ctx.createLinearGradient(0, H - 100, 0, H - 340);
    gr.addColorStop(0, "rgba(255,240,170," + (0.4 * night) + ")"); gr.addColorStop(1, "rgba(255,240,170,0)");
    ctx.fillStyle = gr; ctx.beginPath();
    ctx.moveTo(g.x - 18, H - 100); ctx.lineTo(g.x + 18, H - 100); ctx.lineTo(g.x + 90, H - 340); ctx.lineTo(g.x - 90, H - 340); ctx.fill();
  }
  const rain = rainAmt();
  if (rain > 0) {
    ctx.strokeStyle = "rgba(190,210,255,0.55)"; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let i = 0; i < 50 * rain; i++) { const rx = (i * 83) % W, ry = (g.dist * 2.2 + i * 61) % H; ctx.moveTo(rx, ry); ctx.lineTo(rx - 4, ry + 14); }
    ctx.stroke();
  }
  if (g.lives === 1) { ctx.fillStyle = "rgba(255,0,0," + (0.07 + 0.05 * Math.sin(g.dist / 40)) + ")"; ctx.fillRect(0, 0, W, H); }
  ctx.textAlign = "left"; ctx.font = "22px serif"; ctx.fillStyle = "#fff";
  ctx.fillText((g.shield ? "🛡️ " : "") + (g.magnet > 0 ? "🧲" + Math.ceil(g.magnet) + " " : "") + (g.slow > 0 ? "⏳" + Math.ceil(g.slow) : ""), 10, H - 16);
  ctx.textAlign = "center";
  if (g.combo >= 3) { ctx.font = "bold 18px Trebuchet MS, Arial"; ctx.fillText("Combo " + g.combo, W / 2, 56); }
  for (const p of g.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.font = "bold 26px Trebuchet MS, Arial"; ctx.lineWidth = 4; ctx.strokeStyle = "#000";
  for (const t of g.texts) {
    ctx.globalAlpha = Math.min(1, t.life * 2); ctx.fillStyle = t.color;
    ctx.strokeText(t.text, t.x, t.y); ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
  if (g.flash) { ctx.fillStyle = g.flash; ctx.globalAlpha = 0.18; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  ctx.restore();
}

function loop(t) {
  if (!running) return;
  const dt = Math.min((t - last) / 1000, 0.05);
  last = t;
  update(dt);
  if (running) { draw(); requestAnimationFrame(loop); }
}

// Controls: keyboard, touch/mouse
document.addEventListener("keydown", e => {
  const k = e.key.toLowerCase();
  if (k === "arrowleft" || k === "a") { move(-1); e.preventDefault(); }
  else if (k === "arrowright" || k === "d") { move(1); e.preventDefault(); }
  else if (running && (k === "h" || k === " " || k === "arrowup")) { honk(); e.preventDefault(); }
  else if ((k === "enter" || k === " ") && !running && !$("how").classList.contains("on")) {
    if (document.activeElement && document.activeElement.tagName === "BUTTON") return;
    startGame();
  }
});
cv.addEventListener("pointerdown", e => {
  const r = cv.getBoundingClientRect();
  move(e.clientX - r.left < r.width / 2 ? -1 : 1);
});

$("playBtn").onclick = startGame;
$("againBtn").onclick = startGame;
$("howBtn").onclick = () => show("how");
$("backBtn").onclick = () => show("start");

function setMute(m) {
  muted = m; $("muteBtn").textContent = m ? "🔇" : "🔊";
  if (m) engineStop(); else if (running) engineStart();
  try { localStorage.setItem("jeepneyMuted", m ? "1" : "0"); } catch (e) {}
}
$("muteBtn").onclick = () => { setMute(!muted); if (!muted) SFX.pickup(); $("muteBtn").blur(); };
setMute(muted);

$("hornBtn").onclick = () => { honk(); $("hornBtn").blur(); };

// stop the engine sound when the tab is hidden
document.addEventListener("visibilitychange", () => {
  if (document.hidden) engineStop(); else if (running) engineStart();
});

// idle road preview behind the start screen
game = newGame(); draw();

const W = 360, H = 560, LANES = 3, LW = W / LANES;
const cv = document.getElementById("c"), ctx = cv.getContext("2d");
const $ = id => document.getElementById(id);

// Item types stored as an array of objects
const TYPES = [
  { emoji: "🧍", kind: "passenger", weight: 5 },
  { emoji: "⛽", kind: "fuel", weight: 1 },
  { emoji: "🚗", kind: "hazard", weight: 4 },
  { emoji: "🚧", kind: "hazard", weight: 3 },
  { emoji: "🕳️", kind: "hazard", weight: 2 }
];

let game = null, running = false, last = 0, hiScore = 0;

try { hiScore = parseInt(localStorage.getItem("jeepneyDashBest"), 10) || 0; } catch (e) { hiScore = 0; }
$("hs").textContent = "Best " + hiScore;

function pickType() {
  const total = TYPES.reduce((s, t) => s + t.weight, 0);
  let r = Math.random() * total;
  for (const t of TYPES) { r -= t.weight; if (r <= 0) return t; }
  return TYPES[0];
}

function newGame() {
  return { lane: 1, x: LW * 1.5, score: 0, lives: 3, items: [], spawn: 0, roadY: 0, shake: 0, flash: "" };
}

function show(id) {
  ["start", "how", "over"].forEach(s => $(s).classList.remove("on"));
  if (id) $(id).classList.add("on");
}

function startGame() {
  game = newGame();
  show(null);
  updateHud();
  running = true;
  last = performance.now();
  requestAnimationFrame(loop);
}

function updateHud() {
  $("sc").textContent = "Score " + game.score;
  $("hs").textContent = "Best " + Math.max(hiScore, game.score);
  $("lv").textContent = "❤️".repeat(game.lives) + "🖤".repeat(3 - game.lives);
}

function move(dir) {
  if (!running) return;
  game.lane = Math.max(0, Math.min(LANES - 1, game.lane + dir));
}

function spawnItem() {
  // Each wave drops 1 or 2 items in different lanes, never blocking all 3
  const count = Math.random() < 0.35 + game.score / 1500 ? 2 : 1;
  const lanes = [0, 1, 2].sort(() => Math.random() - 0.5).slice(0, count);
  for (const l of lanes) game.items.push({ lane: l, y: -40, type: pickType() });
}

function endGame(reason) {
  running = false;
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
  const speed = Math.min(190 + g.score * 1.6, 480);
  g.roadY = (g.roadY + speed * dt) % 60;
  g.x += (g.lane * LW + LW / 2 - g.x) * Math.min(1, dt * 14);

  g.spawn -= dt;
  if (g.spawn <= 0) { spawnItem(); g.spawn = Math.max(0.45, 1.1 - g.score / 600); }

  const py = H - 90;
  for (let i = g.items.length - 1; i >= 0; i--) {
    const it = g.items[i];
    it.y += speed * dt;
    if (it.lane === g.lane && Math.abs(it.y - py) < 44) {
      if (it.type.kind === "passenger") { g.score += 10; g.flash = "#6bff8a"; }
      else if (it.type.kind === "fuel") { g.score += 25; g.lives = Math.min(3, g.lives + 1); g.flash = "#6bff8a"; }
      else { g.lives--; g.shake = 0.3; g.flash = "#ff4d4d"; }
      g.items.splice(i, 1);
      updateHud();
      if (g.lives <= 0) { endGame("Your jeepney broke down."); return; }
    } else if (it.y > H + 40) g.items.splice(i, 1);
  }
  g.shake = Math.max(0, g.shake - dt);
  if (g.flash && g.shake <= 0) g.flash = "";
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
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = "42px serif";
  for (const it of g.items) ctx.fillText(it.type.emoji, it.lane * LW + LW / 2, it.y);
  ctx.font = "56px serif";
  ctx.fillText("🚌", g.x, H - 90);
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

// idle road preview behind the start screen
game = newGame(); draw();

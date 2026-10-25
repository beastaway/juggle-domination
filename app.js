// Juggle Jumps — game logic, screens, progress, alerts.
import { Scene, heroLoop, HORSE_COATS } from "./scene.js";
import * as S from "./audio.js";

// ---------------- config ----------------
const ALERT_EMAIL = "adriene.eastaway@gmail.com";   // where "level cleared" emails go (via FormSubmit)
const GOAL = 100, GOAL_DATE = "2027-02-01";

const WORLDS = [
  { name: "Home Barn", icon: "🏠", drops: 3, color: "#b8352b", targets: { bounce: [15, 20, 25], feet: [15, 20, 25], thighs: [10, 15, 20], all: [15, 20, 25] } },
  { name: "Mountain Meadow", icon: "🌼", drops: 2, color: "#3e8e3a", targets: { bounce: [20, 25, 30], feet: [20, 25, 30], thighs: [15, 20, 25], all: [25, 30, 40] } },
  { name: "Forest Trail", icon: "🌲", drops: 1, color: "#2f5d3a", targets: { bounce: [25, 30, 35], feet: [25, 30, 35], thighs: [20, 25, 30], all: [40, 50, 60] } },
  { name: "Championship Arena", icon: "🏆", drops: 0, color: "#22305a", targets: { bounce: [30, 35, 40], feet: [30, 35, 40], thighs: [25, 30, 35], all: [60, 80, 100] } },
];
const COURSES = [
  { id: "bounce", name: "Bounce juggles", tip: "Touch it, let it bounce once, touch it again." },
  { id: "feet", name: "Feet only", tip: "Laces, toes up, ankle locked. Keep it below your knees." },
  { id: "thighs", name: "Thighs only", tip: "Thigh flat like a table. Pop it to belly-button height." },
  { id: "all", name: "Everything", tip: "Feet, thighs, head — anything but hands." },
];
const PART_NAMES = { foot: "foot", thigh: "thigh", head: "head", chest: "chest", unknown: "touch" };

// ---------------- storage ----------------
const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v ?? d; } catch (e) { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const SET_KEY = "jj-settings-v1";
let settings = Object.assign({ mode: "camera", facing: "user", sens: 1, alerts: true, email: ALERT_EMAIL, name: "Lizzie", horse: "Comet", coat: "chestnut", muted: false, test: false, debug: true }, load(SET_KEY, {}));
const saveSettings = () => save(SET_KEY, settings);
const progKey = () => (settings.test ? "jj-progress-test-v1" : "jj-progress-v1");
let prog = loadProg();
function loadProg() { return Object.assign({ cleared: {}, log: {}, best: 0, alertsSent: 0 }, load(progKey(), {})); }
const saveProg = () => save(progKey(), prog);

const $ = id => document.getElementById(id);
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const dayLog = () => (prog.log[today()] ||= { j: 0, best: 0, clears: 0 });
const key = (w, c) => `${w}-${c}`;
const cleared = (w, c) => prog.cleared[key(w, c)] || 0;
const target = (w, c, l) => (settings.test ? 3 : WORLDS[w].targets[c][l]);
const worldOpen = w => w === 0 || COURSES.every(c => cleared(w - 1, c.id) >= 3);
const worldDone = w => COURSES.every(c => cleared(w, c.id) >= 3);
function nextLevel() {
  for (let w = 0; w < 4; w++) {
    if (!worldOpen(w)) break;
    for (const c of COURSES) if (cleared(w, c.id) < 3) return { w, c: c.id, l: cleared(w, c.id) };
  }
  return null;
}
const curWorld = () => (nextLevel() || { w: 3 }).w;
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

function toast(msg, ms = 2600) {
  const t = $("toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), ms);
}

// ---------------- home ----------------
function renderHome() {
  document.title = "Juggle Jumps";
  const nl = nextLevel();
  const cname = id => COURSES.find(c => c.id === id).name;
  $("continueSub").textContent = nl ? `${WORLDS[nl.w].name} · ${cname(nl.c)} · Level ${nl.l + 1}` : "You beat every world! Replay any level.";
  $("testNote").hidden = !settings.test;
  $("bestNum").textContent = prog.best;
  $("bestBar").style.width = Math.min(100, prog.best) + "%";
  $("bestNote").textContent = prog.best >= GOAL ? "You did it — 100 in a row!" : "Best in a row so far";
  const days = Math.ceil((new Date(GOAL_DATE + "T00:00:00") - new Date()) / 864e5);
  $("daysLeft").textContent = days > 0 ? `${days} days to Feb 1` : "";
  renderChart();
  $("worlds").innerHTML = WORLDS.map((W, w) => {
    const open = worldOpen(w);
    const rows = COURSES.map(c => {
      const n = cleared(w, c.id);
      const nodes = [0, 1, 2].map(l => {
        const st = l < n ? "done" : l === n && open ? "open" : "";
        return `<button class="node ${st}" data-w="${w}" data-c="${c.id}" data-l="${l}" ${st ? "" : "disabled"} aria-label="${esc(c.name)} level ${l + 1}${st === "done" ? " cleared" : st ? "" : " locked"}">${l < n ? "✓" : target(w, c.id, l)}</button>`;
      }).join("");
      return `<div class="course"><div class="cn"><b>${c.name}</b><span>${n >= 3 ? "All clear!" : open ? `Level ${n + 1} of 3` : "Locked"}</span></div><div class="nodes">${nodes}</div></div>`;
    }).join("");
    const dropTxt = W.drops ? `${W.drops} drop${W.drops > 1 ? "s" : ""} allowed per level` : "No drops allowed";
    return `<div class="world ${open ? "" : "locked"}"><div class="whead" style="background:${W.color}"><span class="wi">${open ? W.icon : "🔒"}</span><div><h2>${W.name}</h2><p>${dropTxt}${worldDone(w) ? " · ✓ complete" : ""}</p></div></div>${rows}</div>`;
  }).join("");
}

function renderChart() {
  const svg = $("chart"), W = svg.clientWidth || 320, H = 120;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const days = Object.keys(prog.log).sort().slice(-21);
  if (!days.length) { svg.innerHTML = `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="currentColor" opacity=".6" font-size="15">Your daily best will show up here</text>`; return; }
  const top = Math.max(GOAL, ...days.map(d => prog.log[d].best));
  const pad = 22, bw = Math.min(28, (W - pad - 6) / days.length - 4);
  const y = v => H - 18 - (v / top) * (H - 30);
  let out = `<line x1="${pad}" x2="${W}" y1="${y(GOAL)}" y2="${y(GOAL)}" stroke="#c98b0b" stroke-dasharray="5 4" stroke-width="2"/><text x="${pad - 4}" y="${y(GOAL) + 4}" text-anchor="end" font-size="11" fill="#c98b0b">100</text>`;
  days.forEach((d, i) => {
    const v = prog.log[d].best, x = pad + 4 + i * (bw + 4);
    out += `<rect x="${x}" y="${y(v)}" width="${bw}" height="${Math.max(2, H - 18 - y(v))}" rx="4" fill="#2f8a3e"/>`;
    if (days.length <= 10 || i % 3 === 0 || i === days.length - 1) out += `<text x="${x + bw / 2}" y="${H - 4}" text-anchor="middle" font-size="11" fill="currentColor" opacity=".7">${+d.slice(5, 7)}/${+d.slice(8)}</text>`;
    out += `<text x="${x + bw / 2}" y="${y(v) - 3}" text-anchor="middle" font-size="11" fill="currentColor">${v}</text>`;
  });
  svg.innerHTML = out;
}

// ---------------- play ----------------
const scene = new Scene($("scene"));
let P = null;      // current level state
let cam = null;    // JuggleCam
let wake = null;

function show(id) { for (const s of ["home", "play"]) $(s).hidden = s !== id; }

function startLevel(w, c, l) {
  S.initAudio();
  const W = WORLDS[w], C = COURSES.find(x => x.id === c);
  P = { w, c, l, target: target(w, c, l), allow: W.drops, count: 0, drops: 0, run: 0, levelBest: 0, hist: [], started: false, over: false };
  $("pTitle").textContent = `${C.name} · Level ${l + 1}`;
  $("pSub").textContent = `${W.name} · ${W.drops ? W.drops + " drop" + (W.drops > 1 ? "s" : "") + " allowed" : "no drops allowed"}`;
  $("tip").textContent = C.tip;
  show("play");
  scene.setWorld(w); scene.setCoat(settings.coat); scene.reset(P.target); scene.start();
  hero?.stop();
  renderHud();
  const camMode = settings.mode === "camera";
  $("tapCtrl").hidden = camMode; $("camCtrl").hidden = !camMode; $("camBox").hidden = !camMode;
  requestWake();
  if (camMode && cam && cam.running) { cam.moveTo($("camVideo"), $("camDbg")); cam.setCourse(c); cam.arm(false); readyCard(); }
  else if (camMode) cameraSetup(); else readyCard();
}

function renderHud() {
  const el = $("count");
  el.innerHTML = `${P.count}<small> / ${P.target}</small>`;
  $("prog").style.width = Math.min(100, (P.count / P.target) * 100) + "%";
  const left = P.allow - P.drops;
  let h = "";
  if (P.allow === 0) h = `<span class="zero">No drops<br>allowed!</span>`;
  else for (let i = 0; i < P.allow; i++) h += `<span class="${i < left ? "" : "lost"}" title="drops left">🧲</span>`;
  $("shoes").innerHTML = h.replaceAll("🧲", horseshoe());
  $("shoes").setAttribute("aria-label", P.allow ? `${Math.max(0, left)} of ${P.allow} drops left` : "No drops allowed");
  $("statusTxt").textContent = P.run > 0 && P.run !== P.count ? `${P.run} in a row` : "";
}
const horseshoe = () => `<svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3 C2 10 3 19 12 21 C21 19 22 10 19 3 L15.5 3.5 C17.5 9 17 15.5 12 16.5 C7 15.5 6.5 9 8.5 3.5 Z" fill="#9aa3ad" stroke="#5d6670" stroke-width="1.2"/><circle cx="6.3" cy="9" r=".9" fill="#5d6670"/><circle cx="17.7" cy="9" r=".9" fill="#5d6670"/><circle cx="7.6" cy="14" r=".9" fill="#5d6670"/><circle cx="16.4" cy="14" r=".9" fill="#5d6670"/></svg>`;

function readyCard() {
  const C = COURSES.find(x => x.id === P.c);
  overlay(`<h2>Ready, ${esc(settings.name)}?</h2>
    <p><b>${P.target}</b> juggles · ${C.name}</p>
    <p class="small">${P.allow ? `You can drop the ball ${P.allow} time${P.allow > 1 ? "s" : ""}. Drop it ${P.allow + 1} times and the level starts over.` : "One drop and the level starts over. Every juggle has to be in a row!"}</p>
    <p class="small">${settings.mode === "camera" && cam && cam.running ? "The camera is watching. Use <b>+1</b> or <b>−1</b> if it gets one wrong." : "Tap <b>Juggle!</b> for every touch and <b>Drop</b> when the ball hits the ground."}</p>
    <button class="btn go" id="goBtn">Go!</button>`);
  $("goBtn").onclick = () => { closeOverlay(); countdown(); };
}

function countdown(done) {
  const cd = $("cd"); let n = 3; cd.hidden = false; cd.textContent = n; S.beep();
  const h = setInterval(() => {
    n--;
    if (n > 0) { cd.textContent = n; S.beep(); }
    else { clearInterval(h); cd.textContent = "Go!"; S.beep(true); P.started = true; if (cam) cam.arm(true); setTimeout(() => (cd.hidden = true), 600); done?.(); }
  }, 800);
}

function juggle(part) {
  if (!P || !P.started || P.over) return;
  P.count++; P.run++; P.levelBest = Math.max(P.levelBest, P.run);
  const d = dayLog(); d.j++;
  if (P.run > d.best) d.best = P.run;
  if (P.run > prog.best) prog.best = P.run;
  P.hist.push({ t: "j" });
  saveProg();
  scene.juggle();
  S.juggleSound(P.count);
  const el = $("count"); el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump");
  if (part && part !== "unknown" && P.c === "all") $("tip").textContent = `Nice ${PART_NAMES[part]} touch!`;
  renderHud();
  if (P.count >= P.target) levelClear();
}

function drop(why) {
  if (!P || !P.started || P.over) return;
  P.drops++;
  P.hist.push({ t: "d", run: P.run });
  P.run = 0;
  const final = P.drops > P.allow;
  scene.trip(final);
  S.dropSound(final);
  if (navigator.vibrate) navigator.vibrate(final ? [200, 100, 300] : 150);
  renderHud();
  if (final) { P.over = true; setTimeout(levelFail, 1700); }
  else {
    const left = P.allow - P.drops;
    $("tip").textContent = left ? `${left} drop${left > 1 ? "s" : ""} left — keep going!` : "No drops left! Every juggle counts now.";
  }
}

function undo() {
  if (!P || !P.hist.length) return;
  const h = P.hist.pop();
  if (h.t === "j") {
    P.count--; P.run = Math.max(0, P.run - 1);
    const d = dayLog(); d.j = Math.max(0, d.j - 1);
    scene.unjuggle();
  } else { P.drops--; P.run = h.run; scene.state = "run"; scene.bubble = null; }
  saveProg();
  P.over = false;
  renderHud();
  toast("Undid last " + (h.t === "j" ? "juggle" : "drop"));
}

function levelClear() {
  P.over = true;
  if (cam) cam.arm(false);
  const k = key(P.w, P.c);
  const first = cleared(P.w, P.c) === P.l;
  if (first) prog.cleared[k] = P.l + 1;
  dayLog().clears++;
  saveProg();
  scene.win();
  setTimeout(() => { S.fanfare(); S.whinny(1.3); }, 350);
  sendAlert();
  const worldNowDone = first && worldDone(P.w) && P.w < 3;
  const allDone = first && P.w === 3 && worldDone(3);
  setTimeout(() => {
    const nl = nextLevel();
    const sameCourseNext = P.l < 2 ? { w: P.w, c: P.c, l: P.l + 1 } : null;
    const nxt = sameCourseNext && cleared(P.w, P.c) >= P.l + 1 ? sameCourseNext : nl;
    const C = COURSES.find(x => x.id === P.c);
    let head = `<div class="rosette">🏅</div><h2>Level clear!</h2><p>${esc(settings.horse)} cleared every fence on ${C.name} Level ${P.l + 1}.</p>`;
    if (worldNowDone) head = `<div class="rosette">🎉</div><h2>${WORLDS[P.w].name} complete!</h2><p>Next stop: <b>${WORLDS[P.w + 1].name}</b>. Only ${WORLDS[P.w + 1].drops || "no"} drop${WORLDS[P.w + 1].drops === 1 ? "" : "s"} allowed there!</p>`;
    if (allDone) head = `<div class="rosette">🏆</div><h2>Champion!</h2><p>${esc(settings.name)} and ${esc(settings.horse)} beat the Championship Arena!</p>`;
    overlay(`${head}
      <div class="stats"><div><b>${P.count}</b><span>juggles</span></div><div><b>${P.drops}</b><span>drops</span></div><div><b>${P.levelBest}</b><span>best in a row</span></div></div>
      ${nxt ? `<button class="btn go" id="nextBtn">Next: ${COURSES.find(x => x.id === nxt.c).name} L${nxt.l + 1}</button>` : ""}
      <button class="btn gold" id="againBtn">Play this level again</button>
      <button class="btn" id="mapBtn">Back to map</button>`);
    if (nxt) $("nextBtn").onclick = () => { closeOverlay(); startLevel(nxt.w, nxt.c, nxt.l); };
    $("againBtn").onclick = () => { closeOverlay(); startLevel(P.w, P.c, P.l); };
    $("mapBtn").onclick = () => { closeOverlay(); quit(); };
  }, 1800);
}

function levelFail() {
  if (cam) cam.arm(false);
  overlay(`<div class="rosette">🐴💫</div><h2>${esc(settings.horse)} took a tumble!</h2>
    <p>${P.allow ? `That was drop number ${P.drops} — only ${P.allow} allowed here.` : "No drops allowed in the Arena."}</p>
    <div class="stats"><div><b>${P.count}</b><span>juggles</span></div><div><b>${P.levelBest}</b><span>best in a row</span></div></div>
    <button class="btn go" id="retryBtn">Try again</button>
    <button class="btn" id="undoFail">That wasn't a drop (undo)</button>
    <button class="btn" id="mapBtn2">Back to map</button>`);
  $("retryBtn").onclick = () => { closeOverlay(); startLevel(P.w, P.c, P.l); };
  $("undoFail").onclick = () => { closeOverlay(); undo(); if (cam) cam.arm(true); };
  $("mapBtn2").onclick = () => { closeOverlay(); quit(); };
}

function quit() {
  P = null;
  if (cam) { cam.arm(false); }
  scene.stop();
  releaseWake();
  show("home"); renderHome(); hero?.start();
}

// ---------------- camera ----------------
async function getCam() {
  if (cam) return cam;
  const { JuggleCam } = await import("./camera.js");
  cam = new JuggleCam($("camVideo"), $("camDbg"), {
    onEvent: e => {
      if (!P) return;
      if (e.type === "touch") juggle(e.part);
      else if (e.type === "drop") drop(e.why);
      else if (e.type === "wrong") { S.bonk(); $("tip").textContent = P.c === "feet" ? `That was a ${PART_NAMES[e.part]} — feet only!` : `That was a ${PART_NAMES[e.part]} — thighs only!`; }
      else if (e.type === "nobounce") { S.bonk(); $("tip").textContent = "Let it bounce once between touches!"; }
    },
    onStatus: m => { const t = $("camTag"); if (t) t.textContent = m; const s = $("setupMsg"); if (s) s.textContent = m; },
    onSeen: s => {
      const b = $("chkBody"), ba = $("chkBall");
      if (b) { b.classList.toggle("ok", s.body); ba.classList.toggle("ok", s.ball); }
      seenNow = s;
    },
  });
  cam.setSensitivity(settings.sens);
  return cam;
}
let seenNow = { body: false, ball: false, fps: 0 };
setInterval(() => {
  if (!cam || !cam.running || $("play").hidden) return;
  $("camTag").textContent = `${seenNow.body ? "✓ body" : "✗ body"} · ${seenNow.ball ? "✓ ball" : "✗ ball"} · ${seenNow.fps} fps`;
}, 500);

async function cameraSetup() {
  overlay(`<h2>Camera setup</h2>
    <p class="small">Prop the phone up about <b>3 big steps away</b>, about waist high. Your <b>whole body and the ball</b> should fit on screen.</p>
    <div class="setup-cam"><video id="setupVideo" playsinline muted></video><canvas id="setupDbg"></canvas></div>
    <div class="checks"><span id="chkBody">Body</span><span id="chkBall">Ball</span></div>
    <p class="small" id="setupMsg">Starting camera…</p>
    <button class="btn go" id="camGo">Start</button>
    <button class="btn" id="flipCam">Switch to ${settings.facing === "user" ? "back" : "front"} camera</button>
    <button class="btn" id="useTap">Use tap buttons instead</button>`);
  $("useTap").onclick = () => { closeOverlay(); cam?.stop(); settings.mode = "tap"; saveSettings(); $("tapCtrl").hidden = false; $("camCtrl").hidden = true; $("camBox").hidden = true; readyCard(); };
  $("flipCam").onclick = () => { settings.facing = settings.facing === "user" ? "environment" : "user"; saveSettings(); cam?.stop(); cameraSetup(); };
  $("camGo").onclick = () => {
    closeOverlay();
    if (cam && cam.running) { cam.moveTo($("camVideo"), $("camDbg")); cam.setCourse(P.c); }
    countdown();
  };
  try {
    const c = await getCam();
    c.video = $("setupVideo"); c.canvas = $("setupDbg");
    if (!c.running) await c.start(settings.facing);
    else c.moveTo($("setupVideo"), $("setupDbg"));
    c.setCourse(P.c); c.debug = true;
    const m = $("setupMsg"); if (m) m.textContent = `Counter ready (${c.m.delegate === "GPU" ? "fast mode" : "standard mode"}).`;
  } catch (e) {
    console.error(e);
    const m = $("setupMsg");
    if (m) m.innerHTML = `<b>Camera counting isn't working here</b> (${esc(e.message || e)}). You can still play with the tap buttons.`;
    $("camGo").hidden = true;
  }
}

// ---------------- alerts ----------------
async function sendAlert() {
  if (!settings.alerts || !settings.email) return;
  const W = WORLDS[P.w], C = COURSES.find(x => x.id === P.c), d = dayLog();
  const line = `${settings.name} cleared ${W.name} · ${C.name} · Level ${P.l + 1}!`;
  try {
    const r = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(settings.email)}`, {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        _subject: `${settings.test ? "[Test] " : ""}🐴 ${line}`, _template: "table", _captcha: "false",
        Message: line, Juggles: P.count, Drops: `${P.drops} of ${P.allow} allowed`, "Best in a row (this level)": P.levelBest,
        "Best in a row (ever)": prog.best, "Juggles today": d.j, "Levels cleared today": d.clears,
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok && (j.success === "true" || j.success === true)) toast("📧 Sent a level-clear email");
    else if (/activat/i.test(j.message || "")) toast("📧 Check your inbox once to switch on alerts", 4000);
  } catch (e) { /* offline: skip quietly */ }
}

// ---------------- overlays & settings ----------------
function overlay(html) { $("ovCard").innerHTML = html; $("ov").hidden = false; }
function closeOverlay() { $("ov").hidden = true; }

function openSettings() {
  const seg = (name, opts, cur) => `<div class="seg" data-set="${name}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(cur) === String(v) ? "on" : ""}">${l}</button>`).join("")}</div>`;
  overlay(`<div class="sheet"><h2>Settings</h2>
    <div class="field"><b>Counting</b>${seg("mode", [["camera", "📷 Camera"], ["tap", "👆 Tap buttons"]], settings.mode)}
      <p class="small">Camera: the phone watches and counts. Tap: someone taps Juggle and Drop.</p></div>
    <div class="field"><b>Camera</b>${seg("facing", [["user", "Front (see the game)"], ["environment", "Back"]], settings.facing)}
      <label class="sw"><input type="checkbox" id="sDebug" ${settings.debug ? "checked" : ""}> Show what the camera sees</label>
      <b style="margin-top:8px">Counting sensitivity</b>
      <input type="range" id="sSens" min="0.6" max="1.6" step="0.1" value="${settings.sens}">
      <p class="small">Missing touches? Slide right. Counting extra? Slide left.</p></div>
    <div class="field"><b>Player and horse</b>
      <input type="text" id="sName" value="${esc(settings.name)}" aria-label="Player name" placeholder="Player name">
      <input type="text" id="sHorse" value="${esc(settings.horse)}" aria-label="Horse name" placeholder="Horse name" style="margin-top:8px">
      <div style="margin-top:8px">${seg("coat", Object.keys(HORSE_COATS).map(k => [k, k[0].toUpperCase() + k.slice(1)]), settings.coat)}</div></div>
    <div class="field"><b>Level-clear emails</b>
      <label class="sw"><input type="checkbox" id="sAlerts" ${settings.alerts ? "checked" : ""}> Email when a level is cleared</label>
      <input type="email" id="sEmail" value="${esc(settings.email)}" aria-label="Alert email">
      <p class="small">The very first email asks you to confirm once.</p></div>
    <div class="field"><b>Test mode</b>
      <label class="sw"><input type="checkbox" id="sTest" ${settings.test ? "checked" : ""}> Only 3 juggles per level (separate progress)</label></div>
    <div class="field"><b>Sound</b><label class="sw"><input type="checkbox" id="sMute" ${settings.muted ? "checked" : ""}> Mute all sounds</label>
      <button class="btn" id="sTestSnd">Hear the sounds</button></div>
    <button class="btn go" id="sDone">Done</button>
    <button class="btn danger" id="sReset">Reset ${settings.test ? "test" : "all"} progress</button>
  </div>`);
  document.querySelectorAll("#ovCard .seg").forEach(sg => sg.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    settings[sg.dataset.set] = b.dataset.v; saveSettings();
    sg.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
  }));
  $("sTestSnd").onclick = () => { S.initAudio(); S.juggleSound(1); setTimeout(() => S.juggleSound(5), 500); setTimeout(() => S.dropSound(false), 1400); setTimeout(() => { S.fanfare(); S.whinny(1.2); }, 3600); };
  $("sDone").onclick = () => {
    settings.name = $("sName").value.trim() || "Lizzie";
    settings.horse = $("sHorse").value.trim() || "Comet";
    settings.email = $("sEmail").value.trim();
    settings.alerts = $("sAlerts").checked;
    settings.debug = $("sDebug").checked;
    settings.sens = +$("sSens").value;
    settings.muted = $("sMute").checked; S.setMuted(settings.muted); $("muteBtn").textContent = settings.muted ? "🔇" : "🔊";
    const wasTest = settings.test; settings.test = $("sTest").checked;
    saveSettings();
    if (wasTest !== settings.test) prog = loadProg();
    if (cam) { cam.setSensitivity(settings.sens); cam.debug = settings.debug; if (!settings.debug) cam.canvas.getContext("2d").clearRect(0, 0, 9999, 9999); }
    closeOverlay(); renderHome();
  };
  $("sReset").onclick = () => {
    const b = $("sReset");
    if (b.dataset.sure) { prog = { cleared: {}, log: {}, best: 0 }; saveProg(); closeOverlay(); renderHome(); toast("Progress reset"); }
    else { b.dataset.sure = "1"; b.textContent = "Tap again to really reset"; }
  };
}

// ---------------- wake lock ----------------
async function requestWake() { try { wake = await navigator.wakeLock?.request("screen"); } catch (e) {} }
function releaseWake() { try { wake?.release(); } catch (e) {} wake = null; }
document.addEventListener("visibilitychange", () => { if (!document.hidden && P) requestWake(); });

// ---------------- wiring ----------------
$("continueBtn").onclick = () => { const n = nextLevel() || { w: 3, c: "all", l: 2 }; startLevel(n.w, n.c, n.l); };
$("worlds").addEventListener("click", e => { const b = e.target.closest(".node"); if (!b || b.disabled) return; startLevel(+b.dataset.w, b.dataset.c, +b.dataset.l); });
$("openSettings").onclick = openSettings;
$("quitBtn").onclick = quit;
$("jugBtn").addEventListener("pointerdown", e => { e.preventDefault(); juggle(); });
$("dropBtn").addEventListener("pointerdown", e => { e.preventDefault(); drop("tap"); });
$("plusBtn").onclick = () => juggle();
$("camDropBtn").onclick = () => drop("tap");
$("minusBtn").onclick = () => { if (P?.hist.length && P.hist[P.hist.length - 1].t === "j") undo(); };
$("undoBtn").onclick = undo;
$("muteBtn").onclick = () => { settings.muted = !settings.muted; saveSettings(); S.setMuted(settings.muted); $("muteBtn").textContent = settings.muted ? "🔇" : "🔊"; };
$("camBox").onclick = () => $("camBox").classList.toggle("big");
S.setMuted(settings.muted); $("muteBtn").textContent = settings.muted ? "🔇" : "🔊";

let hero = heroLoop($("heroCv"), curWorld, () => settings.coat);
renderHome();
window.addEventListener("resize", () => { if (!$("home").hidden) renderChart(); });

if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});

// test hooks (used by automated checks)
window.__jj = { juggle, drop, undo, startLevel, get P() { return P; }, settings, scene };

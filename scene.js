// Juggle Jumps — the horse, the fences and the four worlds, drawn on a canvas.

export const HORSE_COATS = {
  paint: { body: "#7a4524", shade: "#5a3218", mane: "#2a1a12", socks: true, blaze: true, patches: "#fbf7ef", legs: "#fbf7ef", farLegs: "#d8d0c2" },
  chestnut: { body: "#b8662c", shade: "#8c4a1c", mane: "#4a2814", socks: true, blaze: true },
  bay: { body: "#8a4b26", shade: "#653414", mane: "#1d1410", socks: false, blaze: true },
  black: { body: "#2c2a2b", shade: "#171617", mane: "#0b0b0b", socks: true, blaze: true },
  palomino: { body: "#e0b45a", shade: "#b98a33", mane: "#f6efdc", socks: true, blaze: true },
  gray: { body: "#c9c7c4", shade: "#9b9894", mane: "#6f6c69", socks: false, blaze: false },
};

const WORLD_ART = [
  { // Home Barn
    sky: ["#7cc7f0", "#d4effb"], hills: ["#9cbfa6", "#7fae8a"], ground: "#7bbf4e", ground2: "#5ea33a", path: "#c9a26b",
  },
  { // Mountain Meadow
    sky: ["#6fb8ea", "#e5f4ff"], hills: ["#a7b9cf", "#8ec07a"], ground: "#8fcc55", ground2: "#6fb03a", path: "#cfae78",
  },
  { // Forest Trail
    sky: ["#a7d3e6", "#f2e9cf"], hills: ["#6f8f87", "#3f6b4c"], ground: "#5d8f3c", ground2: "#46762b", path: "#9b7b4f",
  },
  { // Championship Arena
    sky: ["#203a74", "#5f7fc4"], hills: ["#2c3f6e", "#2c3f6e"], ground: "#d9b98a", ground2: "#c7a370", path: "#e3c79a",
  },
];

const easeOut = t => 1 - (1 - t) * (1 - t);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Scene {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext("2d");
    this.world = 0;
    this.coat = HORSE_COATS.chestnut;
    this.target = 15;
    this.horseName = "";
    this.reset();
    this._loop = this._loop.bind(this);
    this.running = false;
  }
  setCoat(c) { this.coat = HORSE_COATS[c] || HORSE_COATS.chestnut; }
  setWorld(i) { this.world = clamp(i, 0, 3); }
  reset(target = this.target) {
    this.target = target;
    this.jumps = 0;          // fences cleared
    this.wx = 0;             // world scroll (in fence units)
    this.queue = 0;          // juggles waiting to be animated
    this.jumpT = -1;         // 0..1 progress of current jump
    this.jumpDur = 0.55;
    this.state = "run";      // run | trip | down | getup | win | fail
    this.stateT = 0;
    this.particles = [];
    this.pops = [];
    this.bubble = null;
    this.lastJuggle = -9;
    this.time = 0;
    this.gait = 0;
    this.fallen = false;
  }
  start() { if (!this.running) { this.running = true; this.prev = performance.now(); requestAnimationFrame(this._loop); } }
  stop() { this.running = false; }

  juggle() {
    if (this.state === "down" || this.state === "fail" || this.state === "win") this.state = "run";
    const gap = this.time - this.lastJuggle;
    this.lastJuggle = this.time;
    this.jumpDur = clamp(gap * 0.85, 0.32, 0.6);
    this.queue++;
  }
  unjuggle() {
    if (this.queue > 0) this.queue--;
    else if (this.jumps > 0) { this.jumps--; this.wx = this.jumps; }
  }
  trip(final = false) {
    this.queue = 0;
    if (this.jumpT >= 0) { this.jumps++; this.wx = this.jumps; this.jumpT = -1; }
    this.state = "trip"; this.stateT = 0; this.final = final;
    this.bubble = { text: final ? "Oh nooo!" : ["Oh no!", "Whoa!", "Oops!", "Neigh!"][Math.floor(Math.random() * 4)], t: 0 };
  }
  win() { this.state = "win"; this.stateT = 0; this.bubble = { text: "Hooray!", t: 0 }; }

  _loop(now) {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.prev) / 1000);
    this.prev = now;
    this.update(dt);
    this.draw();
    requestAnimationFrame(this._loop);
  }

  update(dt) {
    this.time += dt;
    this.stateT += dt;
    const idle = this.time - this.lastJuggle > 2.5;
    this.gait += dt * (this.jumpT >= 0 ? 0 : idle ? 5 : 11);
    if (this.jumpT < 0 && this.queue > 0 && (this.state === "run" || this.state === "win")) {
      this.queue--; this.jumpT = 0; this.jumpStartX = this.wx;
      if (this.queue > 2) { this.jumpDur = 0.28; }
    }
    if (this.jumpT >= 0) {
      this.jumpT += dt / this.jumpDur;
      this.wx = this.jumpStartX + Math.min(1, this.jumpT);
      if (this.jumpT >= 1) {
        this.jumpT = -1; this.jumps++; this.wx = this.jumps;
        this._dust(0.5, 6);
        this.pops.push({ text: String(this.jumps), t: 0 });
        if (this.jumps % 5 === 0) this._sparkle(14);
      }
    }
    if (this.state === "trip" && this.stateT > 0.55) { this.state = "down"; this.stateT = 0; this._dust(0.62, 14); }
    if (this.state === "down" && !this.final && this.stateT > 1.4) { this.state = "getup"; this.stateT = 0; }
    if (this.state === "getup" && this.stateT > 0.5) { this.state = "run"; this.stateT = 0; }
    if (this.state === "win" && Math.random() < 0.6) this._confetti(3);
    for (const p of this.particles) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g || 0) * dt; p.rot = (p.rot || 0) + (p.vr || 0) * dt; }
    this.particles = this.particles.filter(p => p.t < p.life);
    for (const p of this.pops) p.t += dt;
    this.pops = this.pops.filter(p => p.t < 0.9);
    if (this.bubble) { this.bubble.t += dt; if (this.bubble.t > 1.8 && !(this.final && this.state === "down")) this.bubble = null; }
  }

  // geometry helpers (computed each frame from canvas size)
  _geom() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.cv.clientWidth, h = this.cv.clientHeight;
    if (this.cv.width !== Math.round(w * dpr) || this.cv.height !== Math.round(h * dpr)) {
      this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
    }
    const s = clamp(Math.min(w / 300, h / 280), 0.6, 2);  // horse scale
    return { w, h, dpr, s, gy: h * 0.78, hx: w * 0.3, spacing: Math.max(190, w * 0.62) };
  }

  draw() {
    const g = this._geom(), c = this.ctx;
    c.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
    const A = WORLD_ART[this.world];
    const scroll = this.wx * g.spacing + this.time * 6; // px, gentle drift for clouds
    this._background(c, g, A, scroll);
    // fences
    for (let k = Math.max(1, Math.floor(this.wx) - 1); k <= Math.min(this.target, Math.floor(this.wx) + 4); k++) {
      const x = g.hx + (k - 0.5 - this.wx) * g.spacing;
      if (x < -120 || x > g.w + 120) continue;
      this._fence(c, x, g.gy, g.s, k, k === this.target);
    }
    // horse
    this._horse(c, g);
    // particles
    for (const p of this.particles) this._particle(c, p);
    for (const p of this.pops) {
      c.globalAlpha = 1 - p.t / 0.9;
      c.font = `800 ${Math.round(28 * g.s)}px "Baloo 2", system-ui, sans-serif`;
      c.fillStyle = "#fff"; c.strokeStyle = "rgba(0,0,0,.35)"; c.lineWidth = 4; c.textAlign = "center";
      const y = g.gy - 150 * g.s - p.t * 50;
      c.strokeText(p.text, g.hx, y); c.fillText(p.text, g.hx, y);
      c.globalAlpha = 1;
    }
    if (this.bubble) this._bubble(c, g, this.bubble.text);
  }

  _background(c, g, A, scroll) {
    const { w, h, gy } = g;
    let grd = c.createLinearGradient(0, 0, 0, gy);
    grd.addColorStop(0, A.sky[0]); grd.addColorStop(1, A.sky[1]);
    c.fillStyle = grd; c.fillRect(0, 0, w, h);
    if (this.world === 3) { this._arenaBack(c, g, scroll); }
    else {
      // sun + clouds
      c.fillStyle = this.world === 2 ? "#ffd98a" : "#fff3b0";
      c.beginPath(); c.arc(w * 0.82, gy * 0.22, 22 * g.s, 0, 7); c.fill();
      c.fillStyle = "rgba(255,255,255,.9)";
      for (let i = 0; i < 4; i++) {
        const x = ((i * 260 - scroll * 0.05) % (w + 300) + w + 300) % (w + 300) - 150;
        const y = gy * (0.12 + 0.1 * (i % 2));
        this._cloud(c, x, y, g.s * (0.8 + 0.2 * (i % 3)));
      }
      // Wasatch mountains: two parallax ranges
      this._mountains(c, g, scroll * 0.06, gy * 0.42, A.hills[0], 0.9, 1);
      if (this.world !== 2) this._snowcaps(c, g, scroll * 0.06, gy * 0.42);
      this._mountains(c, g, scroll * 0.14, gy * 0.62, A.hills[1], 0.55, 2);
      // world scenery
      const off = scroll * 0.45;
      if (this.world === 0) this._barnRow(c, g, off);
      if (this.world === 1) this._meadowRow(c, g, off);
      if (this.world === 2) this._forestRow(c, g, off);
    }
    // ground
    c.fillStyle = A.ground; c.fillRect(0, gy - 6, w, h - gy + 6);
    c.fillStyle = A.path; c.fillRect(0, gy + 4, w, 18 * g.s);
    c.fillStyle = A.ground2;
    const tuft = 46;
    for (let x = -((scroll) % tuft); x < w; x += tuft) {
      c.fillRect(x, gy + 26 * g.s, 14, 4); c.fillRect(x + 22, gy + 40 * g.s, 10, 4);
    }
    if (this.world === 3) { // arena rail
      c.fillStyle = "#fff"; c.fillRect(0, gy - 30 * g.s, w, 5 * g.s);
      for (let x = -((scroll) % 90); x < w; x += 90) c.fillRect(x, gy - 30 * g.s, 5 * g.s, 26 * g.s);
    }
  }
  _cloud(c, x, y, s) {
    c.beginPath(); c.arc(x, y, 14 * s, 0, 7); c.arc(x + 16 * s, y - 8 * s, 17 * s, 0, 7); c.arc(x + 34 * s, y, 13 * s, 0, 7); c.rect(x, y - 2 * s, 34 * s, 14 * s); c.fill();
  }
  _mountains(c, g, off, baseY, color, amp, seed) {
    const { w, gy } = g;
    c.fillStyle = color; c.beginPath(); c.moveTo(0, gy);
    const step = 8;
    for (let x = 0; x <= w + step; x += step) {
      const u = (x + off) / 140;
      const y = baseY - amp * gy * 0.22 * (0.55 + 0.3 * Math.sin(u * 1.3 + seed) + 0.25 * Math.sin(u * 2.9 + seed * 2) + 0.12 * Math.sin(u * 6.1));
      c.lineTo(x, y);
    }
    c.lineTo(w, gy); c.closePath(); c.fill();
  }
  _snowcaps(c, g, off, baseY) {
    const { w, gy } = g;
    c.fillStyle = "rgba(255,255,255,.85)";
    const step = 8;
    for (let x = 0; x <= w; x += step) {
      const u = (x + off) / 140, f = (0.55 + 0.3 * Math.sin(u * 1.3 + 1) + 0.25 * Math.sin(u * 2.9 + 2) + 0.12 * Math.sin(u * 6.1));
      if (f > 0.95) { const y = baseY - 0.9 * gy * 0.22 * f; c.fillRect(x, y, step, (f - 0.95) * 60); }
    }
  }
  _barnRow(c, g, off) {
    const { w, gy } = g, s = g.s * 0.7, span = 640;
    for (let i = -1; i < w / span + 2; i++) {
      const x = i * span - (off % span);
      // barn
      const bx = x + 60, by = gy - 6, bw = 120 * s, bh = 80 * s;
      c.fillStyle = "#b8352b"; c.fillRect(bx, by - bh, bw, bh);
      c.beginPath(); c.moveTo(bx - 8 * s, by - bh); c.lineTo(bx + bw / 2, by - bh - 46 * s); c.lineTo(bx + bw + 8 * s, by - bh); c.closePath();
      c.fillStyle = "#7d241d"; c.fill();
      c.strokeStyle = "#fff"; c.lineWidth = 4 * s;
      c.strokeRect(bx + bw * 0.32, by - bh * 0.62, bw * 0.36, bh * 0.62);
      c.beginPath(); c.moveTo(bx + bw * 0.32, by - bh * 0.62); c.lineTo(bx + bw * 0.68, by); c.moveTo(bx + bw * 0.68, by - bh * 0.62); c.lineTo(bx + bw * 0.32, by); c.stroke();
      c.fillStyle = "#fff"; c.fillRect(bx + bw * 0.42, by - bh - 26 * s, bw * 0.16, 14 * s);
      // silo
      c.fillStyle = "#9aa3ad"; c.fillRect(bx + bw + 10 * s, by - bh * 1.35, 34 * s, bh * 1.35);
      c.beginPath(); c.arc(bx + bw + 27 * s, by - bh * 1.35, 17 * s, Math.PI, 0); c.fillStyle = "#7c858f"; c.fill();
      // round trees
      for (const tx of [x + 330, x + 420, x + 520]) this._roundTree(c, tx, gy - 6, s * (0.9 + ((tx / 97) % 0.3)));
    }
  }
  _roundTree(c, x, y, s) {
    c.fillStyle = "#6b4a2b"; c.fillRect(x - 4 * s, y - 34 * s, 8 * s, 34 * s);
    c.fillStyle = "#3f8d3f"; c.beginPath(); c.arc(x, y - 52 * s, 26 * s, 0, 7); c.fill();
    c.fillStyle = "#55a24c"; c.beginPath(); c.arc(x - 8 * s, y - 58 * s, 14 * s, 0, 7); c.fill();
  }
  _meadowRow(c, g, off) {
    const { w, gy } = g, s = g.s * 0.7, span = 420;
    for (let i = -1; i < w / span + 2; i++) {
      const x = i * span - (off % span);
      for (const [dx, k] of [[40, 1], [70, 0.8], [250, 1.1], [290, 0.9], [330, 1]]) this._aspen(c, x + dx, gy - 6, s * k);
    }
    // wildflowers
    const fs = 26, cols = ["#f05a7e", "#ffd23f", "#b28dff", "#ffffff"];
    for (let x = -((off * 1.4) % fs), i = 0; x < w; x += fs, i++) {
      const k = Math.floor((x + off * 1.4) / fs);
      c.fillStyle = cols[((k % 4) + 4) % 4]; c.beginPath(); c.arc(x, gy - 2 - (k % 3) * 3, 3.2 * s, 0, 7); c.fill();
    }
  }
  _aspen(c, x, y, s) {
    c.fillStyle = "#f4f1ea"; c.fillRect(x - 3 * s, y - 70 * s, 6 * s, 70 * s);
    c.fillStyle = "#333"; for (let k = 1; k < 5; k++) c.fillRect(x - 3 * s, y - k * 15 * s, 4 * s, 2 * s);
    c.fillStyle = "#f2c230"; c.beginPath(); c.ellipse(x, y - 80 * s, 17 * s, 28 * s, 0, 0, 7); c.fill();
    c.fillStyle = "#e6a91f"; c.beginPath(); c.ellipse(x + 6 * s, y - 74 * s, 9 * s, 14 * s, 0, 0, 7); c.fill();
  }
  _forestRow(c, g, off) {
    const { w, gy } = g, s = g.s * 0.7, span = 90;
    for (let i = -1; i < w / span + 2; i++) {
      const k = Math.floor(off / span) + i;
      const x = i * span - (off % span);
      const sc = s * (0.8 + 0.35 * Math.abs(Math.sin(k * 1.7)));
      this._pine(c, x, gy - 6, sc, k % 2 ? "#2f5d3a" : "#24502f");
    }
  }
  _pine(c, x, y, s, col) {
    c.fillStyle = "#5a3d22"; c.fillRect(x - 4 * s, y - 20 * s, 8 * s, 20 * s);
    c.fillStyle = col;
    for (let k = 0; k < 3; k++) {
      const ty = y - 18 * s - k * 26 * s, tw = (34 - k * 8) * s;
      c.beginPath(); c.moveTo(x - tw, ty); c.lineTo(x, ty - 44 * s); c.lineTo(x + tw, ty); c.closePath(); c.fill();
    }
  }
  _arenaBack(c, g, scroll) {
    const { w, gy, s } = g;
    // lights
    c.fillStyle = "rgba(255,255,220,.9)";
    for (const lx of [w * 0.15, w * 0.85]) { c.fillRect(lx - 2, gy * 0.05, 4, gy * 0.3); c.beginPath(); c.arc(lx, gy * 0.05, 9 * s, 0, 7); c.fill(); }
    // grandstand
    const top = gy * 0.38;
    c.fillStyle = "#3a4a7a"; c.fillRect(0, top, w, gy - top);
    const off = scroll * 0.3, cols = ["#f05a5a", "#ffd23f", "#5ad1f0", "#ffffff", "#8be05a", "#ff9ad5", "#ffb04a"];
    const sp = 14 * s;
    for (let row = 0; row < 6; row++) {
      const y = top + 12 * s + row * 16 * s;
      c.fillStyle = "#2c3a64"; c.fillRect(0, y + 7 * s, w, 4 * s);
      for (let x = -((off) % sp) - sp; x < w + sp; x += sp) {
        const k = Math.floor((x + off) / sp) * 7 + row * 13;
        const bob = this.state === "win" ? Math.abs(Math.sin(this.time * 9 + k)) * 5 * s : 0;
        c.fillStyle = cols[((k % 7) + 7) % 7];
        c.beginPath(); c.arc(x, y - bob, 4.5 * s, 0, 7); c.fill();
      }
    }
    // banner
    c.fillStyle = "#c7372f"; c.fillRect(0, top - 6 * s, w, 12 * s);
    c.fillStyle = "#fff"; c.font = `800 ${Math.round(10 * s)}px "Baloo 2",sans-serif`; c.textAlign = "left";
    for (let x = -((scroll * 0.3) % 220); x < w; x += 220) c.fillText("★ CHAMPIONSHIP ★", x, top + 3.5 * s);
  }

  _fence(c, x, gy, s, k, final) {
    const h = 46 * s, wd = 50 * s;
    const W = this.world;
    if (final) {
      // golden finish jump with flags
      c.fillStyle = "#c98b0b"; c.fillRect(x - wd / 2 - 6 * s, gy - h - 26 * s, 7 * s, h + 26 * s); c.fillRect(x + wd / 2, gy - h - 26 * s, 7 * s, h + 26 * s);
      for (let i = 0; i < 3; i++) { c.fillStyle = i % 2 ? "#fff" : "#f2b632"; c.fillRect(x - wd / 2, gy - h + i * 13 * s, wd, 7 * s); }
      c.fillStyle = "#f2b632"; c.beginPath(); c.moveTo(x + wd / 2 + 7 * s, gy - h - 26 * s); c.lineTo(x + wd / 2 + 30 * s, gy - h - 18 * s); c.lineTo(x + wd / 2 + 7 * s, gy - h - 10 * s); c.fill();
      c.font = `800 ${Math.round(14 * s)}px "Baloo 2",sans-serif`; c.fillStyle = "#7a4f00"; c.textAlign = "center";
      c.fillText("FINISH", x, gy - h - 32 * s);
      return;
    }
    if (W === 0) { // white rail fence
      c.fillStyle = "#fff"; c.strokeStyle = "#c9c2b0"; c.lineWidth = 1.5;
      for (const px of [x - wd / 2, x + wd / 2 - 7 * s]) { c.fillRect(px, gy - h - 4 * s, 7 * s, h + 4 * s); c.strokeRect(px, gy - h - 4 * s, 7 * s, h + 4 * s); }
      for (const ry of [gy - h + 2 * s, gy - h * 0.55]) { c.fillRect(x - wd / 2 - 4 * s, ry, wd + 8 * s, 7 * s); c.strokeRect(x - wd / 2 - 4 * s, ry, wd + 8 * s, 7 * s); }
    } else if (W === 1) { // hay bales
      for (const [bx, by] of [[-wd / 2, 0], [0, 0], [-wd / 4, -1]]) {
        const yy = gy - (by ? 2 : 1) * 22 * s;
        c.fillStyle = "#e8c35a"; c.fillRect(x + bx, yy, wd / 2, 22 * s);
        c.strokeStyle = "#b8902e"; c.lineWidth = 2; c.strokeRect(x + bx, yy, wd / 2, 22 * s);
        c.beginPath(); c.moveTo(x + bx + wd / 8, yy); c.lineTo(x + bx + wd / 8, yy + 22 * s); c.moveTo(x + bx + wd * 3 / 8, yy); c.lineTo(x + bx + wd * 3 / 8, yy + 22 * s); c.stroke();
      }
    } else if (W === 2) { // log on stumps
      c.fillStyle = "#6b4a2b"; c.fillRect(x - wd / 2, gy - 22 * s, 12 * s, 22 * s); c.fillRect(x + wd / 2 - 12 * s, gy - 22 * s, 12 * s, 22 * s);
      c.fillStyle = "#8a6239"; c.beginPath(); c.roundRect(x - wd / 2 - 8 * s, gy - 40 * s, wd + 16 * s, 18 * s, 9 * s); c.fill();
      c.fillStyle = "#c79a64"; c.beginPath(); c.ellipse(x + wd / 2 + 6 * s, gy - 31 * s, 5 * s, 9 * s, 0, 0, 7); c.fill();
      c.fillStyle = "#4c8a3c"; c.beginPath(); c.arc(x - wd / 4, gy - 40 * s, 5 * s, 0, 7); c.fill();
    } else { // show-jump poles
      for (const px of [x - wd / 2 - 6 * s, x + wd / 2]) { c.fillStyle = "#fff"; c.fillRect(px, gy - h - 12 * s, 7 * s, h + 12 * s); c.fillStyle = "#1f3f8a"; c.fillRect(px, gy - h - 12 * s, 7 * s, 8 * s); }
      for (const [ry, a, b] of [[gy - h, "#d8432f", "#fff"], [gy - h * 0.55, "#1f3f8a", "#fff"]]) {
        for (let i = 0; i < 6; i++) { c.fillStyle = i % 2 ? b : a; c.fillRect(x - wd / 2 + i * wd / 6, ry, wd / 6 + 0.5, 7 * s); }
      }
      c.fillStyle = "#3f8d3f"; c.fillRect(x - wd / 2, gy - 10 * s, wd, 10 * s);
      c.fillStyle = "#ff6fa8"; for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(x - wd / 2 + 6 * s + i * wd / 5, gy - 10 * s, 4 * s, 0, 7); c.fill(); }
    }
    if (k % 5 === 0) { // number board
      c.fillStyle = "#22305a"; c.beginPath(); c.roundRect(x - 15 * s, gy - h - 34 * s, 30 * s, 22 * s, 5 * s); c.fill();
      c.fillStyle = "#fff"; c.font = `800 ${Math.round(15 * s)}px "Baloo 2",sans-serif`; c.textAlign = "center";
      c.fillText(String(k), x, gy - h - 17.5 * s);
    }
  }

  // ---------- the horse ----------
  _horse(c, g) {
    const { s, hx, gy } = g;
    let y = gy, rot = 0, legs = "run", bob = 0;
    const ph = this.gait;
    if (this.jumpT >= 0) {
      const t = this.jumpT;
      y = gy - Math.sin(Math.PI * t) * 62 * s;
      rot = -0.32 * Math.cos(Math.PI * t);      // nose up on take-off, down on landing
      legs = "jump";
    } else if (this.state === "trip") {
      const t = easeOut(clamp(this.stateT / 0.55, 0, 1));
      rot = 1.15 * t; legs = "trip";
    } else if (this.state === "down") {
      rot = 0; legs = "down";
    } else if (this.state === "getup") {
      legs = "getup";
    } else if (this.state === "win") {
      rot = -0.45 * Math.max(0, Math.sin(this.stateT * 3)); legs = rot < -0.1 ? "rear" : "run";
    } else {
      bob = Math.abs(Math.sin(ph)) * 4 * s;
    }
    c.save();
    if (legs === "down") {
      c.translate(hx, gy); c.scale(s, s);
      this._horseBody(c, ph, "down");
      this._stars(c);
    } else if (legs === "getup") {
      const t = clamp(this.stateT / 0.5, 0, 1);
      c.translate(hx, gy); c.scale(s, s);
      this._horseBody(c, ph, "getup", t);
    } else if (legs === "trip") {
      // pivot over the front hooves and tip forward
      c.translate(hx + 30 * s, y); c.rotate(rot); c.translate(-30 * s, 0); c.scale(s, s);
      this._horseBody(c, ph, "trip");
    } else if (legs === "rear") {
      c.translate(hx - 30 * s, y); c.rotate(rot); c.translate(30 * s, 0); c.scale(s, s);
      this._horseBody(c, ph, "rear");
    } else {
      c.translate(hx, y - bob); c.rotate(rot); c.scale(s, s);
      this._horseBody(c, ph, legs);
    }
    c.restore();
  }

  _leg(c, x, y, a1, a2, len1, len2, col, sock) {
    // a1: upper leg angle from straight down (+ = forward); a2: joint bend added for the lower leg
    const kx = x + Math.sin(a1) * len1, ky = y + Math.cos(a1) * len1;
    const fx = kx + Math.sin(a1 + a2) * len2, fy = ky + Math.cos(a1 + a2) * len2;
    c.strokeStyle = col; c.lineCap = "round"; c.lineJoin = "round";
    c.lineWidth = 12; c.beginPath(); c.moveTo(x, y); c.lineTo(kx, ky); c.stroke();
    c.lineWidth = 7; c.beginPath(); c.moveTo(kx, ky); c.lineTo(fx, fy); c.stroke();
    if (sock) { c.strokeStyle = "#f7f3ea"; c.lineWidth = 7.5; c.beginPath(); c.moveTo(kx + (fx - kx) * 0.5, ky + (fy - ky) * 0.5); c.lineTo(fx, fy); c.stroke(); }
    c.save(); c.translate(fx, fy); c.rotate(a1 + a2); c.fillStyle = "#2a2220"; c.beginPath(); c.roundRect(-5, -1, 10, 7, 2); c.fill(); c.restore();
  }

  _legAngles(mode, ph, t) {
    // order: front-far, hind-far, front-near, hind-near; each [upper, bend]
    if (mode === "jump") return [[1.25, -2.3], [-0.95, -0.35], [1.05, -2.1], [-0.8, -0.3]];
    if (mode === "trip") return [[0.7, -2.1], [-0.35, 0], [0.4, -1.8], [-0.2, 0.1]];
    if (mode === "down" || mode === "getup") {
      const k = mode === "down" ? 1 : 1 - t;
      return [[1.5 * k, -2.9 * k], [1.3 * k, -2.6 * k], [1.4 * k, -2.8 * k], [1.2 * k, -2.5 * k]];
    }
    if (mode === "rear") { const p = Math.sin(this.time * 10); return [[1.0 + 0.3 * p, -1.7], [0.15, -0.1], [1.2 - 0.3 * p, -1.9], [0.05, -0.05]]; }
    const sw = o => Math.sin(ph + o) * 0.55;
    const lift = o => Math.max(0, Math.sin(ph + o + 1.6));
    const front = o => [sw(o), -lift(o) * 1.5];
    const hind = o => [0.2 - sw(o) * 0.9, -0.3 - lift(o) * 0.5];
    return [front(0), hind(0.9), front(Math.PI), hind(0.9 + Math.PI)];
  }

  _bodyPath(c) {
    c.beginPath();
    c.moveTo(-46, -56);
    c.bezierCurveTo(-56, -64, -55, -86, -40, -90);   // rump (trim)
    c.bezierCurveTo(-26, -93, -10, -85, 8, -87);     // back
    c.bezierCurveTo(18, -89, 26, -96, 34, -106);     // withers into crest
    c.bezierCurveTo(40, -116, 48, -123, 56, -125);   // crest to poll
    c.bezierCurveTo(66, -121, 76, -109, 83, -99);    // face
    c.bezierCurveTo(86, -93, 81, -88, 74, -89);      // muzzle
    c.bezierCurveTo(68, -90, 64, -96, 60, -100);     // jaw
    c.bezierCurveTo(56, -95, 52, -86, 49, -75);      // throat
    c.bezierCurveTo(47, -62, 41, -50, 30, -48);      // chest
    c.bezierCurveTo(10, -44, -18, -44, -34, -49);    // belly
    c.bezierCurveTo(-40, -51, -44, -53, -46, -56);
  }

  _horseBody(c, ph, mode, t = 0) {
    const C = this.coat;
    const dy = mode === "down" ? 34 : mode === "getup" ? 34 * (1 - t) : 0;
    c.translate(0, dy);
    const L = this._legAngles(mode, ph, t);
    const J = [[36, -56], [-36, -60], [29, -56], [-30, -60]];
    // far legs (shaded) behind the body
    this._leg(c, J[0][0], J[0][1], L[0][0], L[0][1], 24, 27, C.farLegs || C.shade, false);
    this._leg(c, J[1][0], J[1][1], L[1][0], L[1][1], 24, 27, C.farLegs || C.shade, false);
    // tail
    const wag = Math.sin(this.time * 6) * 4 + (mode === "jump" ? -10 : 0);
    c.strokeStyle = C.mane; c.lineCap = "round";
    c.lineWidth = 9; c.beginPath(); c.moveTo(-48, -82); c.quadraticCurveTo(-70, -70 + wag, -68, -40 + wag); c.stroke();
    c.lineWidth = 5; c.beginPath(); c.moveTo(-50, -80); c.quadraticCurveTo(-78, -64 + wag, -78, -44 + wag); c.stroke();
    // body + neck + head
    c.fillStyle = C.body; this._bodyPath(c); c.fill();
    if (C.patches) { // paint (tobiano) patches
      c.save(); this._bodyPath(c); c.clip(); c.fillStyle = C.patches;
      c.beginPath(); c.ellipse(-6, -52, 30, 12, 0.05, 0, 7); c.fill();          // belly
      c.beginPath(); c.ellipse(-30, -70, 14, 18, -0.3, 0, 7); c.fill();         // hip
      c.beginPath(); c.ellipse(14, -66, 10, 13, 0.4, 0, 7); c.fill();           // shoulder
      c.beginPath(); c.ellipse(40, -84, 7, 12, 0.5, 0, 7); c.fill();            // neck
      c.beginPath(); c.ellipse(-12, -88, 9, 4, 0, 0, 7); c.fill();              // back splash
      c.restore();
    }
    // muzzle shade + nostril
    c.fillStyle = C.shade; c.beginPath(); c.ellipse(78, -94, 7, 6, 0.6, 0, 7); c.fill();
    c.fillStyle = "#1a1210"; c.beginPath(); c.ellipse(80, -96, 1.6, 2.2, 0.6, 0, 7); c.fill();
    if (C.blaze) { c.strokeStyle = "#f7f3ea"; c.lineWidth = 4.5; c.beginPath(); c.moveTo(62, -119); c.quadraticCurveTo(71, -112, 77, -101); c.stroke(); }
    // saddle pad + saddle
    c.fillStyle = "#22305a"; c.beginPath(); c.moveTo(-18, -88); c.quadraticCurveTo(0, -84, 16, -89); c.lineTo(18, -66); c.quadraticCurveTo(0, -62, -18, -66); c.closePath(); c.fill();
    c.fillStyle = "#f2b632"; c.fillRect(-18, -69, 36, 4);
    c.fillStyle = "#5a3a22"; c.beginPath(); c.moveTo(-12, -90); c.quadraticCurveTo(0, -84, 13, -91); c.lineTo(11, -84); c.quadraticCurveTo(0, -80, -10, -84); c.closePath(); c.fill();
    // ear
    c.fillStyle = C.shade; c.beginPath(); c.moveTo(53, -123); c.lineTo(56, -138); c.lineTo(62, -122); c.closePath(); c.fill();
    // eye
    const shut = mode === "down" || mode === "trip";
    c.strokeStyle = "#1a1210"; c.fillStyle = "#1a1210"; c.lineWidth = 2;
    if (shut) { c.beginPath(); c.moveTo(61, -115); c.lineTo(67, -109); c.moveTo(67, -115); c.lineTo(61, -109); c.stroke(); }
    else { c.beginPath(); c.arc(64, -112, 3, 0, 7); c.fill(); c.fillStyle = "#fff"; c.beginPath(); c.arc(65, -113, 1, 0, 7); c.fill(); }
    // mane along the crest
    c.strokeStyle = C.mane; c.lineWidth = 6;
    c.beginPath(); c.moveTo(55, -125); c.bezierCurveTo(46, -121, 38, -112, 30, -98); c.lineTo(22, -90); c.stroke();
    for (let i = 0; i < 5; i++) {
      const u = i / 4, mx = 52 - u * 26, my = -122 + u * 28, flow = Math.sin(this.time * 8 + i) * 2 - (mode === "jump" ? 4 : 0);
      c.lineWidth = 4; c.beginPath(); c.moveTo(mx, my); c.lineTo(mx - 9, my + 5 + flow); c.stroke();
    }
    c.lineWidth = 4; c.beginPath(); c.moveTo(57, -124); c.lineTo(63, -118); c.stroke();
    // rider
    this._rider(c, mode);
    // near legs in front of the body
    this._leg(c, J[2][0], J[2][1], L[2][0], L[2][1], 24, 27, C.legs || C.body, C.socks && !C.legs);
    this._leg(c, J[3][0], J[3][1], L[3][0], L[3][1], 24, 27, C.legs || C.body, C.socks && !C.legs);
  }

  _rider(c, mode) {
    const lean = { jump: 0.6, trip: 0.85, down: 0.25, getup: 0.25, rear: -0.25 }[mode] ?? 0.2;
    const bob = mode === "run" ? Math.abs(Math.sin(this.gait)) * 1.5 : 0;
    const hx = -1, hy = -89 - bob;
    const jersey = "#c8372d", breeches = "#f4f1ea", skin = "#f0c39c", hair = "#7a4a26";
    // leg: thigh forward-down to the knee, shin back to the stirrup
    const knee = mode === "jump" ? [15, -80] : [12, -77], foot = mode === "jump" ? [8, -66] : [6, -62];
    c.lineCap = "round"; c.lineJoin = "round";
    c.strokeStyle = breeches; c.lineWidth = 8; c.beginPath(); c.moveTo(hx, hy); c.lineTo(knee[0], knee[1]); c.lineTo((knee[0] + foot[0]) / 2, (knee[1] + foot[1]) / 2); c.stroke();
    c.strokeStyle = "#1d1a1a"; c.lineWidth = 7; c.beginPath(); c.moveTo((knee[0] + foot[0]) / 2, (knee[1] + foot[1]) / 2); c.lineTo(foot[0], foot[1]); c.lineTo(foot[0] + 5, foot[1] + 1); c.stroke();
    c.strokeStyle = "#9aa3ad"; c.lineWidth = 1.5; c.beginPath(); c.moveTo(2, -84); c.lineTo(foot[0], foot[1] + 3); c.stroke();
    // upper body, rotated around the hip
    c.save(); c.translate(hx, hy); c.rotate(lean);
    c.fillStyle = jersey; c.beginPath(); c.roundRect(-6, -30, 13, 31, 5); c.fill();
    c.fillStyle = "#fff"; c.font = "800 9px sans-serif"; c.textAlign = "center"; c.fillText("10", 0.5, -12);
    // ponytail, head, helmet
    const sw = Math.sin(this.time * 7) * 3 + (mode === "jump" ? 5 : 0);
    c.strokeStyle = hair; c.lineWidth = 5; c.beginPath(); c.moveTo(-5, -40); c.quadraticCurveTo(-13, -38 + sw * 0.3, -15 - sw * 0.4, -28 + sw * 0.3); c.stroke();
    c.fillStyle = skin; c.fillRect(-1.5, -35, 5, 6);
    c.beginPath(); c.arc(1, -41, 7.5, 0, 7); c.fill();
    c.fillStyle = "#1f2a44"; c.beginPath(); c.arc(1, -43, 8.5, Math.PI * 1.02, Math.PI * 1.98); c.closePath(); c.fill();
    c.fillRect(1, -44.5, 10, 2.5);
    c.fillStyle = "#1a1210"; c.beginPath(); c.arc(5, -40.5, 1.2, 0, 7); c.fill();
    const scared = mode === "trip" || mode === "down";
    c.strokeStyle = "#7a2b20"; c.lineWidth = 1.3; c.beginPath();
    if (scared) c.arc(5, -36, 1.8, 0, 7); else c.arc(4.5, -37.5, 2.2, 0.2, Math.PI - 0.6);
    c.stroke();
    // arm to the reins (or waving when celebrating / falling)
    c.strokeStyle = jersey; c.lineWidth = 5.5;
    let hand;
    if (mode === "rear" || scared) { hand = [10, -52]; c.beginPath(); c.moveTo(2, -27); c.lineTo(8, -40); c.lineTo(hand[0], hand[1]); c.stroke(); }
    else { hand = [17, -14]; c.beginPath(); c.moveTo(2, -27); c.lineTo(11, -18); c.lineTo(hand[0], hand[1]); c.stroke(); }
    c.fillStyle = "#1d1a1a"; c.beginPath(); c.arc(hand[0], hand[1], 2.8, 0, 7); c.fill();
    const m = c.getTransform();
    c.restore();
    // reins from the hand to the bit
    if (!(mode === "rear" || scared)) {
      const inv = c.getTransform().inverse(), p = new DOMPoint(hand[0], hand[1]).matrixTransform(m).matrixTransform(inv);
      c.strokeStyle = "#3b2414"; c.lineWidth = 1.6; c.beginPath(); c.moveTo(p.x, p.y); c.quadraticCurveTo((p.x + 74) / 2, (p.y - 92) / 2 + 8, 74, -92); c.stroke();
    }
  }

  _stars(c) {
    for (let i = 0; i < 3; i++) {
      const a = this.time * 4 + i * 2.1, x = 60 + Math.cos(a) * 22, y = -128 + Math.sin(a) * 7;
      this._star(c, x, y, 6, "#ffd23f");
    }
  }
  _star(c, x, y, r, col) {
    c.fillStyle = col; c.beginPath();
    for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.45 : r, a = -Math.PI / 2 + i * Math.PI / 5; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    c.closePath(); c.fill();
  }
  _bubble(c, g, text) {
    const x = g.hx + 70 * g.s, y = g.gy - 175 * g.s;
    c.font = `800 ${Math.round(24 * g.s)}px "Baloo 2",system-ui,sans-serif`;
    const w = c.measureText(text).width + 26;
    c.fillStyle = "#fff"; c.strokeStyle = "#2b2a26"; c.lineWidth = 3;
    c.beginPath(); c.roundRect(x - w / 2, y - 22 * g.s, w, 40 * g.s, 14); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(x - 14, y + 18 * g.s); c.lineTo(x - 26, y + 34 * g.s); c.lineTo(x - 2, y + 18 * g.s); c.fill();
    c.fillStyle = this.state === "win" ? "#2f8a3e" : "#d8432f"; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(text, x, y - 1 * g.s); c.textBaseline = "alphabetic";
  }

  _dust(where, n) {
    const g = this._geom();
    for (let i = 0; i < n; i++) this.particles.push({ kind: "dust", x: g.hx + (Math.random() - 0.3) * 60 * g.s, y: g.gy - 4, vx: (Math.random() - 0.5) * 80, vy: -Math.random() * 40, r: 6 + Math.random() * 8, t: 0, life: 0.6 });
  }
  _sparkle(n) {
    const g = this._geom();
    for (let i = 0; i < n; i++) { const a = Math.random() * 7, v = 80 + Math.random() * 120; this.particles.push({ kind: "star", x: g.hx, y: g.gy - 90 * g.s, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 0.8, r: 5 + Math.random() * 4 }); }
  }
  _confetti(n) {
    const g = this._geom(), cols = ["#f05a5a", "#ffd23f", "#5ad1f0", "#8be05a", "#ff9ad5", "#ffffff"];
    for (let i = 0; i < n; i++) this.particles.push({ kind: "conf", x: Math.random() * g.w, y: -10, vx: (Math.random() - 0.5) * 60, vy: 60 + Math.random() * 80, g: 30, t: 0, life: 4, col: cols[i % cols.length], vr: (Math.random() - 0.5) * 10, rot: 0 });
  }
  _particle(c, p) {
    const k = 1 - p.t / p.life;
    if (p.kind === "dust") { c.fillStyle = `rgba(200,170,120,${0.6 * k})`; c.beginPath(); c.arc(p.x, p.y, p.r * (1.5 - k * 0.5), 0, 7); c.fill(); }
    else if (p.kind === "star") { c.globalAlpha = k; this._star(c, p.x, p.y, p.r, "#ffd23f"); c.globalAlpha = 1; }
    else { c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.fillStyle = p.col; c.fillRect(-4, -2.5, 8, 5); c.restore(); }
  }
}

// small looping horse for the home screen
export function heroLoop(canvas, getWorld, getCoat) {
  const sc = new Scene(canvas);
  sc.reset(9999);
  let next = 1.2;
  const orig = sc.update.bind(sc);
  sc.update = dt => {
    sc.setWorld(getWorld()); sc.setCoat(getCoat());
    next -= dt; if (next <= 0) { sc.juggle(); next = 0.9 + Math.random() * 0.4; }
    orig(dt);
  };
  sc.start();
  return sc;
}

// Juggle Jumps — juggle detector.
// Pure logic: feed it one frame at a time (ball position + body landmarks) and it
// reports events: touch (with body part), bounce, drop, wrong-surface, held.
// Coordinates: x and y in the same units (y grows downward). The camera glue
// scales x by the image aspect so distances are true distances.

// MediaPipe pose landmark indices
export const LM = {
  nose: 0, lEar: 7, rEar: 8, lSh: 11, rSh: 12, lWr: 15, rWr: 16,
  lHip: 23, rHip: 24, lKnee: 25, rKnee: 26, lAnk: 27, rAnk: 28,
  lHeel: 29, rHeel: 30, lToe: 31, rToe: 32,
};

export const COURSE_RULES = {
  bounce: { allowed: ["foot", "thigh", "head", "chest"], needBounce: true },
  feet: { allowed: ["foot"], needBounce: false },
  thighs: { allowed: ["thigh"], needBounce: false },
  all: { allowed: ["foot", "thigh", "head", "chest"], needBounce: false },
};

export const DEFAULTS = {
  sensitivity: 1.0,      // higher = counts gentler touches
  minTouchGap: 0.22,     // s between two touches
  lostDropTime: 2.0,     // s with no ball during a run = drop
  restDropTime: 1.2,     // s of ball sitting still near the ground = drop
  handHoldTime: 0.6,     // s ball near a wrist = caught/held
};

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function distToSeg(p, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y, L = vx * vx + vy * vy || 1e-9;
  let t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / L;
  t = Math.max(0, Math.min(1, t));
  return { d: Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy)), t };
}
const vis = (lm, i) => lm && lm[i] && (lm[i].visibility == null || lm[i].visibility > 0.3);

export class JuggleDetector {
  constructor(course = "all", opts = {}) {
    this.opts = { ...DEFAULTS, ...opts };
    this.setCourse(course);
    this.reset();
  }
  setCourse(c) { this.course = c; this.rules = COURSE_RULES[c] || COURSE_RULES.all; }
  setSensitivity(s) { this.opts.sensitivity = s; }
  reset() {
    this.track = [];         // recent ball samples {t,x,y,r}
    this.footHist = [];      // recent foot samples {t, l:{x,y}, r:{x,y}}
    this.pose = null;
    this.poseT = -1;
    this.H = 0.35;           // body scale: hip-to-ankle length
    this.groundY = null;
    this.phase = "none";     // ball vertical phase: down | up | none
    this.lowest = null;      // lowest sample during current downward phase
    this.active = false;     // a run is in progress
    this.lastEventKind = null; // "touch" | "bounce" (for bounce course)
    this.lastTouchT = -9;
    this.lastSeenT = -9;
    this.restSince = null;
    this.handSince = null;
    this.held = false;
  }

  // ball: {x,y,r} or null. pose: landmark array or null (null = no new pose this frame)
  update(t, ball, pose) {
    const ev = [];
    if (pose) this._updatePose(t, pose);

    if (ball) {
      this.lastSeenT = t;
      this.track.push({ t, x: ball.x, y: ball.y, r: ball.r || 0.02 });
      while (this.track.length && t - this.track[0].t > 0.7) this.track.shift();
      this._checkHand(t, ball, ev);
      if (!this.held) this._checkReversal(t, ev);
      this._checkRest(t, ball, ev);
    } else if (this.active && t - this.lastSeenT > this.opts.lostDropTime) {
      this._drop(t, ev, "lost");
    }
    return ev;
  }

  _updatePose(t, lm) {
    this.pose = lm; this.poseT = t;
    const P = i => lm[i];
    if (vis(lm, LM.lHip) && vis(lm, LM.rHip) && vis(lm, LM.lAnk) && vis(lm, LM.rAnk)) {
      const hip = { x: (P(LM.lHip).x + P(LM.rHip).x) / 2, y: (P(LM.lHip).y + P(LM.rHip).y) / 2 };
      const ank = { x: (P(LM.lAnk).x + P(LM.rAnk).x) / 2, y: (P(LM.lAnk).y + P(LM.rAnk).y) / 2 };
      const h = dist(hip, ank);
      if (h > 0.05) this.H = this.H * 0.85 + h * 0.15;
    }
    // ground = lowest foot point; the standing foot sets it, so take a slow max
    const feet = [LM.lHeel, LM.rHeel, LM.lToe, LM.rToe, LM.lAnk, LM.rAnk].filter(i => vis(lm, i)).map(i => P(i).y);
    if (feet.length) {
      const g = Math.max(...feet);
      if (this.groundY == null) this.groundY = g;
      else this.groundY = g > this.groundY ? this.groundY * 0.5 + g * 0.5 : this.groundY * 0.98 + g * 0.02;
    }
    const foot = (a, h, k) => {
      const pts = [a, h, k].filter(i => vis(lm, i)).map(P);
      if (!pts.length) return null;
      return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
    };
    this.footHist.push({ t, l: foot(LM.lAnk, LM.lHeel, LM.lToe), r: foot(LM.rAnk, LM.rHeel, LM.rToe) });
    while (this.footHist.length && t - this.footHist[0].t > 0.5) this.footHist.shift();
  }

  // vertical velocity from a least-squares fit over the last ~120 ms
  _vy(win = 0.12) {
    const tr = this.track, n = tr.length;
    if (n < 2) return 0;
    const t1 = tr[n - 1].t;
    const s = tr.filter(p => t1 - p.t <= win);
    if (s.length < 2) return (tr[n - 1].y - tr[n - 2].y) / Math.max(1e-3, tr[n - 1].t - tr[n - 2].t);
    const mt = s.reduce((a, p) => a + p.t, 0) / s.length, my = s.reduce((a, p) => a + p.y, 0) / s.length;
    let num = 0, den = 0;
    for (const p of s) { num += (p.t - mt) * (p.y - my); den += (p.t - mt) ** 2; }
    return den ? num / den : 0;
  }

  _checkReversal(t, ev) {
    const vmin = (0.55 / this.opts.sensitivity) * this.H; // body-heights per second
    const vy = this._vy();
    const cur = this.track[this.track.length - 1];
    if (vy > vmin) {
      if (this.phase !== "down") { this.phase = "down"; this.lowest = cur; }
      else if (cur.y >= this.lowest.y) this.lowest = cur;
    } else if (this.phase === "down") {
      if (cur.y >= this.lowest.y) this.lowest = cur;
      if (vy < -vmin) {
        this.phase = "up";
        this._contact(this._contactPoint(this.lowest), ev);
      }
    } else if (vy < -vmin) {
      this.phase = "up";
    }
  }

  // The camera rarely catches the exact moment of contact, so estimate it where
  // the falling line and the rising line of the ball's path cross.
  _contactPoint(low) {
    const fit = pts => {
      const n = pts.length; if (n < 2) return null;
      const mt = pts.reduce((a, p) => a + p.t, 0) / n, my = pts.reduce((a, p) => a + p.y, 0) / n;
      let num = 0, den = 0; for (const p of pts) { num += (p.t - mt) * (p.y - my); den += (p.t - mt) ** 2; }
      if (!den) return null; const m = num / den; return { m, c: my - m * mt };
    };
    const down = fit(this.track.filter(p => p.t <= low.t && low.t - p.t <= 0.13));
    const after = this.track.filter(p => p.t > low.t && p.t - low.t <= 0.15);
    let up = after.length >= 2 ? fit([low, ...after]) : null;
    if (down && after.length && (!up || after.length < 2)) {
      const p = after[0], m = -0.8 * down.m; up = { m, c: p.y - m * p.t };   // assume a near-mirror rebound
    }
    if (!down || !up || down.m <= 0 || up.m >= 0) return low;
    const tc = (up.c - down.c) / (down.m - up.m);
    if (tc < low.t - 0.02 || tc > low.t + 0.1) return low;
    const yc = Math.min(low.y + 0.25 * this.H, Math.max(low.y, down.m * tc + down.c));
    return { ...low, t: tc, y: yc };
  }

  _footSpeedUp(t) {
    // how fast the nearer foot was rising around now (positive = upward), body-heights/s
    const fh = this.footHist;
    // peak upward foot speed over the last ~0.3 s
    const s = fh.filter(f => t - f.t <= 0.3 && f.t <= t + 0.05);
    const peak = k => {
      let best = 0;
      for (let i = 1; i < s.length; i++) {
        const a = s[i - 1], b = s[i];
        if (a[k] && b[k]) best = Math.max(best, (a[k].y - b[k].y) / Math.max(1e-3, b.t - a.t) / this.H);
      }
      return best;
    };
    return { l: peak("l"), r: peak("r") };
  }

  classify(p) {
    const lm = this.pose, H = this.H;
    const bottom = { x: p.x, y: p.y + p.r };
    const res = { part: "none", d: Infinity, atGround: false };
    if (this.groundY != null) res.atGround = bottom.y >= this.groundY - 0.2 * H;
    if (!lm) return res;
    const cands = [];
    const add = (part, d) => cands.push({ part, d: d / H });
    for (const [a, h, k] of [[LM.lAnk, LM.lHeel, LM.lToe], [LM.rAnk, LM.rHeel, LM.rToe]]) {
      const pts = [a, h, k].filter(i => vis(lm, i));
      if (pts.length) add("foot", Math.min(...pts.map(i => dist(bottom, lm[i]))));
      // the shin just above the foot also counts as "foot" (laces/instep area)
      const knee = a === LM.lAnk ? LM.lKnee : LM.rKnee;
      if (vis(lm, a) && vis(lm, knee)) {
        const s = distToSeg(bottom, lm[a], lm[knee]);
        if (s.t < 0.3) add("foot", s.d);
      }
    }
    for (const [hip, knee] of [[LM.lHip, LM.lKnee], [LM.rHip, LM.rKnee]]) {
      if (vis(lm, hip) && vis(lm, knee)) {
        const s = distToSeg(bottom, lm[hip], lm[knee]);
        if (s.t > 0.35) add("thigh", s.d);
      }
    }
    const headPts = [LM.nose, LM.lEar, LM.rEar].filter(i => vis(lm, i));
    if (headPts.length) add("head", Math.min(...headPts.map(i => dist(p, lm[i]))) - 0.05 * H);
    if (vis(lm, LM.lSh) && vis(lm, LM.rSh)) {
      const c = { x: (lm[LM.lSh].x + lm[LM.rSh].x) / 2, y: (lm[LM.lSh].y + lm[LM.rSh].y) / 2 + 0.12 * H };
      add("chest", dist(bottom, c) - 0.05 * H);
    }
    cands.sort((a, b) => a.d - b.d);
    if (cands.length) { res.part = cands[0].part; res.d = cands[0].d; }
    // a ball low and below the knees is a foot touch, not a thigh touch
    if (res.part === "thigh" && vis(lm, LM.lKnee) && vis(lm, LM.rKnee)) {
      const kneeY = Math.max(lm[LM.lKnee].y, lm[LM.rKnee].y);
      if (bottom.y > kneeY + 0.08 * H) { const f = cands.find(c => c.part === "foot"); if (f) { res.part = "foot"; res.d = f.d; } }
    }
    return res;
  }

  _contact(p, ev) {
    const c = this.classify(p);
    const near = c.d < 0.45;
    const fs = this._footSpeedUp(p.t);
    const footMoving = Math.max(fs.l, fs.r) > 0.5;
    let kind;
    if (c.atGround && !(c.part === "foot" && near && footMoving)) kind = "bounce";
    else if (near) kind = "touch";
    else if (c.atGround || this.groundY == null) kind = "bounce";
    else kind = "touch"; // body part unclear, but something hit it upward mid-air
    if (globalThis.JDEBUG) console.log("  contact", p.t.toFixed(2), "y", (p.y+p.r).toFixed(3), "g", this.groundY?.toFixed(3), c.part, c.d.toFixed(2), "atG", c.atGround, "footUp", fs.l.toFixed(2), fs.r.toFixed(2), "->", kind);
    if (kind === "bounce") this._bounce(p.t, ev);
    else this._touch(p.t, c.part === "none" ? "unknown" : c.part, ev);
  }

  _touch(t, part, ev) {
    if (t - this.lastTouchT < this.opts.minTouchGap) return;
    this.lastTouchT = t;
    this.restSince = null;
    const ok = part === "unknown" || this.rules.allowed.includes(part);
    if (this.rules.needBounce && this.active && this.lastEventKind === "touch") {
      ev.push({ type: "nobounce", t, part });
      this.lastEventKind = "touch";
      return;
    }
    this.lastEventKind = "touch";
    if (!ok) { ev.push({ type: "wrong", t, part }); this.active = true; return; }
    this.active = true;
    ev.push({ type: "touch", t, part });
  }

  _bounce(t, ev) {
    ev.push({ type: "bounce", t });
    if (!this.active) { this.lastEventKind = "bounce"; return; }
    if (!this.rules.needBounce) { this._drop(t, ev, "ground"); return; }
    if (this.lastEventKind === "bounce") { this._drop(t, ev, "two-bounces"); return; }
    this.lastEventKind = "bounce";
  }

  _checkHand(t, ball, ev) {
    const lm = this.pose;
    if (!lm) return;
    const wr = [LM.lWr, LM.rWr].filter(i => vis(lm, i));
    const near = wr.some(i => dist(ball, lm[i]) < 0.2 * this.H);
    if (near) {
      if (this.handSince == null) this.handSince = t;
      if (!this.held && t - this.handSince > this.opts.handHoldTime) {
        this.held = true;
        ev.push({ type: "held", t });
        if (this.active) this._drop(t, ev, "caught");
      }
    } else {
      this.handSince = null;
      if (this.held) { this.held = false; this.phase = "none"; }
    }
  }

  _checkRest(t, ball, ev) {
    if (!this.active || this.groundY == null) { this.restSince = null; return; }
    const low = ball.y + (ball.r || 0) >= this.groundY - 0.1 * this.H;
    const still = Math.abs(this._vy(0.25)) < 0.25 * this.H;
    if (low && still) {
      if (this.restSince == null) this.restSince = t;
      if (t - this.restSince > this.opts.restDropTime) this._drop(t, ev, "rest");
    } else this.restSince = null;
  }

  _drop(t, ev, why) {
    this.active = false;
    this.lastEventKind = null;
    this.restSince = null;
    ev.push({ type: "drop", t, why });
  }
}

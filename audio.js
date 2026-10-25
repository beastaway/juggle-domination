// Juggle Jumps — all sounds are made in code with the Web Audio API (no files).
let ctx = null, master = null, muted = false;

export function initAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
}
export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.9; if (m && window.speechSynthesis) speechSynthesis.cancel(); }
export const isMuted = () => muted;

function tone({ f = 440, f2 = null, type = "square", t = 0, dur = 0.12, vol = 0.25, attack = 0.005, filter = null }) {
  if (!ctx || muted) return;
  const now = ctx.currentTime + t;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, now);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, now + dur);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(vol, now + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  let node = o;
  if (filter) { const bq = ctx.createBiquadFilter(); bq.type = "lowpass"; bq.frequency.value = filter; o.connect(bq); node = bq; }
  node.connect(g); g.connect(master);
  o.start(now); o.stop(now + dur + 0.05);
}
function noise({ t = 0, dur = 0.3, vol = 0.2, from = 2000, to = 400 }) {
  if (!ctx || muted) return;
  const now = ctx.currentTime + t, n = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const bq = ctx.createBiquadFilter(); bq.type = "bandpass"; bq.Q.value = 1.2;
  bq.frequency.setValueAtTime(from, now); bq.frequency.exponentialRampToValueAtTime(to, now + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, now); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  src.connect(bq); bq.connect(g); g.connect(master); src.start(now);
}

// --- happy sounds ---
const SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5];
let jugVariant = 0;
export function juggleSound(n) {
  // three flavours of "coin" so it doesn't get boring; pitch climbs with the count
  const f = SCALE[(n - 1) % SCALE.length];
  const v = jugVariant = (jugVariant + 1) % 3;
  if (v === 0) { tone({ f, type: "square", dur: 0.07, vol: 0.18 }); tone({ f: f * 1.5, type: "square", t: 0.07, dur: 0.16, vol: 0.18 }); }
  else if (v === 1) { tone({ f: f * 0.75, f2: f * 2, type: "triangle", dur: 0.16, vol: 0.32 }); }
  else { tone({ f, type: "square", dur: 0.05, vol: 0.16 }); tone({ f: f * 1.25, type: "square", t: 0.05, dur: 0.05, vol: 0.16 }); tone({ f: f * 1.5, type: "square", t: 0.1, dur: 0.14, vol: 0.16 }); }
  if (n % 5 === 0) sparkle(0.18);
}
export function sparkle(t = 0) {
  [1318.5, 1567.98, 2093, 2637].forEach((f, i) => tone({ f, type: "triangle", t: t + i * 0.055, dur: 0.18, vol: 0.18 }));
}
export function fanfare() {
  const notes = [[523.25, 0, 0.14], [659.25, 0.14, 0.14], [783.99, 0.28, 0.14], [1046.5, 0.42, 0.5], [783.99, 0.62, 0.12], [1046.5, 0.76, 0.6]];
  for (const [f, t, d] of notes) { tone({ f, type: "square", t, dur: d, vol: 0.16 }); tone({ f: f / 2, type: "triangle", t, dur: d, vol: 0.2 }); }
  sparkle(1.0);
}
export function whinny(t = 0) {
  if (!ctx || muted) return;
  const now = ctx.currentTime + t, dur = 1.1;
  const o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), g = ctx.createGain(), bq = ctx.createBiquadFilter();
  o.type = "sawtooth"; bq.type = "bandpass"; bq.frequency.value = 1400; bq.Q.value = 2;
  o.frequency.setValueAtTime(700, now); o.frequency.linearRampToValueAtTime(1300, now + 0.2); o.frequency.exponentialRampToValueAtTime(380, now + dur);
  lfo.frequency.setValueAtTime(14, now); lfo.frequency.linearRampToValueAtTime(22, now + dur); lg.gain.value = 70;
  lfo.connect(lg); lg.connect(o.frequency);
  g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.3, now + 0.05); g.gain.setValueAtTime(0.3, now + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.connect(bq); bq.connect(g); g.connect(master);
  o.start(now); lfo.start(now); o.stop(now + dur + 0.05); lfo.stop(now + dur + 0.05);
}
export function beep(high = false) { tone({ f: high ? 1046.5 : 659.25, type: "square", dur: high ? 0.4 : 0.15, vol: 0.22 }); }

// --- oh-no sounds ---
export function foghorn(t = 0, dur = 0.9) {
  if (!ctx || muted) return;
  const now = ctx.currentTime + t;
  for (const f of [73, 110, 146.8]) {
    const o = ctx.createOscillator(), g = ctx.createGain(), bq = ctx.createBiquadFilter();
    o.type = "sawtooth"; o.frequency.setValueAtTime(f * 1.04, now); o.frequency.linearRampToValueAtTime(f, now + 0.15);
    bq.type = "lowpass"; bq.frequency.value = 600;
    g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.32, now + 0.06);
    g.gain.setValueAtTime(0.32, now + dur - 0.15); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(bq); bq.connect(g); g.connect(master); o.start(now); o.stop(now + dur + 0.05);
  }
}
export function scream(t = 0) {
  if (!ctx || muted) return;
  const now = ctx.currentTime + t, dur = 0.9;
  const o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), g = ctx.createGain(), bq = ctx.createBiquadFilter();
  o.type = "sawtooth"; bq.type = "bandpass"; bq.frequency.value = 1800; bq.Q.value = 1.5;
  o.frequency.setValueAtTime(900, now); o.frequency.linearRampToValueAtTime(1250, now + 0.15); o.frequency.exponentialRampToValueAtTime(300, now + dur);
  lfo.frequency.value = 9; lg.gain.value = 40; lfo.connect(lg); lg.connect(o.frequency);
  g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.28, now + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.connect(bq); bq.connect(g); g.connect(master); o.start(now); lfo.start(now); o.stop(now + dur + 0.05); lfo.stop(now + dur + 0.05);
}
export function bonk() { tone({ f: 220, f2: 110, type: "triangle", dur: 0.18, vol: 0.3 }); }
export function thud() { noise({ dur: 0.35, vol: 0.5, from: 300, to: 80 }); tone({ f: 90, f2: 40, type: "sine", dur: 0.3, vol: 0.5 }); }

export function say(text, { pitch = 1.5, rate = 1.05 } = {}) {
  if (muted || !window.speechSynthesis) return;
  try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.pitch = pitch; u.rate = rate; u.volume = 1; speechSynthesis.speak(u); } catch (e) {}
}

export function dropSound(final) {
  thud();
  if (final) { foghorn(0.05, 0.75); foghorn(0.9, 1.0); scream(0.1); say("Oh nooo!", { pitch: 1.7, rate: 0.85 }); }
  else {
    const r = Math.floor(Math.random() * 3);
    foghorn(0.05);
    if (r === 0) say("Oh no!"); else if (r === 1) say("Whoa there!"); else scream(0.15);
  }
}

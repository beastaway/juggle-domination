// Juggle Jumps — camera counting. Runs entirely on the phone: the video never leaves it.
// Body tracking: MediaPipe Pose Landmarker. Ball: MediaPipe Object Detector ("sports ball").
import { JuggleDetector } from "./detector.js";

const MP = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const POSE_MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
// Two ball models: Lite2 finds soccer balls much more reliably; Lite0 is faster on older phones.
const BALL_MODELS = {
  accurate: "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite2/float16/1/efficientdet_lite2.tflite",
  fast: "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite",
};

const BONES = [[11, 12], [11, 23], [12, 24], [23, 24], [11, 13], [13, 15], [12, 14], [14, 16], [23, 25], [25, 27], [24, 26], [26, 28], [27, 29], [29, 31], [27, 31], [28, 30], [30, 32], [28, 32]];
let models = null, vision = null, files = null;

const makeBall = (kind, delegate) => vision.ObjectDetector.createFromOptions(files, {
  baseOptions: { modelAssetPath: BALL_MODELS[kind], delegate }, runningMode: "VIDEO",
  scoreThreshold: 0.08, maxResults: 4, categoryAllowlist: ["sports ball"],
});

async function loadModels(onStatus) {
  if (models) return models;
  onStatus?.("Loading the juggle counter… (first time takes a little while)");
  vision = await import(`${MP}/vision_bundle.mjs`);
  files = await vision.FilesetResolver.forVisionTasks(`${MP}/wasm`);
  const kind = localStorage.getItem("jj-ball-model") || "accurate";
  const make = async delegate => ({
    pose: await vision.PoseLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: POSE_MODEL, delegate }, runningMode: "VIDEO", numPoses: 1,
      minPoseDetectionConfidence: 0.4, minTrackingConfidence: 0.4,
    }),
    ball: await makeBall(kind, delegate),
  });
  try { models = await make("GPU"); models.delegate = "GPU"; }
  catch (e) { console.warn("GPU failed, using CPU", e); models = await make("CPU"); models.delegate = "CPU"; }
  models.kind = kind;
  return models;
}

export class JuggleCam {
  constructor(video, canvas, { onEvent, onStatus, onSeen } = {}) {
    this.video = video; this.canvas = canvas;
    this.onEvent = onEvent || (() => {}); this.onStatus = onStatus || (() => {}); this.onSeen = onSeen || (() => {});
    this.detector = new JuggleDetector("all");
    this.armed = false;        // only report events after the countdown
    this.debug = true;
    this.facing = "user";
    this.running = false;
    this.frame = 0;
    this.lastBall = null;
    this.fps = 0;
    this.lastEvents = [];
  }
  setCourse(c) { this.detector.setCourse(c); }
  setSensitivity(s) { this.detector.setSensitivity(s); }
  arm(on) { this.armed = on; this.detector.reset(); }

  async start(facing = "user") {
    this.facing = facing;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser can't use the camera.");
    this.onStatus("Asking for the camera…");
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false, video: { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
    });
    this.video.srcObject = this.stream;
    await this.video.play();
    this.video.classList.toggle("mirror", facing === "user");
    this.canvas.classList.toggle("mirror", facing === "user");
    this.m = await loadModels(this.onStatus);
    this.running = true;
    this.t0 = performance.now(); this.lastTs = 0; this.frames = 0; this.fpsT = performance.now();
    this.onStatus("Camera ready");
    this._tick();
  }
  stop() {
    this.running = false;
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
  }
  // attach the same stream to another <video>/<canvas> pair (setup screen vs. game screen)
  moveTo(video, canvas) {
    if (video === this.video) return;
    video.srcObject = this.stream; video.play().catch(() => {});
    video.classList.toggle("mirror", this.facing === "user"); canvas.classList.toggle("mirror", this.facing === "user");
    this.video.srcObject = null;
    this.video = video; this.canvas = canvas;
  }

  _tick() {
    if (!this.running) return;
    const v = this.video;
    const next = () => (v.requestVideoFrameCallback ? v.requestVideoFrameCallback(() => this._tick()) : requestAnimationFrame(() => this._tick()));
    if (v.readyState < 2 || !v.videoWidth) { next(); return; }
    let ts = performance.now();
    if (ts <= this.lastTs) ts = this.lastTs + 1;
    this.lastTs = ts;
    const W = v.videoWidth, H = v.videoHeight, k = W / H;
    let ball = null, pose = null;
    try {
      const tA = performance.now();
      const r = this.m.ball.detectForVideo(v, ts);
      this._timeBall(performance.now() - tA);
      ball = this._pickBall(r.detections || [], W, H);
      if (this.frame % 2 === 0 || this.fps > 24) {
        const p = this.m.pose.detectForVideo(v, ts);
        const lm = p.landmarks && p.landmarks[0];
        if (lm) pose = lm.map(q => ({ x: q.x * k, y: q.y, visibility: q.visibility }));
        this.lastPose = pose; this.lastPoseRaw = lm || null;
      }
    } catch (e) { console.warn(e); }
    this.frame++;
    const t = (ts - this.t0) / 1000;
    const evs = this.detector.update(t, ball, pose);
    if (this.armed) for (const e of evs) { this.onEvent(e); this.lastEvents.unshift({ e, t }); }
    this.lastEvents = this.lastEvents.filter(x => t - x.t < 1.2).slice(0, 3);
    this.onSeen({ body: !!(this.lastPoseRaw), ball: !!ball, fps: this.fps });
    this.frames++;
    const now = performance.now();
    if (now - this.fpsT > 1000) { this.fps = Math.round(this.frames * 1000 / (now - this.fpsT)); this.frames = 0; this.fpsT = now; }
    if (this.debug) this._draw(W, H, ball);
    next();
  }

  // If the accurate ball model is too slow on this phone, switch to the fast one.
  _timeBall(ms) {
    this.ballMs = this.ballMs == null ? ms : this.ballMs * 0.9 + ms * 0.1;
    this.ballN = (this.ballN || 0) + 1;
    if (this.ballN === 45 && this.m.kind === "accurate" && this.ballMs > 60 && !this.switching) {
      this.switching = true;
      makeBall("fast", this.m.delegate).then(det => {
        const old = this.m.ball; this.m.ball = det; this.m.kind = "fast"; old.close?.();
        try { localStorage.setItem("jj-ball-model", "fast"); } catch (e) {}
      }).catch(() => {}).finally(() => { this.switching = false; });
    }
  }

  _pickBall(dets, W, H) {
    if (!dets.length) return null;
    const cands = dets.map(d => {
      const b = d.boundingBox, cx = b.originX + b.width / 2, cy = b.originY + b.height / 2;
      return { x: cx / H, y: cy / H, r: Math.max(b.width, b.height) / 2 / H, score: d.categories?.[0]?.score || 0 };
    }).filter(c => c.r > 0.008 && c.r < 0.2);
    if (!cands.length) return null;
    // weak detections only count if they are where the ball should be (near its last spot)
    const recent = this.lastBall && performance.now() - this.lastBall.at < 400;
    const near = c => recent && Math.hypot(c.x - this.lastBall.x, c.y - this.lastBall.y) < 0.25;
    const ok = cands.filter(c => c.score >= 0.3 || (c.score >= 0.08 && near(c)));
    if (!ok.length) return null;
    let best;
    if (recent) best = ok.reduce((a, c) => (Math.hypot(c.x - this.lastBall.x, c.y - this.lastBall.y) - c.score * 0.1 < Math.hypot(a.x - this.lastBall.x, a.y - this.lastBall.y) - a.score * 0.1 ? c : a));
    else best = ok.reduce((a, c) => (c.score > a.score ? c : a));
    this.lastBall = { ...best, at: performance.now() };
    return best;
  }

  _draw(W, H, ball) {
    const cv = this.canvas, c = cv.getContext("2d");
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    c.clearRect(0, 0, W, H);
    const lm = this.lastPoseRaw;
    if (lm) {
      c.strokeStyle = "rgba(90,220,255,.9)"; c.lineWidth = Math.max(2, W / 160);
      for (const [a, b] of BONES) {
        if ((lm[a].visibility ?? 1) < 0.3 || (lm[b].visibility ?? 1) < 0.3) continue;
        c.beginPath(); c.moveTo(lm[a].x * W, lm[a].y * H); c.lineTo(lm[b].x * W, lm[b].y * H); c.stroke();
      }
      c.fillStyle = "#ffd23f";
      for (const i of [27, 28, 29, 30, 31, 32, 25, 26]) { c.beginPath(); c.arc(lm[i].x * W, lm[i].y * H, W / 90, 0, 7); c.fill(); }
    }
    const g = this.detector.groundY;
    if (g != null) { c.strokeStyle = "rgba(255,255,255,.6)"; c.setLineDash([8, 8]); c.beginPath(); c.moveTo(0, g * H); c.lineTo(W, g * H); c.stroke(); c.setLineDash([]); }
    if (ball) {
      c.strokeStyle = "#7CFF6B"; c.lineWidth = Math.max(3, W / 120);
      c.beginPath(); c.arc(ball.x * H, ball.y * H, ball.r * H + 4, 0, 7); c.stroke();
    }
    // trail
    c.fillStyle = "rgba(124,255,107,.5)";
    for (const p of this.detector.track) { c.beginPath(); c.arc(p.x * H, p.y * H, W / 140, 0, 7); c.fill(); }
  }
}

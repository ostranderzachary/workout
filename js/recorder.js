// Live GPS recording. Keeps the screen awake, filters fixes, splits the track at manual pauses,
// and saves progress so a reload or crash doesn't lose the activity.
import { acceptPoint, trackStats, recentSpeed } from "./geo.js";
import { ACTIVITIES } from "./body.js";
import { Store } from "./store.js";

const SAVE_EVERY_MS = 5000;
const GAP_NOTICE_S = 30;

export class Recorder {
  constructor({ activity = "run", autoPause = true, onChange }) {
    this.activity = activity;
    this.autoPause = autoPause;
    this.onChange = onChange || (() => {});
    this.state = "idle";          // idle → recording ⇄ paused → finished
    this.segments = [];
    this.startedAt = null;
    this.pausedMs = 0;            // total time in manual pauses
    this.pauseStartedAt = null;
    this.fix = null;              // latest raw fix, accepted or not, for the GPS status chip
    this.gpsError = null;
    this.notice = null;
    this.watchId = null;
    this.wakeLock = null;
    this.lastSave = 0;
    this.onVisible = () => this.handleVisibility();
  }

  static fromSaved(saved, opts) {
    const r = new Recorder({ ...opts, activity: saved.activity, autoPause: saved.autoPause });
    // If the page died mid-recording, treat the moment of the last save as the pause.
    Object.assign(r, { segments: saved.segments, startedAt: saved.startedAt, pausedMs: saved.pausedMs, state: "paused", pauseStartedAt: saved.pauseStartedAt || saved.savedAt });
    return r;
  }

  get cfg() { return ACTIVITIES[this.activity] || ACTIVITIES.run; }
  get points() { return this.segments.reduce((n, s) => n + s.length, 0); }
  get lastPoint() { for (let i = this.segments.length - 1; i >= 0; i--) if (this.segments[i].length) return this.segments[i][this.segments[i].length - 1]; return null; }

  /* Watch GPS from the moment the record screen opens, so the fix is ready before Start. */
  watch() {
    if (this.watchId != null) return;
    if (!("geolocation" in navigator)) { this.gpsError = "This browser can't use GPS."; return this.onChange(); }
    this.watchId = navigator.geolocation.watchPosition(p => this.handleFix(p), e => this.handleError(e),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
    document.addEventListener("visibilitychange", this.onVisible);
  }
  unwatch() {
    if (this.watchId != null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
    document.removeEventListener("visibilitychange", this.onVisible);
    this.releaseWake();
  }

  start() {
    this.state = "recording";
    this.startedAt = Date.now();
    this.segments = [[]];
    this.watch();
    this.keepAwake();
    if (this.fix && this.fix[4] != null && this.fix[4] <= 30 && Date.now() - this.fix[2] < 5000) this.segments[0].push([...this.fix.slice(0, 2), Date.now(), this.fix[3], this.fix[4]]);
    this.persist(true);
    this.onChange();
  }
  pause() {
    if (this.state !== "recording") return;
    this.state = "paused";
    this.pauseStartedAt = Date.now();
    this.releaseWake();
    this.persist(true);
    this.onChange();
  }
  resume() {
    if (this.state !== "paused") return;
    this.pausedMs += Date.now() - (this.pauseStartedAt || Date.now());
    this.pauseStartedAt = null;
    this.state = "recording";
    this.segments.push([]);
    this.notice = null;
    this.watch();
    this.keepAwake();
    this.persist(true);
    this.onChange();
  }
  /* Ends recording and returns what to save. Empty segments are dropped. */
  finish() {
    if (this.state === "recording") this.pause();
    this.state = "finished";
    this.unwatch();
    const segments = this.segments.filter(s => s.length > 1);
    return { activity: this.activity, startedAt: this.startedAt, segments, ...this.summary(segments) };
  }
  async discard() { this.state = "finished"; this.unwatch(); await Store.delMeta("recording"); }

  /* Time shown on the big clock: moving time with auto-pause, otherwise time minus manual pauses. */
  activeSeconds(now = Date.now()) {
    if (!this.startedAt) return 0;
    const end = this.state === "recording" ? now : this.pauseStartedAt || now;
    return Math.max(0, (end - this.startedAt - this.pausedMs) / 1000);
  }
  summary(segments = this.segments) {
    const s = trackStats(segments, { moveSpeed: this.cfg.moveSpeed });
    const active = this.activeSeconds();
    const moving = this.autoPause ? Math.min(s.moving, active) : active;
    return { distance: s.distance, moving, elapsed: s.elapsed, gain: s.gain };
  }
  clockSeconds() {
    if (!this.autoPause) return this.activeSeconds();
    const s = trackStats(this.segments, { moveSpeed: this.cfg.moveSpeed }).moving;
    // Between fixes, keep the clock ticking while we're moving.
    const lp = this.lastPoint, sinceLast = lp ? (Date.now() - lp[2]) / 1000 : 0;
    return this.state === "recording" && !this.isStopped() && sinceLast < 15 ? s + sinceLast : s;
  }
  currentSpeed() {
    const seg = this.segments[this.segments.length - 1], lp = this.lastPoint;
    if (this.state !== "recording" || !lp || Date.now() - lp[2] > 15000) return null;
    return recentSpeed(seg, 20);
  }
  /* Auto-pause indicator: under the activity's walking threshold for the last 10 s. */
  isStopped() {
    if (!this.autoPause || this.state !== "recording") return false;
    const lp = this.lastPoint;
    if (!lp) return true;
    if (Date.now() - lp[2] > 12000) return true;
    const v = recentSpeed(this.segments[this.segments.length - 1], 10);
    return v != null && v < this.cfg.moveSpeed;
  }

  handleFix(pos) {
    const c = pos.coords;
    const p = [c.latitude, c.longitude, pos.timestamp || Date.now(), c.altitude ?? null, c.accuracy ?? null];
    this.fix = p;
    this.gpsError = null;
    if (this.state === "recording") {
      const seg = this.segments[this.segments.length - 1];
      const verdict = acceptPoint(seg[seg.length - 1], p, { maxSpeed: this.cfg.maxSpeed });
      if (verdict === "ok") {
        const prev = seg[seg.length - 1];
        if (prev && (p[2] - prev[2]) / 1000 > GAP_NOTICE_S) this.gapNotice((p[2] - prev[2]) / 1000);
        seg.push(p);
        this.persist();
      }
    }
    this.onChange();
  }
  handleError(e) {
    this.gpsError = e.code === 1
      ? "Location is turned off for this site. Allow location in your browser settings, then reopen this screen."
      : e.code === 3 ? "Still looking for GPS. Move somewhere with a clear view of the sky." : "GPS isn't available right now.";
    this.onChange();
  }
  gapNotice(s) {
    const m = Math.round(s / 60);
    this.notice = `GPS stopped for ${m ? m + " min" : Math.round(s) + " s"} while the screen was off or another app was open. That stretch is a straight line on the map.`;
  }
  handleVisibility() {
    if (document.visibilityState === "visible" && this.state === "recording") {
      this.keepAwake();
      const lp = this.lastPoint;
      if (lp && (Date.now() - lp[2]) / 1000 > GAP_NOTICE_S) this.gapNotice((Date.now() - lp[2]) / 1000);
      this.onChange();
    } else if (document.visibilityState === "hidden") this.persist(true);
  }

  async keepAwake() {
    try {
      if (!this.wakeLock && "wakeLock" in navigator) {
        this.wakeLock = await navigator.wakeLock.request("screen");
        this.wakeLock.addEventListener("release", () => { this.wakeLock = null; this.onChange(); });
      }
    } catch { this.wakeLock = null; }
    this.onChange();
  }
  releaseWake() { try { this.wakeLock?.release(); } catch {} this.wakeLock = null; }

  persist(force = false) {
    if (!force && Date.now() - this.lastSave < SAVE_EVERY_MS) return;
    this.lastSave = Date.now();
    Store.setMeta("recording", {
      activity: this.activity, autoPause: this.autoPause, segments: this.segments,
      startedAt: this.startedAt, pausedMs: this.pausedMs, pauseStartedAt: this.pauseStartedAt, savedAt: Date.now()
    }).catch(() => {});
  }
}

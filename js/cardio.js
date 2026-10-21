// Cardio screens: live recording, the save summary, the activity page, and the
// hand-entry sheet for sessions without GPS (treadmill, spin bike).
import { $, esc, ymd, today, parse, MON, DOW, uid } from "./util.js";
import { ACTIVITIES, CARDIO_SET_SECONDS, MUSCLES } from "./body.js";
import { Recorder } from "./recorder.js";
import { RouteMap } from "./map.js";
import { renderProfile } from "./charts.js";
import { MILE, FOOT, duration, pace, splits, profile, toGPX } from "./geo.js";
import { Store } from "./store.js";

let ctx = null;
let rec = null, rmap = null, result = null;
let screen = null, skipPop = false, confirmDiscard = false, confirmDelete = false;
let cd = null; // hand-entry draft

const ICON = {
  close: `<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  back: `<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>`,
  locate: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>`,
  lock: `<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`
};

/* ---------- Units & formatting ---------- */
export function units() {
  return ctx.prefs.dist === "km"
    ? { unit: 1000, label: "km", elevUnit: 1, elevLabel: "m", speedLabel: "km/h" }
    : { unit: MILE, label: "mi", elevUnit: FOOT, elevLabel: "ft", speedLabel: "mph" };
}
const usesPace = a => (ACTIVITIES[a] || ACTIVITIES.run).usesPace;
export const fmtDist = m => ((m || 0) / units().unit).toFixed(2);
/* Average pace (min per mi/km) for foot activities, speed for rides. */
export function rate(distanceM, seconds, activity) {
  const u = units();
  if (!usesPace(activity)) return seconds > 0 ? ((distanceM / seconds) / u.unit * 3600).toFixed(1) : "0.0";
  return seconds > 0 && distanceM > 0 ? pace(distanceM / seconds, u.unit) : "–:––";
}
export const rateLabel = activity => (usesPace(activity) ? `/${units().label}` : units().speedLabel);
export function defaultName(ts, activity) {
  const h = new Date(ts).getHours();
  const part = h < 5 ? "Night" : h < 11 ? "Morning" : h < 14 ? "Lunch" : h < 17 ? "Afternoon" : h < 21 ? "Evening" : "Night";
  return `${part} ${(ACTIVITIES[activity] || ACTIVITIES.run).label}`;
}
const timeOfDay = ts => new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const activityChips = (sel, attr = "data-activity") => `<div class="chips" role="group" aria-label="Activity">${Object.entries(ACTIVITIES).map(([k, a]) =>
  `<button type="button" class="chip" ${attr}="${k}" aria-pressed="${k === sel}">${a.label}</button>`).join("")}</div>`;

/* ---------- Full-screen views (record, save, activity) ---------- */
function teardown() { if (screen) screen.cleanup.forEach(f => { try { f(); } catch {} }); screen = null; }
function openScreen(kind, html) {
  const fresh = !screen;
  teardown();
  const root = $("screenRoot");
  root.innerHTML = html; root.hidden = false;
  document.body.classList.add("screen-open");
  screen = { kind, cleanup: [] };
  if (fresh) history.pushState({ mm: "screen" }, "");
}
function hideScreen() {
  teardown();
  const root = $("screenRoot");
  root.innerHTML = ""; root.hidden = true;
  document.body.classList.remove("screen-open");
}
export function closeScreen() {
  hideScreen();
  if (history.state && history.state.mm === "screen") { skipPop = true; history.back(); }
}
const busy = () => rec && (rec.state === "recording" || rec.state === "paused");

/* ---------- Record ---------- */
export async function openRecorder(saved = null, { thenSave = false } = {}) {
  rec = saved
    ? Recorder.fromSaved(saved, { onChange: onRecChange })
    : new Recorder({ activity: ctx.prefs.activity || "run", autoPause: ctx.prefs.autoPause !== false, onChange: onRecChange });
  if (thenSave) return finishRecording();
  mountRecorder();
}

function mountRecorder() {
  confirmDiscard = false;
  openScreen("record", `<div class="screen rec">
    <header class="rec-top"><div class="rec-head" id="recHead"></div><span class="gps-chip" id="gpsChip"></span></header>
    <div class="rec-map"><div id="recMap" class="map"></div><button type="button" class="map-btn" data-act="recenter" aria-label="Center on my location">${ICON.locate}</button></div>
    <div class="rec-panel">
      <p class="rec-notice" id="recNotice" hidden></p>
      <div class="rec-clock"><b id="rClock" class="num">0:00</b><span><span id="rClockLbl">Moving time</span> <span class="ap" id="rAuto" hidden>Auto-paused</span></span></div>
      <div class="rec-stats">
        <div><b id="rDist" class="num">0.00</b><span id="rDistLbl">Distance</span></div>
        <div><b id="rAvg" class="num">–:––</b><span id="rAvgLbl">Avg pace</span></div>
        <div><b id="rCur" class="num">–:––</b><span id="rCurLbl">Pace now</span></div>
        <div><b id="rGain" class="num">–</b><span id="rGainLbl">Climb</span></div>
      </div>
      <div class="rec-ctrl" id="recCtrl"></div>
    </div>
    <div class="lock" id="lock" hidden><p>Screen locked so pocket taps can't stop your activity.</p><button type="button" class="hold" id="holdBtn"><span>Hold to unlock</span></button></div>
  </div>`);
  rmap = new RouteMap($("recMap"));
  rmap.setRoute(rec.segments);
  if (rec.lastPoint) rmap.setPosition(rec.lastPoint);
  rec.watch();
  const t = setInterval(updateRec, 1000);
  const warn = e => { if (busy()) { e.preventDefault(); e.returnValue = ""; } };
  window.addEventListener("beforeunload", warn);
  screen.cleanup.push(() => clearInterval(t), () => window.removeEventListener("beforeunload", warn), () => { rmap && rmap.destroy(); rmap = null; },
    () => { if (rec && rec.state === "idle") { rec.unwatch(); rec = null; } });
  bindHold();
  lastState = null;
  onRecChange();
}

let lastState = null;
function onRecChange() {
  if (!screen || screen.kind !== "record" || !rec) return;
  if (rec.state !== lastState) { lastState = rec.state; renderRecChrome(); }
  updateRec();
}

function renderRecChrome() {
  const a = ACTIVITIES[rec.activity];
  $("recHead").innerHTML = rec.state === "idle"
    ? `<button class="iconbtn" type="button" data-act="close" aria-label="Close">${ICON.close}</button>${activityChips(rec.activity)}`
    : `<span class="rec-state ${rec.state}"><i></i>${rec.state === "recording" ? "Recording" : "Paused"}</span><b class="rec-act">${a.label}</b>`;
  $("recCtrl").innerHTML = rec.state === "idle"
    ? `<button class="go" type="button" data-act="start">Start</button><button class="linkbtn" type="button" data-act="manual">No GPS? Add a session by hand</button>`
    : rec.state === "recording"
      ? `<button class="ctl" type="button" data-act="lock" aria-label="Lock screen">${ICON.lock}</button><button class="go pause" type="button" data-act="pause">Pause</button><span class="ctl-spacer"></span>`
      : `<button class="go" type="button" data-act="resume">Resume</button><button class="go finish" type="button" data-act="finish">Finish</button>`;
}

function updateRec() {
  if (!rec || !screen || screen.kind !== "record") return;
  const u = units(), s = rec.summary(), clock = rec.clockSeconds(), pacey = usesPace(rec.activity);
  $("rClock").textContent = duration(clock);
  $("rClockLbl").textContent = rec.autoPause ? "Moving time" : "Time";
  $("rAuto").hidden = !rec.isStopped();
  $("rDist").textContent = (s.distance / u.unit).toFixed(2);
  $("rDistLbl").textContent = `Distance ${u.label}`;
  $("rAvg").textContent = rate(s.distance, clock, rec.activity);
  $("rAvgLbl").textContent = pacey ? `Avg pace /${u.label}` : `Avg ${u.speedLabel}`;
  const v = rec.currentSpeed();
  $("rCur").textContent = pacey ? pace(v && v >= rec.cfg.moveSpeed ? v : 0, u.unit) : ((v || 0) / u.unit * 3600).toFixed(1);
  $("rCurLbl").textContent = pacey ? `Pace now /${u.label}` : `${u.speedLabel} now`;
  $("rGain").textContent = s.gain == null ? "–" : Math.round(s.gain / u.elevUnit);
  $("rGainLbl").textContent = `Climb ${u.elevLabel}`;

  const chip = $("gpsChip"), f = rec.fix, acc = f && f[4] != null ? Math.round(f[4]) : null;
  const fresh = f && Date.now() - f[2] < 15000;
  const [cls, txt] = rec.gpsError && !fresh ? ["bad", "No GPS"] : !f ? ["wait", "Finding GPS…"] : !fresh ? ["weak", "GPS lost"]
    : acc == null || acc <= 15 ? ["good", `GPS ±${acc ?? "?"} m`] : acc <= 30 ? ["weak", `Weak GPS ±${acc} m`] : ["bad", `Poor GPS ±${acc} m`];
  chip.className = `gps-chip ${cls}`; chip.textContent = txt;

  const notes = [];
  if (rec.gpsError) notes.push(rec.gpsError);
  if (rec.notice) notes.push(rec.notice);
  if (rec.state === "recording" && !rec.points) notes.push("Waiting for a GPS fix. The clock is running and distance starts as soon as GPS locks on.");
  if (rec.state === "recording" && !rec.wakeLock) notes.push("Keep this screen on. Phones stop sending location to web apps when the screen locks.");
  if (rec.state === "idle" && !rec.gpsError) notes.push("Keep the screen on while you record. Use the lock button to stop pocket taps.");
  const n = $("recNotice"); n.hidden = !notes.length; n.textContent = notes.join(" ");

  if (rmap) { rmap.extend(rec.segments); if (f) rmap.setPosition(f); }
}

function bindHold() {
  const b = $("holdBtn");
  let t = null;
  const cancel = () => { clearTimeout(t); b.classList.remove("holding"); };
  b.addEventListener("pointerdown", e => { e.preventDefault(); b.classList.add("holding"); t = setTimeout(() => { cancel(); $("lock").hidden = true; }, 900); });
  ["pointerup", "pointerleave", "pointercancel"].forEach(ev => b.addEventListener(ev, cancel));
  b.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") $("lock").hidden = true; });
}

function finishRecording() {
  result = rec.finish();
  confirmDiscard = false;
  renderSave();
}

function renderSave() {
  const u = units(), s = rec.summary(result.segments), a = rec.activity;
  const hasRoute = result.segments.length > 0;
  const prevName = $("saveName") ? $("saveName").value : null;
  openScreen("save", `<div class="screen save">
    <header class="act-top"><div class="act-title"><b>Save ${esc(ACTIVITIES[a].label.toLowerCase())}</b><span>${result.startedAt ? `${DOW[new Date(result.startedAt).getDay()]} at ${timeOfDay(result.startedAt)}` : ""}</span></div></header>
    <div class="act-scroll"><div class="act-body">
      ${hasRoute ? `<div id="saveMap" class="map save-map"></div>` : `<p class="banner">No GPS points were recorded, so there's no route. You can still save the time.</p>`}
      <div class="act-stats">
        <div><b class="num">${fmtDist(s.distance)}</b><span>Distance ${u.label}</span></div>
        <div><b class="num">${duration(s.moving)}</b><span>${rec.autoPause ? "Moving time" : "Time"}</span></div>
        <div><b class="num">${rate(s.distance, s.moving, a)}</b><span>${usesPace(a) ? `Avg pace /${u.label}` : `Avg ${u.speedLabel}`}</span></div>
      </div>
      <div class="field"><label for="saveName">Name</label><input class="inp" id="saveName" type="text" value="${esc(prevName ?? defaultName(result.startedAt || Date.now(), a))}"></div>
      <div class="field"><span class="lbl">Activity</span>${activityChips(a, "data-save-activity")}</div>
      <div class="save-actions">
        <button class="btn primary big" type="button" data-act="save">Save activity</button>
        <button class="btn big" type="button" data-act="resume-save">Resume</button>
        ${confirmDiscard
          ? `<span class="confirm">Discard this activity? <button class="btn small danger" type="button" data-act="discard-yes">Discard</button><button class="btn small ghost" type="button" data-act="discard-no">Keep</button></span>`
          : `<button class="btn ghost danger" type="button" data-act="discard">Discard</button>`}
      </div>
    </div></div>
  </div>`);
  if (hasRoute) {
    const m = new RouteMap($("saveMap"), { interactive: false });
    m.setRoute(result.segments, { fit: true }); m.endpoints(result.segments);
    screen.cleanup.push(() => m.destroy());
  }
}

async function saveRecording() {
  const s = rec.summary(result.segments);
  const start = result.startedAt || Date.now();
  const w = {
    id: uid("c"), kind: "cardio", activity: rec.activity, source: "gps",
    name: $("saveName").value.trim() || defaultName(start, rec.activity),
    date: ymd(new Date(start)), startedAt: start,
    distanceM: s.distance, movingS: s.moving, elapsedS: s.elapsed || s.moving, gainM: s.gain, createdAt: Date.now()
  };
  try {
    await ctx.save(w, result.segments.length ? result.segments : null);
    await Store.delMeta("recording");
    rec = null; result = null;
    openActivity(w);
  } catch {
    ctx.toast("Couldn't save the activity. Free up storage on this device and try again.");
  }
}

/* ---------- Activity page ---------- */
export async function openActivity(w) {
  confirmDelete = false;
  const segs = await ctx.getTrack(w.id);
  const u = units(), a = ACTIVITIES[w.activity] || ACTIVITIES.run, pacey = a.usesPace;
  const start = w.startedAt || parse(w.date).getTime();
  const eq = (w.movingS || 0) / CARDIO_SET_SECONDS;
  const sp = segs ? splits(segs, u.unit, { moveSpeed: a.moveSpeed }) : [];
  const fastest = Math.max(0, ...sp.map(x => (x.time ? x.distance / x.time : 0)));
  const d = new Date(start);
  const sub = `${a.label} · ${DOW[d.getDay()]}, ${MON[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}${w.startedAt ? ` at ${timeOfDay(w.startedAt)}` : ""}`;
  const stats = [
    [fmtDist(w.distanceM), `Distance ${u.label}`],
    [duration(w.movingS), "Moving time"],
    [rate(w.distanceM, w.movingS, w.activity), pacey ? `Avg pace /${u.label}` : `Avg ${u.speedLabel}`],
    [w.gainM == null ? "–" : Math.round(w.gainM / u.elevUnit).toLocaleString(), `Climb ${u.elevLabel}`],
    [duration(w.elapsedS || w.movingS), "Elapsed time"],
    [w.source === "gps" ? "Recorded" : w.source === "gpx" ? "Imported" : "By hand", "Source"]
  ];
  openScreen("activity", `<div class="screen act">
    <header class="act-top">
      <button class="iconbtn" type="button" data-act="close" aria-label="Back">${ICON.back}</button>
      <div class="act-title"><b>${esc(w.name || defaultName(start, w.activity))}</b><span>${esc(sub)}</span></div>
      ${w.sample ? "" : `<button class="btn small" type="button" data-act="edit">Edit</button>`}
    </header>
    <div class="act-scroll">
      ${segs ? `<div id="actMap" class="map act-map"></div>` : ""}
      <div class="act-body">
        ${w.sample ? `<p class="banner">This is an example activity. Record your own and it replaces the examples.</p>` : ""}
        <div class="act-stats">${stats.map(([v, k]) => `<div><b class="num">${esc(v)}</b><span>${esc(k)}</span></div>`).join("")}</div>
        <div class="act-muscles"><span class="lbl">Counts as ${(Math.round(eq * 10) / 10).toLocaleString()} sets for</span>
          <div class="tags">${a.p.map(m => `<span class="tag p">${esc(MUSCLES[m])}</span>`).join("")}${a.s.map(m => `<span class="tag s">${esc(MUSCLES[m])}</span>`).join("")}</div>
          <p class="note">Ten minutes of moving time is one set for the main muscles and half a set for the others.</p></div>
        ${segs ? `<section class="panel"><h2>${pacey ? "Pace" : "Speed"} and elevation</h2><div id="actCharts" class="charts"></div></section>` : ""}
        ${sp.length ? `<section class="panel"><h2>Splits</h2><div class="table-scroll"><table class="splits">
          <thead><tr><th scope="col">${u.label === "mi" ? "Mile" : "Km"}</th><th scope="col">${pacey ? "Pace" : u.speedLabel}</th><th scope="col">Elev ${u.elevLabel}</th><th scope="col"><span class="sr">Relative speed</span></th></tr></thead>
          <tbody>${sp.map((x, i) => {
            const v = x.time ? x.distance / x.time : 0;
            const partial = x.distance < u.unit - 0.5;
            return `<tr><td class="num">${partial ? (x.distance / u.unit).toFixed(2) : i + 1}</td><td class="num">${pacey ? pace(v, u.unit) : (v / u.unit * 3600).toFixed(1)}</td>
              <td class="num">${x.elev == null ? "–" : (x.elev >= 0 ? "+" : "−") + Math.abs(Math.round(x.elev / u.elevUnit))}</td>
              <td class="bar-cell"><span class="sbar" style="width:${fastest ? (v / fastest) * 100 : 0}%"></span></td></tr>`;
          }).join("")}</tbody></table></div></section>` : ""}
        ${w.sample ? "" : `<div class="act-actions">
          ${segs ? `<button class="btn" type="button" data-act="gpx">Export GPX</button>` : ""}
          ${confirmDelete ? "" : `<button class="btn ghost danger" type="button" data-act="delete">Delete activity</button>`}
          <span id="delConfirm"></span>
        </div>`}
      </div>
    </div>
  </div>`);
  screen.w = w; screen.segs = segs;
  if (segs) {
    const m = new RouteMap($("actMap"));
    m.setRoute(segs, { fit: true }); m.endpoints(segs);
    const prof = profile(segs, { moveSpeed: a.moveSpeed });
    const draw = () => renderProfile($("actCharts"), prof, { unit: u.unit, unitLabel: u.label, elevUnit: u.elevUnit, elevLabel: u.elevLabel, usesPace: pacey, onHover: p => m.highlight(p && p.lat, p && p.lon) });
    draw();
    let rt = null;
    const onResize = () => { clearTimeout(rt); rt = setTimeout(() => { draw(); m.invalidate(); }, 150); };
    window.addEventListener("resize", onResize);
    screen.cleanup.push(() => window.removeEventListener("resize", onResize), () => m.destroy());
  }
}

function exportGPX(w, segs) {
  const blob = new Blob([toGPX(w, segs)], { type: "application/gpx+xml" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${(w.name || "activity").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "activity"}-${w.date}.gpx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- Hand-entry sheet ---------- */
export function openCardioSheet(w = null) {
  const u = units();
  const s = w ? Math.round(w.movingS || 0) : 0;
  cd = w
    ? { ...w, h: Math.floor(s / 3600) || "", m: Math.floor((s % 3600) / 60) || "", s: s % 60 || "", dist: w.distanceM ? +(w.distanceM / u.unit).toFixed(2) : "", error: "", confirmDel: false }
    : { id: null, kind: "cardio", source: "manual", activity: ctx.prefs.activity || "run", date: ymd(today()), name: "", h: "", m: "", s: "", dist: "", error: "", confirmDel: false };
  renderCardioSheet();
}
function renderCardioSheet() {
  const root = $("cardioSheet");
  if (!cd) { root.innerHTML = ""; ctx.lockScroll(false); return; }
  ctx.lockScroll(true);
  const u = units(), byHand = cd.source === "manual";
  root.innerHTML = `<div class="overlay" data-cact="bg"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="cTitle">
    <div class="sheet-head"><h3 id="cTitle">${cd.id ? "Edit activity" : "Add cardio"}</h3><button class="x" type="button" data-cact="close" aria-label="Close">${ICON.close}</button></div>
    <div class="field"><span class="lbl">Activity</span>${activityChips(cd.activity, "data-c-activity")}</div>
    <div class="row2" style="margin-top:10px">
      ${byHand ? `<div class="field"><label for="c-date">Date</label><input class="inp" id="c-date" type="date" max="${ymd(today())}" value="${esc(cd.date)}" data-c="date"></div>` : ""}
      <div class="field" ${byHand ? "" : 'style="grid-column:1/-1"'}><label for="c-name">Name</label><input class="inp" id="c-name" type="text" placeholder="${esc(defaultName(Date.now(), cd.activity))}" value="${esc(cd.name)}" data-c="name"></div>
    </div>
    ${byHand ? `<div class="field" style="margin-top:10px"><span class="lbl">Time</span><div class="hms">
        <input class="inp num" id="c-h" type="number" inputmode="numeric" min="0" placeholder="0" value="${esc(cd.h)}" data-c="h" aria-label="Hours"><span>h</span>
        <input class="inp num" id="c-m" type="number" inputmode="numeric" min="0" max="59" placeholder="0" value="${esc(cd.m)}" data-c="m" aria-label="Minutes"><span>min</span>
        <input class="inp num" id="c-s" type="number" inputmode="numeric" min="0" max="59" placeholder="0" value="${esc(cd.s)}" data-c="s" aria-label="Seconds"><span>s</span></div></div>
      <div class="field" style="margin-top:10px"><label for="c-dist">Distance (${u.label}) · optional</label><input class="inp num" id="c-dist" type="number" inputmode="decimal" min="0" step="any" placeholder="0.00" value="${esc(cd.dist)}" data-c="dist"></div>`
      : `<p class="note">Time and distance come from the GPS track.</p>`}
    ${cd.error ? `<div class="err" role="alert">${esc(cd.error)}</div>` : ""}
    <div class="sheet-actions">
      ${cd.id ? (cd.confirmDel
        ? `<span class="confirm">Delete this activity? <button class="btn small danger" type="button" data-cact="del-yes">Delete</button><button class="btn small ghost" type="button" data-cact="del-no">Keep</button></span>`
        : `<button class="btn ghost danger" type="button" data-cact="del">Delete</button>`) : ""}
      <div class="right"><button class="btn ghost" type="button" data-cact="close">Cancel</button><button class="btn primary" type="button" data-cact="save">${cd.id ? "Save changes" : "Save"}</button></div>
    </div>
  </div></div>`;
}
async function saveCardioSheet() {
  const u = units(), byHand = cd.source === "manual";
  const secs = (Number(cd.h) || 0) * 3600 + (Number(cd.m) || 0) * 60 + (Number(cd.s) || 0);
  if (byHand && !cd.date) { cd.error = "Pick a date."; return renderCardioSheet(); }
  if (byHand && secs <= 0) { cd.error = "Enter how long the session took."; return renderCardioSheet(); }
  const base = { ...cd };
  ["h", "m", "s", "dist", "error", "confirmDel"].forEach(k => delete base[k]);
  const w = {
    ...base, id: cd.id || uid("c"), kind: "cardio", activity: cd.activity,
    name: cd.name.trim() || defaultName(cd.startedAt || parse(cd.date).getTime() + 12 * 3600e3, cd.activity),
    createdAt: cd.createdAt || Date.now()
  };
  if (byHand) Object.assign(w, { date: cd.date, movingS: secs, elapsedS: secs, distanceM: (Number(cd.dist) || 0) * u.unit, gainM: cd.gainM ?? null });
  try {
    await ctx.save(w, null);
    cd = null; renderCardioSheet();
    if (screen && screen.kind === "activity") openActivity(w);
  } catch { cd.error = "Couldn't save. Free up storage on this device and try again."; renderCardioSheet(); }
}

/* ---------- Wiring ---------- */
export function initCardio(c) {
  ctx = c;
  window.addEventListener("popstate", () => {
    if (skipPop) { skipPop = false; return; }
    if (!screen) return;
    if (busy() || screen.kind === "save") { history.pushState({ mm: "screen" }, ""); return; } // finish or discard first
    hideScreen();
  });

  $("screenRoot").addEventListener("click", async e => {
    const b = e.target.closest("button"); if (!b || !screen) return;
    const act = b.dataset.act;
    if (b.dataset.activity && rec && rec.state === "idle") { rec.activity = b.dataset.activity; ctx.prefs.activity = rec.activity; ctx.savePrefs(); lastState = null; return onRecChange(); }
    if (b.dataset.saveActivity && rec) { rec.activity = b.dataset.saveActivity; return renderSave(); }
    if (act === "close") return closeScreen();
    if (act === "recenter") return rmap && rmap.recenter();
    if (act === "start") { rec.start(); return; }
    if (act === "pause") return rec.pause();
    if (act === "resume") return rec.resume();
    if (act === "lock") { $("lock").hidden = false; return $("holdBtn").focus(); }
    if (act === "finish") return finishRecording();
    if (act === "manual") { closeScreen(); return openCardioSheet(null); }
    if (act === "save") return saveRecording();
    if (act === "resume-save") { rec.state = "paused"; mountRecorder(); return rec.resume(); }
    if (act === "discard") { confirmDiscard = true; return renderSave(); }
    if (act === "discard-no") { confirmDiscard = false; return renderSave(); }
    if (act === "discard-yes") { await rec.discard(); rec = null; result = null; return closeScreen(); }
    if (act === "edit") return openCardioSheet(screen.w);
    if (act === "gpx") return exportGPX(screen.w, screen.segs);
    if (act === "delete") {
      b.hidden = true;
      $("delConfirm").innerHTML = `<span class="confirm">Delete this activity? <button class="btn small danger" type="button" data-act="del-yes">Delete</button><button class="btn small ghost" type="button" data-act="del-no">Keep</button></span>`;
      return;
    }
    if (act === "del-no") { $("delConfirm").innerHTML = ""; const d = document.querySelector('[data-act="delete"]'); if (d) d.hidden = false; return; }
    if (act === "del-yes") { await ctx.remove(screen.w.id); return closeScreen(); }
  });

  const sheet = $("cardioSheet");
  sheet.addEventListener("input", e => { const k = e.target.dataset.c; if (cd && k) cd[k] = e.target.value; });
  sheet.addEventListener("click", async e => {
    if (!cd) return;
    const ov = e.target.classList.contains("overlay") ? e.target : null;
    if (ov) { cd = null; return renderCardioSheet(); }
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.cActivity) { cd.activity = b.dataset.cActivity; return renderCardioSheet(); }
    const a = b.dataset.cact;
    if (a === "close") { cd = null; return renderCardioSheet(); }
    if (a === "del") { cd.confirmDel = true; return renderCardioSheet(); }
    if (a === "del-no") { cd.confirmDel = false; return renderCardioSheet(); }
    if (a === "del-yes") { await ctx.remove(cd.id); cd = null; renderCardioSheet(); if (screen) closeScreen(); return; }
    if (a === "save") return saveCardioSheet();
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && cd) { cd = null; renderCardioSheet(); } });
}
export const isRecording = busy;

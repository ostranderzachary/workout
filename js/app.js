// Musclemap: the heat map, lift logging, history and settings. Cardio screens live in cardio.js.
import { $, esc, fmt, uid, ymd, parse, addDays, today, weekStart, MON, DOW, rangeFor, shift } from "./util.js";
import { MUSCLES, M_IDS, LIB, FRONT, BACK, figure, ACTIVITIES, CARDIO_SET_SECONDS } from "./body.js";
import { Store } from "./store.js";
import { parseGPX, trackStats, duration } from "./geo.js";
import { initCardio, openRecorder, openActivity, fmtDist, rate, rateLabel, units } from "./cardio.js";

/* ---------- Example data shown until the first real workout ---------- */
// Seeded random numbers so the examples look the same on every load.
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const SAMPLE_TRACKS = new Map();

/* An oval loop of about 1.58 mi, run `laps` times at ~8:30/mi, with one stop at a crossing. */
const LOOP = (() => {
  // Arc-length lookup so points are spaced by distance along the oval, not by angle.
  const a = 520, b = 290, n = 720, cum = [0];
  for (let i = 1; i <= n; i++) {
    const t0 = ((i - 1) / n) * 2 * Math.PI, t1 = (i / n) * 2 * Math.PI;
    cum.push(cum[i - 1] + Math.hypot(a * (Math.cos(t1) - Math.cos(t0)), b * (Math.sin(t1) - Math.sin(t0))));
  }
  return { a, b, n, cum, perim: cum[n] };
})();
function loopAngle(dist) {
  const d = dist % LOOP.perim, c = LOOP.cum;
  let lo = 0, hi = LOOP.n;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] < d) lo = m; else hi = m; }
  return ((lo + (d - c[lo]) / (c[hi] - c[lo] || 1)) / LOOP.n) * 2 * Math.PI;
}
function sampleTrack(startMs, laps, seed) {
  const r = rng(seed), lat0 = 40.7829, lon0 = -73.9654, { a, b, perim } = LOOP;
  const pts = [], total = perim * laps;
  let t = startMs, s = 0, stopped = false;
  while (s <= total) {
    const th = loopAngle(s);
    const lat = lat0 + (a * Math.cos(th)) / 111195 + (r() - 0.5) * 1e-5;
    const lon = lon0 + (b * Math.sin(th)) / (111195 * Math.cos((lat0 * Math.PI) / 180)) + (r() - 0.5) * 1e-5;
    pts.push([lat, lon, t, 32 + 6 * Math.sin(th) + 2 * Math.sin(2 * th + 1) + (r() - 0.5) * 0.6, 5]);
    if (!stopped && s > total * 0.55) { stopped = true; t += 35000; pts.push([lat, lon, t, pts[pts.length - 1][3], 5]); }
    const v = 3.15 + 0.12 * Math.sin(s / 900) + (r() - 0.5) * 0.2 - (s / total) * 0.12;
    t += 5000; s += v * 5;
  }
  return [pts];
}

function sampleWorkouts() {
  const plans = [
    ["Push", [["Bench Press", 4, 8, 185], ["Overhead Press", 3, 8, 105], ["Lateral Raise", 3, 15, 20], ["Tricep Pushdown", 3, 12, 50]]],
    ["Pull", [["Pull-up", 4, 8, 0], ["Barbell Row", 3, 8, 155], ["Face Pull", 3, 15, 40], ["Barbell Curl", 3, 10, 65]]],
    ["Legs", [["Back Squat", 4, 6, 245], ["Romanian Deadlift", 3, 8, 185], ["Leg Curl", 3, 12, 90], ["Calf Raise", 4, 12, 135]]],
    ["Upper + core", [["Incline Bench Press", 3, 10, 135], ["Lat Pulldown", 3, 10, 130], ["Hanging Leg Raise", 3, 12, 0], ["Russian Twist", 3, 20, 25]]]
  ];
  const out = [], t = today(), offs = [1, 2, 4, 5];
  for (let wk = 0; wk < 16; wk++) {
    const mon = addDays(weekStart(t), -7 * wk);
    plans.forEach((p, i) => {
      const d = addDays(mon, offs[i] - 1);
      if (d > t || (wk % 5 === 3 && i === 3)) return;
      out.push({
        id: `sample-${wk}-${i}`, kind: "strength", date: ymd(d), name: p[0], unit: "lb", sample: true,
        exercises: p[1].map(([n, sets, reps, wt]) => ({ name: n, p: LIB[n][0], s: LIB[n][1], sets: Array.from({ length: sets }, () => ({ reps, weight: wt })) }))
      });
    });
    [[3, 2, 7], [7, 4, 8]].forEach(([dow, laps, hour], k) => {
      const d = addDays(mon, dow - 1);
      if (d > t) return;
      const id = `sample-run-${wk}-${k}`, start = new Date(d).setHours(hour, 5 + k * 10, 0, 0);
      const segs = sampleTrack(start, laps, wk * 10 + k + 1), st = trackStats(segs, { moveSpeed: ACTIVITIES.run.moveSpeed });
      SAMPLE_TRACKS.set(id, segs);
      out.push({ id, kind: "cardio", activity: "run", source: "gps", sample: true, date: ymd(d), startedAt: start, name: k ? "Long Sunday Run" : "Morning Run",
        distanceM: st.distance, movingS: st.moving, elapsedS: st.elapsed, gainM: st.gain });
    });
  }
  return out;
}

/* ---------- State ---------- */
let prefs = {};
try { prefs = JSON.parse(localStorage.getItem("musclemap.prefs") || "{}"); } catch {}
const savePrefs = () => { try { localStorage.setItem("musclemap.prefs", JSON.stringify(prefs)); } catch {} };
const S = { workouts: [], period: prefs.period || "week", anchor: today(), sel: null, draft: null, error: "", confirmDel: false, unfinished: null, settings: false, settingsMsg: "" };
const SAMPLE = sampleWorkouts();
const data = () => (S.workouts.length ? S.workouts : SAMPLE);
const usingSample = () => S.workouts.length === 0;
const isCardio = w => w.kind === "cardio";

async function reload() { S.workouts = await Store.workouts(); render(); }
async function saveWorkout(w, segments) { await Store.putWorkout(w, segments); await reload(); }
async function removeWorkout(id) { await Store.deleteWorkout(id); await reload(); }
function lockScroll(on) { document.body.classList.toggle("no-scroll", !!on || !!S.draft || !!S.settings); }
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 4500);
}

function compute(list, r) {
  const s = ymd(r.start), e = ymd(r.end);
  const ws = list.filter(w => w.date >= s && w.date <= e).sort((a, b) => b.date.localeCompare(a.date) || (b.startedAt || b.createdAt || 0) - (a.startedAt || a.createdAt || 0));
  const per = Object.fromEntries(M_IDS.map(m => [m, { sets: 0, ex: {} }]));
  let sets = 0, volume = 0, distance = 0, cardioS = 0;
  const days = new Set();
  const add = (arr, n, f, label) => { for (const m of arr) { if (!per[m]) continue; per[m].sets += n * f; per[m].ex[label] = (per[m].ex[label] || 0) + n * f; } };
  for (const w of ws) {
    days.add(w.date);
    if (isCardio(w)) {
      const a = ACTIVITIES[w.activity] || ACTIVITIES.run, n = (w.movingS || 0) / CARDIO_SET_SECONDS;
      distance += w.distanceM || 0; cardioS += w.movingS || 0;
      add(a.p, n, 1, a.label); add(a.s, n, 0.5, a.label);
      continue;
    }
    for (const x of w.exercises || []) {
      const n = (x.sets || []).length;
      sets += n;
      for (const st of x.sets || []) volume += (Number(st.reps) || 0) * (Number(st.weight) || 0);
      add(x.p || [], n, 1, x.name); add(x.s || [], n, 0.5, x.name);
    }
  }
  return { ws, per, sets, volume, distance, cardioS, days: days.size };
}
const hm = s => { const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return h ? `${h}h ${m}m` : `${m}m`; };

/* ---------- Render ---------- */
function render() {
  const list = data();
  const r = rangeFor(S.period, S.anchor, list);
  const c = compute(list, r);
  const max = Math.max(0, ...M_IDS.map(m => c.per[m].sets));
  const levels = {};
  for (const m of M_IDS) { const v = c.per[m].sets; levels[m] = v > 0 ? Math.min(5, Math.max(1, Math.ceil((v / max) * 5))) : 0; }

  document.querySelectorAll("#periods button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.p === S.period)));
  $("rangeLabel").innerHTML = `${esc(r.label)}<small>${esc(r.sub)}</small>`;
  const isAll = S.period === "all";
  $("prev").disabled = isAll; $("next").disabled = isAll || r.end >= today();

  let banner = "";
  if (S.unfinished) {
    const u = S.unfinished, pts = u.segments.reduce((n, s) => n + s.length, 0);
    banner += `<div class="banner live"><span><strong>Unfinished ${esc((ACTIVITIES[u.activity] || ACTIVITIES.run).label.toLowerCase())}</strong> from ${esc(new Date(u.startedAt).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }))}, ${pts} GPS points. The app closed while it was recording.</span>
      <span class="banner-actions"><button class="btn small primary" type="button" data-act="rec-resume">Resume</button><button class="btn small" type="button" data-act="rec-save">Finish and save</button><button class="btn small ghost danger" type="button" data-act="rec-discard">Discard</button></span></div>`;
  }
  if (usingSample()) banner += `<div class="banner"><span><strong>Example workouts.</strong> The map shows sample lifts and runs so you can see how it works. Log your first workout or record a run and it switches to yours.</span>
    <span class="banner-actions"><button class="btn small primary" type="button" data-act="record">Record a run</button><button class="btn small" type="button" data-act="log">Log lifts</button></span></div>`;
  $("banner").innerHTML = banner;

  const unit = (list.find(w => w.unit) || {}).unit || prefs.unit || "lb";
  const vol = c.volume >= 10000 ? `${fmt(c.volume / 1000)}k` : fmt(c.volume);
  $("stats").innerHTML = [["Workouts", c.ws.length], ["Days", c.days], ["Sets", c.sets], [`Volume ${unit}`, vol], [`Distance ${units().label}`, fmtDist(c.distance)], ["Cardio time", hm(c.cardioS)]]
    .map(([k, v]) => `<div class="stat"><b>${v}</b><span>${esc(k)}</span></div>`).join("");

  $("bodies").className = "bodies" + (S.sel ? " has-sel" : "");
  $("bodies").innerHTML = `<div class="fig">${figure("Front", FRONT, levels, S.sel)}<div class="cap">Front</div></div><div class="fig">${figure("Back", BACK, levels, S.sel)}<div class="cap">Back</div></div>`;

  const steps = [1, 2, 3, 4, 5].map(i => `<i style="background:var(--h${i})"></i>`).join("");
  $("legend").innerHTML = max > 0
    ? `<span>Less</span><span class="ramp">${steps}</span><span>More · max <span class="num">${fmt(max)}</span> sets</span>`
    : `<span>No sets in this range yet</span>`;

  if (S.sel) {
    const p = c.per[S.sel];
    const ex = Object.entries(p.ex).sort((a, b) => b[1] - a[1]);
    $("selinfo").innerHTML = `<div class="selinfo"><div class="head"><b>${esc(MUSCLES[S.sel])}</b><span class="num">${fmt(p.sets)} sets</span></div>` +
      (ex.length ? `<ul>${ex.map(([n, v]) => `<li><span>${esc(n)}</span><span class="num">${fmt(v)}</span></li>`).join("")}</ul>` : `<p class="note">Not trained in this range.</p>`) +
      `</div>`;
  } else $("selinfo").innerHTML = `<p class="note" style="text-align:center">Tap a muscle to see which exercises hit it.</p>`;

  const sorted = M_IDS.slice().sort((a, b) => c.per[b].sets - c.per[a].sets);
  const week = S.period === "week";
  const scale = Math.max(week ? 22 : 0, max) || 1;
  $("barsTitle").textContent = week ? "Weekly sets per muscle" : "Sets per muscle";
  $("bars").innerHTML = sorted.map(m => {
    const v = c.per[m].sets, lv = levels[m];
    const band = week ? `<span class="band" style="left:${(10 / scale) * 100}%;width:${(10 / scale) * 100}%"></span>` : "";
    return `<li><button type="button" data-m="${m}" aria-pressed="${S.sel === m}" class="${v ? "" : "zero"}"><span class="name">${esc(MUSCLES[m])}</span>` +
      `<span class="track"><span class="fill" style="width:${(v / scale) * 100}%;background:var(--h${lv || 1})"></span>${band}</span><span class="val">${fmt(v)}</span></button></li>`;
  }).join("");
  $("barsNote").textContent = (week ? "Dashed lines mark 10–20 sets a week, a common hypertrophy target. " : "") +
    "Primary muscles count a full set; secondary muscles count half. Ten minutes of cardio counts as one set.";

  $("history").innerHTML = c.ws.length ? c.ws.slice(0, 60).map(w => {
    const d = parse(w.date);
    const chip = `<span class="date-chip"><b>${d.getDate()}</b><span>${MON[d.getMonth()]} · ${DOW[d.getDay()]}</span></span>`;
    if (isCardio(w)) {
      const a = ACTIVITIES[w.activity] || ACTIVITIES.run;
      const bits = [w.distanceM ? `${fmtDist(w.distanceM)} ${units().label}` : null, duration(w.movingS), w.distanceM ? `${rate(w.distanceM, w.movingS, w.activity)} ${rateLabel(w.activity)}` : null].filter(Boolean);
      return `<li><button type="button" data-w="${esc(w.id)}">${chip}<span style="min-width:0"><div class="t"><span class="badge cardio">${esc(a.label)}</span>${esc(w.name || a.label)}</div>` +
        `<div class="s num">${esc(bits.join(" · "))}</div></span></button></li>`;
    }
    const n = (w.exercises || []).reduce((a, x) => a + (x.sets || []).length, 0);
    return `<li><button type="button" data-w="${esc(w.id)}">${chip}<span style="min-width:0"><div class="t"><span class="badge">Lift</span>${esc(w.name || "Workout")} <span class="num" style="color:var(--muted);font-weight:500">· ${n} sets</span></div>` +
      `<div class="s">${esc((w.exercises || []).map(x => x.name).join(", "))}</div></span></button></li>`;
  }).join("") + (c.ws.length > 60 ? `<li class="empty">Showing the 60 most recent of ${c.ws.length}.</li>` : "")
    : `<li class="empty">No workouts in this range.</li>`;
}

/* ---------- Settings, backup and import ---------- */
function renderSettings() {
  const root = $("settingsRoot");
  if (!S.settings) { root.innerHTML = ""; lockScroll(false); return; }
  lockScroll(true);
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const chips = (key, opts, cur) => `<div class="chips">${opts.map(([v, l]) => `<button type="button" class="chip" data-pref="${key}" data-v="${v}" aria-pressed="${cur === v}">${l}</button>`).join("")}</div>`;
  root.innerHTML = `<div class="overlay" data-sact="bg"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sTitle">
    <div class="sheet-head"><h3 id="sTitle">Settings</h3><button class="x" type="button" data-sact="close" aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    <div class="set-group"><span class="lbl">Distance</span>${chips("dist", [["mi", "Miles"], ["km", "Kilometres"]], prefs.dist || "mi")}</div>
    <div class="set-group"><span class="lbl">Auto-pause</span>${chips("autoPause", [["on", "On"], ["off", "Off"]], prefs.autoPause === false ? "off" : "on")}
      <p class="note">With auto-pause on, the clock stops when you stop moving, at a crossing for example.</p></div>
    <div class="set-group"><span class="lbl">Your data</span>
      <p class="note">Workouts are saved on this device only. Export a backup now and then, and to move to a new phone.</p>
      <div class="btn-row"><button class="btn" type="button" data-sact="export">Export backup</button>
      <label class="btn" for="importFile">Import backup or GPX</label><input id="importFile" type="file" accept=".json,.gpx,application/json,application/gpx+xml" multiple hidden></div>
      ${S.settingsMsg ? `<p class="note" role="status">${esc(S.settingsMsg)}</p>` : ""}</div>
    ${standalone ? "" : `<div class="set-group"><span class="lbl">Install</span><p class="note">Add Musclemap to your home screen so it opens full screen and works without signal. On iPhone, tap Share, then Add to Home Screen. On Android, open the browser menu and tap Install app.</p></div>`}
    <div class="set-group"><span class="lbl">Recording tips</span><p class="note">Keep the screen on while recording. Phones stop sending location to web apps when the screen locks or you switch apps. Use the lock button during a run to stop pocket taps.</p></div>
  </div></div>`;
}

async function exportBackup() {
  const dump = await Store.exportAll();
  const blob = new Blob([JSON.stringify(dump)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = `musclemap-backup-${ymd(today())}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  S.settingsMsg = `Exported ${dump.workouts.length} workouts.`; renderSettings();
}

async function importFiles(files) {
  const done = [], failed = [];
  for (const f of files) {
    try {
      const text = await f.text();
      if (/\.json$/i.test(f.name) || text.trim().startsWith("{")) { done.push(`${await Store.importAll(JSON.parse(text))} workouts from ${f.name}`); continue; }
      const g = parseGPX(text), a = ACTIVITIES[g.activity];
      const st = trackStats(g.segments, { moveSpeed: a.moveSpeed });
      const w = { id: uid("c"), kind: "cardio", activity: g.activity, source: "gpx", name: g.name || f.name.replace(/\.gpx$/i, ""),
        date: ymd(new Date(st.start)), startedAt: st.start, distanceM: st.distance, movingS: st.moving, elapsedS: st.elapsed, gainM: st.gain, createdAt: Date.now() };
      await Store.putWorkout(w, g.segments);
      done.push(`${w.name} (${fmtDist(st.distance)} ${units().label})`);
    } catch (e) { failed.push(`${f.name}: ${e.message || "couldn't read it"}`); }
  }
  await reload();
  S.settingsMsg = [done.length ? `Imported ${done.join(", ")}.` : "", failed.length ? `Not imported: ${failed.join("; ")}` : ""].filter(Boolean).join(" ");
  renderSettings();
}

/* ---------- Log / edit sheet ---------- */
const newSet = prev => ({ reps: prev ? prev.reps : "", weight: prev ? prev.weight : "" });
const newEx = () => ({ name: "", p: [], s: [], sets: [newSet()] });
function openSheet(w) {
  S.error = ""; S.confirmDel = false;
  S.draft = w && !w.sample ? JSON.parse(JSON.stringify(w))
    : { id: null, date: ymd(S.period === "day" ? S.anchor : today()), name: "", unit: prefs.unit || "lb", exercises: [newEx()] };
  renderSheet();
  setTimeout(() => { const f = document.querySelector("#sheetRoot .ex input"); if (f && !S.draft.id) f.focus(); }, 30);
}
function closeSheet() { S.draft = null; renderSheet(); }

function renderSheet() {
  const root = $("sheetRoot"), d = S.draft;
  if (!d) { root.innerHTML = ""; lockScroll(false); return; }
  lockScroll(true);
  const custom = new Set();
  S.workouts.forEach(w => (w.exercises || []).forEach(x => { if (!LIB[x.name]) custom.add(x.name); }));
  const names = Object.keys(LIB).concat([...custom]).sort();
  const xsvg = `<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>`;
  root.innerHTML = `<div class="overlay" data-act="close-bg"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheetTitle">
    <div class="sheet-head"><h3 id="sheetTitle">${d.id ? "Edit workout" : "Log workout"}</h3><button class="x" type="button" data-act="close" aria-label="Close">${xsvg}</button></div>
    <div class="row2">
      <div class="field"><label for="f-date">Date</label><input class="inp" id="f-date" type="date" value="${esc(d.date)}" max="${ymd(today())}" data-f="date"></div>
      <div class="field"><label for="f-name">Name</label><input class="inp" id="f-name" type="text" placeholder="e.g. Push day" value="${esc(d.name)}" data-f="name"></div>
    </div>
    <div class="field" style="margin-top:10px"><span class="lbl">Weight unit</span>
      <div class="tags">${["lb", "kg"].map(u => `<button type="button" class="tag ${d.unit === u ? "p" : ""}" data-unit="${u}">${u}</button>`).join("")}</div></div>
    <datalist id="exnames">${names.map(n => `<option value="${esc(n)}"></option>`).join("")}</datalist>
    ${d.exercises.map((x, i) => {
      return `<div class="ex">
        <div class="ex-top"><div class="field"><label for="ex-${i}">Exercise ${i + 1}</label><input class="inp" id="ex-${i}" list="exnames" placeholder="Search or type a new one" value="${esc(x.name)}" data-ex="${i}" autocomplete="off"></div>
        <button class="x" type="button" data-rmex="${i}" aria-label="Remove exercise">${xsvg}</button></div>
        <div id="mus-${i}">${musclesHTML(x, i)}</div>
        <div class="sets"><div class="set lbl"><span></span><span>Reps</span><span>Weight (${esc(d.unit)})</span><span></span></div>
        ${x.sets.map((st, j) => `<div class="set"><span class="n">${j + 1}</span>
          <input class="inp num" id="r-${i}-${j}" type="number" inputmode="numeric" min="0" placeholder="0" value="${esc(st.reps)}" data-set="${i}:${j}:reps" aria-label="Set ${j + 1} reps">
          <input class="inp num" id="w-${i}-${j}" type="number" inputmode="decimal" min="0" step="any" placeholder="0" value="${esc(st.weight)}" data-set="${i}:${j}:weight" aria-label="Set ${j + 1} weight">
          <button class="x" type="button" data-rmset="${i}:${j}" aria-label="Remove set ${j + 1}">${xsvg}</button></div>`).join("")}
        </div>
        <div><button class="btn small" type="button" data-addset="${i}">+ Add set</button></div>
      </div>`;
    }).join("")}
    <div style="margin-top:12px"><button class="btn" type="button" data-act="addex">+ Add exercise</button></div>
    ${S.error ? `<div class="err" role="alert">${esc(S.error)}</div>` : ""}
    <div class="sheet-actions">
      ${d.id ? (S.confirmDel
        ? `<span class="confirm">Delete this workout? <button class="btn small danger" type="button" data-act="del-yes">Delete</button><button class="btn small ghost" type="button" data-act="del-no">Keep</button></span>`
        : `<button class="btn ghost danger" type="button" data-act="del">Delete</button>`) : ""}
      <div class="right"><button class="btn ghost" type="button" data-act="close">Cancel</button><button class="btn primary" type="button" data-act="save">${d.id ? "Save changes" : "Save workout"}</button></div>
    </div>
  </div></div>`;
}

function musclesHTML(x, i) {
  if (LIB[x.name] || !x.name.trim()) return x.p.length || x.s.length
    ? `<div class="tags">${x.p.map(m => `<span class="tag p">${esc(MUSCLES[m])}</span>`).join("")}${x.s.map(m => `<span class="tag s">${esc(MUSCLES[m])}</span>`).join("")}</div>` : "";
  return `<div class="field"><span class="lbl">New exercise · tap the muscles it works (tap again for secondary)</span><div class="tags">${M_IDS.map(m => {
    const st = x.p.includes(m) ? "p" : x.s.includes(m) ? "s" : "";
    return `<button type="button" class="tag ${st}" data-tog="${i}:${m}" aria-pressed="${!!st}">${esc(MUSCLES[m])}</button>`; }).join("")}</div></div>`;
}

function refocus(id) { const el = $(id); if (el) { el.focus(); if (el.select) try { el.select(); } catch {} } }

$("sheetRoot").addEventListener("input", e => {
  const d = S.draft, t = e.target; if (!d) return;
  if (t.dataset.f) d[t.dataset.f] = t.value;
  if (t.dataset.set) { const [i, j, k] = t.dataset.set.split(":"); d.exercises[i].sets[j][k] = t.value; }
  if (t.dataset.ex !== undefined) {
    const x = d.exercises[t.dataset.ex], wasKnown = !!LIB[x.name];
    x.name = t.value;
    const prior = S.workouts.flatMap(w => w.exercises || []).find(y => y.name.toLowerCase() === t.value.trim().toLowerCase());
    if (LIB[x.name]) { x.p = LIB[x.name][0].slice(); x.s = LIB[x.name][1].slice(); }
    else if (prior) { x.p = (prior.p || []).slice(); x.s = (prior.s || []).slice(); }
    else if (wasKnown) { x.p = []; x.s = []; }
    const box = $(`mus-${t.dataset.ex}`); if (box) box.innerHTML = musclesHTML(x, +t.dataset.ex);
  }
});
$("sheetRoot").addEventListener("click", async e => {
  const d = S.draft; if (!d) return;
  const b = e.target.closest("button, .overlay");
  if (!b) return;
  if (b.classList.contains("overlay")) { if (e.target === b) closeSheet(); return; }
  const a = b.dataset;
  if (a.act === "close") return closeSheet();
  if (a.unit) { d.unit = a.unit; prefs.unit = a.unit; savePrefs(); return renderSheet(); }
  if (a.act === "addex") { d.exercises.push(newEx()); renderSheet(); return refocus(`ex-${d.exercises.length - 1}`); }
  if (a.rmex !== undefined) { d.exercises.splice(+a.rmex, 1); if (!d.exercises.length) d.exercises.push(newEx()); return renderSheet(); }
  if (a.addset !== undefined) { const x = d.exercises[a.addset]; x.sets.push(newSet(x.sets[x.sets.length - 1])); renderSheet(); return refocus(`r-${a.addset}-${x.sets.length - 1}`); }
  if (a.rmset) { const [i, j] = a.rmset.split(":").map(Number); d.exercises[i].sets.splice(j, 1); return renderSheet(); }
  if (a.tog) {
    const [i, m] = a.tog.split(":"), x = d.exercises[i];
    if (x.p.includes(m)) { x.p = x.p.filter(y => y !== m); x.s.push(m); }
    else if (x.s.includes(m)) x.s = x.s.filter(y => y !== m);
    else x.p.push(m);
    return renderSheet();
  }
  if (a.act === "del") { S.confirmDel = true; return renderSheet(); }
  if (a.act === "del-no") { S.confirmDel = false; return renderSheet(); }
  if (a.act === "del-yes") {
    try { await removeWorkout(d.id); closeSheet(); }
    catch { S.error = "Couldn't delete the workout. Try again."; renderSheet(); }
    return;
  }
  if (a.act === "save") {
    const exercises = d.exercises.map(x => ({
      name: x.name.trim(), p: x.p, s: x.s,
      sets: x.sets.filter(st => String(st.reps).trim() !== "").map(st => ({ reps: Number(st.reps) || 0, weight: Number(st.weight) || 0 }))
    })).filter(x => x.name);
    let err = "";
    if (!d.date) err = "Pick a date for this workout.";
    else if (!exercises.length) err = "Add at least one exercise.";
    else if (exercises.some(x => !x.p.length && !x.s.length)) err = `Choose the muscles that “${exercises.find(x => !x.p.length && !x.s.length).name}” works.`;
    else if (exercises.some(x => !x.sets.length)) err = `Enter reps for at least one set of “${exercises.find(x => !x.sets.length).name}”.`;
    if (err) { S.error = err; return renderSheet(); }
    const w = { id: d.id || uid("w"), kind: "strength", date: d.date, name: d.name.trim(), unit: d.unit, exercises, createdAt: d.createdAt || Date.now() };
    try {
      await saveWorkout(w);
      S.anchor = parse(w.date); closeSheet(); render();
    } catch { S.error = "Couldn't save the workout. Free up storage on this device and try again."; renderSheet(); }
  }
});
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  if (S.draft) closeSheet();
  else if (S.settings) { S.settings = false; renderSettings(); }
});

/* ---------- Main interactions ---------- */
$("periods").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  S.period = b.dataset.p; prefs.period = S.period; savePrefs(); render();
});
$("prev").addEventListener("click", () => { S.anchor = shift(S.period, S.anchor, -1); render(); });
$("next").addEventListener("click", () => { const n = shift(S.period, S.anchor, 1); S.anchor = n > today() ? today() : n; render(); });
$("bodies").addEventListener("click", e => { const p = e.target.closest("[data-m]"); S.sel = p && S.sel !== p.dataset.m ? p.dataset.m : null; render(); });
$("bars").addEventListener("click", e => { const b = e.target.closest("[data-m]"); if (!b) return; S.sel = S.sel === b.dataset.m ? null : b.dataset.m; render(); });
$("history").addEventListener("click", e => {
  const b = e.target.closest("[data-w]"); if (!b) return;
  const w = data().find(x => x.id === b.dataset.w);
  if (!w) return;
  if (isCardio(w)) return openActivity(w);
  if (w.sample) { openSheet(null); S.draft.name = w.name; S.draft.exercises = JSON.parse(JSON.stringify(w.exercises)); renderSheet(); }
  else openSheet(w);
});
$("banner").addEventListener("click", async e => {
  const b = e.target.closest("button"); if (!b) return;
  const act = b.dataset.act;
  if (act === "log") openSheet(null);
  if (act === "record") openRecorder();
  if (act === "rec-resume" || act === "rec-save") { const u = S.unfinished; S.unfinished = null; render(); openRecorder(u, { thenSave: act === "rec-save" }); }
  if (act === "rec-discard") { await Store.delMeta("recording"); S.unfinished = null; render(); toast("Unfinished activity discarded."); }
});
document.querySelectorAll("[data-open=log]").forEach(b => b.addEventListener("click", () => openSheet(null)));
document.querySelectorAll("[data-open=record]").forEach(b => b.addEventListener("click", () => openRecorder()));
$("settingsBtn").addEventListener("click", () => { S.settings = true; S.settingsMsg = ""; renderSettings(); });

$("settingsRoot").addEventListener("click", e => {
  if (e.target.classList.contains("overlay")) { S.settings = false; return renderSettings(); }
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.pref === "dist") { prefs.dist = b.dataset.v; savePrefs(); render(); return renderSettings(); }
  if (b.dataset.pref === "autoPause") { prefs.autoPause = b.dataset.v === "on"; savePrefs(); return renderSettings(); }
  if (b.dataset.sact === "close") { S.settings = false; return renderSettings(); }
  if (b.dataset.sact === "export") exportBackup().catch(() => { S.settingsMsg = "Couldn't export the backup."; renderSettings(); });
});
$("settingsRoot").addEventListener("change", e => {
  if (e.target.id === "importFile" && e.target.files.length) importFiles([...e.target.files]);
});

/* ---------- Start up ---------- */
initCardio({
  prefs, savePrefs, toast, lockScroll,
  save: saveWorkout, remove: removeWorkout,
  getTrack: async id => SAMPLE_TRACKS.get(id) || Store.getTrack(id)
});
render();
(async () => {
  try {
    await Store.init();
    $("sync").textContent = "Saved on this device";
    S.workouts = await Store.workouts();
    const rec = await Store.getMeta("recording");
    if (rec && rec.startedAt) S.unfinished = rec;
    render();
  } catch {
    $("sync").textContent = "Can't save here";
    toast("This browser is blocking storage, so workouts won't be kept. Turn off private browsing or allow site data.");
  }
})();
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

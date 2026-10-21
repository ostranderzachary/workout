// Pace (or speed) and elevation charts over distance, with one crosshair shared by both
// and reported back so the map can show the same spot.
import { duration } from "./geo.js";

const M = { l: 46, r: 12, t: 10, b: 24 };

function niceStep(range, target) {
  const raw = range / Math.max(1, target), mag = 10 ** Math.floor(Math.log10(raw)), n = raw / mag;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
}
function ticks(lo, hi, target) {
  const step = niceStep(hi - lo || 1, target), out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}
const quantile = (arr, q) => { const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))]; };

/* prof: output of geo.profile(). unit: metres per mile/km. elevUnit: metres per ft/m. */
export function renderProfile(el, prof, { unit, unitLabel, elevUnit, elevLabel, usesPace, onHover }) {
  const pts = prof.filter(p => p.d != null);
  const hasAlt = pts.some(p => p.alt != null);
  const speeds = pts.map(p => p.speed).filter(v => v != null);
  if (pts.length < 3 || !speeds.length) { el.innerHTML = ""; return () => {}; }

  const W = Math.max(280, el.clientWidth || 600), H = 150, iw = W - M.l - M.r, ih = H - M.t - M.b;
  const maxD = pts[pts.length - 1].d / unit;
  const x = d => M.l + (d / unit / (maxD || 1)) * iw;
  const xt = ticks(0, maxD, Math.max(3, Math.floor(iw / 70)));

  // Pace axis: faster at the top; clip GPS spikes to the 5th–95th percentile.
  const val = v => (usesPace ? unit / v : v / unit * 3600);
  const vals = speeds.map(val);
  let lo = quantile(vals, 0.05), hi = quantile(vals, 0.95);
  if (hi - lo < (usesPace ? 30 : 2)) { const mid = (hi + lo) / 2, pad = usesPace ? 15 : 1; lo = mid - pad; hi = mid + pad; }
  const padV = (hi - lo) * 0.1; lo -= padV; hi += padV;
  const yP = v => { const c = Math.min(hi, Math.max(lo, v)); return usesPace ? M.t + ((c - lo) / (hi - lo)) * ih : M.t + ih - ((c - lo) / (hi - lo)) * ih; };
  const fmtP = v => (usesPace ? duration(v) : v.toFixed(1));

  let aLo = 0, aHi = 1, yA = () => 0;
  if (hasAlt) {
    const alts = pts.filter(p => p.alt != null).map(p => p.alt / elevUnit);
    aLo = Math.min(...alts); aHi = Math.max(...alts);
    if (aHi - aLo < 20) { const m = (aHi + aLo) / 2; aLo = m - 10; aHi = m + 10; }
    yA = a => M.t + ih - ((a - aLo) / (aHi - aLo)) * ih;
  }

  const axis = (yt, y, f) =>
    yt.map(v => `<line x1="${M.l}" x2="${W - M.r}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${M.l - 8}" y="${y(v) + 4}" class="tick" text-anchor="end">${f(v)}</text>`).join("") +
    xt.map(v => `<text x="${x(v * unit)}" y="${H - 6}" class="tick" text-anchor="middle">${+v.toFixed(2)}</text>`).join("") +
    `<line x1="${M.l}" x2="${W - M.r}" y1="${M.t + ih}" y2="${M.t + ih}" class="axis"/>`;

  // Pace line breaks where you stopped.
  let paceD = "", pen = false;
  for (const p of pts) {
    if (p.speed == null) { pen = false; continue; }
    paceD += `${pen ? "L" : "M"}${x(p.d).toFixed(1)} ${yP(val(p.speed)).toFixed(1)}`; pen = true;
  }
  const ptTicks = ticks(lo, hi, 3).filter(v => v > lo && v < hi);
  const paceSvg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="chart" data-c="pace" role="img" aria-label="${usesPace ? "Pace" : "Speed"} over distance">
    ${axis(ptTicks, yP, fmtP)}<path d="${paceD}" class="line"/>
    <g class="xh" hidden><line y1="${M.t}" y2="${M.t + ih}" class="xh-line"/><circle r="5" class="xh-dot"/></g>
    <rect x="${M.l}" y="0" width="${iw}" height="${H}" class="hit"/></svg>`;

  let elevSvg = "";
  if (hasAlt) {
    const ap = pts.filter(p => p.alt != null);
    const line = ap.map((p, i) => `${i ? "L" : "M"}${x(p.d).toFixed(1)} ${yA(p.alt / elevUnit).toFixed(1)}`).join("");
    const area = `${line}L${x(ap[ap.length - 1].d).toFixed(1)} ${M.t + ih}L${x(ap[0].d).toFixed(1)} ${M.t + ih}Z`;
    elevSvg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="chart" data-c="elev" role="img" aria-label="Elevation over distance">
      ${axis(ticks(aLo, aHi, 3), yA, v => Math.round(v))}<path d="${area}" class="area"/><path d="${line}" class="aline"/>
      <g class="xh" hidden><line y1="${M.t}" y2="${M.t + ih}" class="xh-line"/><circle r="5" class="xh-dot"/></g>
      <rect x="${M.l}" y="0" width="${iw}" height="${H}" class="hit"/></svg>`;
  }

  el.innerHTML = `<div class="readout" aria-live="polite">Drag across a chart to see a point on the route.</div>
    <div class="chart-h">${usesPace ? `Pace <span>min/${unitLabel}</span>` : `Speed <span>${unitLabel === "mi" ? "mph" : "km/h"}</span>`}</div>${paceSvg}
    ${elevSvg ? `<div class="chart-h">Elevation <span>${elevLabel}</span></div>${elevSvg}` : `<p class="note">No elevation data in this track.</p>`}
    <div class="chart-x">Distance (${unitLabel})</div>`;

  const readout = el.querySelector(".readout");
  const show = i => {
    const p = pts[i];
    el.querySelectorAll("svg.chart").forEach(svg => {
      const g = svg.querySelector(".xh"), cx = x(p.d);
      g.hidden = false;
      g.querySelector("line").setAttribute("x1", cx); g.querySelector("line").setAttribute("x2", cx);
      const dot = g.querySelector("circle");
      const cy = svg.dataset.c === "pace" ? (p.speed != null ? yP(val(p.speed)) : null) : (p.alt != null ? yA(p.alt / elevUnit) : null);
      dot.style.display = cy == null ? "none" : ""; if (cy != null) { dot.setAttribute("cx", cx); dot.setAttribute("cy", cy); }
    });
    const parts = [`${(p.d / unit).toFixed(2)} ${unitLabel}`, p.speed != null ? (usesPace ? `${duration(val(p.speed))} /${unitLabel}` : `${val(p.speed).toFixed(1)} ${unitLabel === "mi" ? "mph" : "km/h"}`) : "Stopped"];
    if (p.alt != null) parts.push(`${Math.round(p.alt / elevUnit)} ${elevLabel}`);
    readout.textContent = parts.join(" · ");
    onHover && onHover(p);
  };
  const hide = () => { el.querySelectorAll(".xh").forEach(g => { g.hidden = true; }); onHover && onHover(null); };
  const nearest = d => { let lo2 = 0, hi2 = pts.length - 1; while (hi2 - lo2 > 1) { const m = (lo2 + hi2) >> 1; if (pts[m].d < d) lo2 = m; else hi2 = m; } return Math.abs(pts[lo2].d - d) < Math.abs(pts[hi2].d - d) ? lo2 : hi2; };
  el.querySelectorAll("rect.hit").forEach(r => {
    const move = e => {
      const box = r.ownerSVGElement.getBoundingClientRect();
      const px = ((e.clientX - box.left) / box.width) * W;
      show(nearest(((px - M.l) / iw) * (maxD || 1) * unit));
    };
    r.addEventListener("pointermove", move);
    r.addEventListener("pointerdown", move);
    r.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") hide(); });
  });
  return hide;
}

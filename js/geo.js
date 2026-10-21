// Track maths and GPX. No DOM access, so it runs in Node tests too.
// A point is [lat, lon, timeMs, altitudeM|null, accuracyM|null].
// A track is a list of segments (split at manual pauses); each segment is a list of points.

export const MILE = 1609.344;
export const FOOT = 0.3048;
const R = 6371008.8;
const rad = d => (d * Math.PI) / 180;

export function haversine(a, b) {
  const dLat = rad(b[0] - a[0]), dLon = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/* Decide whether a new GPS fix belongs in the track.
   'ok' store it · 'inaccurate' accuracy too poor · 'jump' impossible speed · 'still' inside the jitter radius */
export function acceptPoint(prev, p, { maxAccuracy = 30, maxSpeed = 12, minMove = 3, keepAliveS = 10 } = {}) {
  if (p[4] != null && p[4] > maxAccuracy) return "inaccurate";
  if (!prev) return "ok";
  const dt = (p[2] - prev[2]) / 1000;
  if (dt <= 0) return "still";
  const d = haversine(prev, p);
  if (d / dt > maxSpeed && dt < 60) return "jump";
  const jitter = Math.max(minMove, (p[4] || 0) * 0.5);
  if (d < jitter && dt < keepAliveS) return "still";
  return "ok";
}

/* Distance, elapsed, moving time and elevation for a whole track.
   Moving time counts only stretches faster than moveSpeed (m/s), so stops drop out like auto-pause. */
export function trackStats(segments, { moveSpeed = 0.5 } = {}) {
  let distance = 0, moving = 0, first = null, last = null;
  for (const seg of segments) {
    for (let i = 0; i < seg.length; i++) {
      const p = seg[i];
      if (!first) first = p;
      last = p;
      if (i === 0) continue;
      const d = haversine(seg[i - 1], p), dt = (p[2] - seg[i - 1][2]) / 1000;
      distance += d;
      if (dt > 0 && d / dt >= moveSpeed) moving += dt;
    }
  }
  const { gain, loss } = elevation(segments);
  return {
    distance, moving,
    elapsed: first && last ? (last[2] - first[2]) / 1000 : 0,
    gain, loss,
    start: first ? first[2] : null, end: last ? last[2] : null
  };
}

/* Elevation gain from GPS altitude: a 7-point moving average, then a 3 m dead band,
   so altitude noise doesn't add phantom climbing. */
export function elevation(segments, band = 3, window = 7) {
  let gain = 0, loss = 0, ref = null, any = false;
  for (const seg of segments) {
    const alts = seg.map(p => p[3]).filter(a => a != null);
    if (!alts.length) continue;
    any = true;
    const h = Math.floor(window / 2);
    for (let i = 0; i < alts.length; i++) {
      const w = alts.slice(Math.max(0, i - h), i + h + 1), a = w.reduce((x, y) => x + y, 0) / w.length;
      if (ref == null) { ref = a; continue; }
      if (a - ref > band) { gain += a - ref; ref = a; }
      else if (ref - a > band) { loss += ref - a; ref = a; }
    }
  }
  return { gain: any ? gain : null, loss: any ? loss : null };
}

/* Splits of `unit` metres (a mile or a km). Time is moving time, as on most running apps.
   The last split is partial and carries its real distance. */
export function splits(segments, unit, { moveSpeed = 0.5 } = {}) {
  const out = [];
  let cur = { distance: 0, time: 0, startAlt: null, endAlt: null };
  const close = () => out.push({ distance: cur.distance, time: cur.time, elev: cur.startAlt != null && cur.endAlt != null ? cur.endAlt - cur.startAlt : null });
  for (const seg of segments) {
    for (let i = 1; i < seg.length; i++) {
      const a = seg[i - 1], b = seg[i];
      const d = haversine(a, b), dt = (b[2] - a[2]) / 1000, moving = dt > 0 && d / dt >= moveSpeed;
      const altAt = f => (a[3] != null && b[3] != null ? a[3] + (b[3] - a[3]) * f : b[3] ?? a[3]);
      if (cur.startAlt == null) cur.startAlt = a[3];
      let used = 0; // fraction of this pair already assigned to earlier splits
      while (d > 0 && cur.distance + d * (1 - used) >= unit) {
        const f = (unit - cur.distance) / d;
        if (moving) cur.time += dt * f;
        used += f;
        cur.distance = unit;
        cur.endAlt = altAt(used);
        close();
        cur = { distance: 0, time: 0, startAlt: cur.endAlt, endAlt: null };
      }
      cur.distance += d * (1 - used);
      if (moving) cur.time += dt * (1 - used);
      if (b[3] != null) cur.endAlt = b[3];
    }
  }
  if (cur.distance > unit * 0.01) close();
  return out;
}

/* A profile for charts: cumulative distance, smoothed speed, and altitude, thinned to ~maxPoints. */
export function profile(segments, { moveSpeed = 0.5, windowS = 30, maxPoints = 400 } = {}) {
  const pts = [];
  let dist = 0;
  for (const seg of segments) {
    seg.forEach((p, i) => {
      if (i > 0) dist += haversine(seg[i - 1], p);
      pts.push({ d: dist, t: p[2], alt: p[3], lat: p[0], lon: p[1], seg: i === 0 });
    });
  }
  let j = 0;
  for (let i = 0; i < pts.length; i++) {
    while (j < i && (pts[i].t - pts[j].t) / 1000 > windowS) j++;
    const dt = (pts[i].t - pts[j].t) / 1000;
    const v = dt > 0 && !pts[i].seg ? (pts[i].d - pts[j].d) / dt : null;
    pts[i].speed = v != null && v >= moveSpeed ? v : null;
  }
  if (pts.length <= maxPoints) return pts;
  const step = pts.length / maxPoints, out = [];
  for (let x = 0; x < pts.length; x += step) out.push(pts[Math.floor(x)]);
  if (out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]);
  return out;
}

/* Speed (m/s) over the last `windowS` seconds of the current segment, for the live pace readout. */
export function recentSpeed(seg, windowS = 20) {
  if (!seg || seg.length < 2) return null;
  const last = seg[seg.length - 1];
  let i = seg.length - 1, d = 0;
  while (i > 0) {
    d += haversine(seg[i - 1], seg[i]); i--;
    if ((last[2] - seg[i][2]) / 1000 >= windowS) break;
  }
  const dt = (last[2] - seg[i][2]) / 1000;
  return dt > 0 ? d / dt : null;
}

/* ---------- Formatting ---------- */
export function duration(s) {
  s = Math.max(0, Math.round(s || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = n => String(n).padStart(2, "0");
  return h ? `${h}:${p(m)}:${p(sec)}` : `${m}:${p(sec)}`;
}
export function pace(metresPerSecond, unit) {
  if (!metresPerSecond || metresPerSecond <= 0) return "–:––";
  const s = unit / metresPerSecond;
  if (s >= 3600) return "–:––";
  return duration(s);
}

/* ---------- GPX ---------- */
const GPX_TYPES = { run: "running", walk: "walking", hike: "hiking", ride: "cycling" };
const xml = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function toGPX({ name, activity }, segments) {
  const first = segments.find(s => s.length)?.[0];
  const segs = segments.filter(s => s.length).map(seg => "   <trkseg>\n" + seg.map(p =>
    `    <trkpt lat="${p[0].toFixed(7)}" lon="${p[1].toFixed(7)}">${p[3] != null ? `<ele>${p[3].toFixed(1)}</ele>` : ""}<time>${new Date(p[2]).toISOString()}</time></trkpt>`
  ).join("\n") + "\n   </trkseg>").join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Musclemap" xmlns="http://www.topografix.com/GPX/1/1">
 <metadata>${first ? `<time>${new Date(first[2]).toISOString()}</time>` : ""}</metadata>
 <trk>
  <name>${xml(name)}</name>
  <type>${GPX_TYPES[activity] || "running"}</type>
${segs}
 </trk>
</gpx>
`;
}

/* Reads GPX from Strava, Garmin and most watches. Strava's older numeric types are mapped too. */
export function parseGPX(text) {
  const tag = (src, name) => { const m = src.match(new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`, "i")); return m ? m[1].trim() : null; };
  const unxml = s => s == null ? s : s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  const trk = tag(text, "trk");
  if (!trk) throw new Error("This file has no track in it. Export the activity as GPX and try again.");
  const segTexts = trk.match(/<(?:\w+:)?trkseg\b[\s\S]*?<\/(?:\w+:)?trkseg>/gi) || [trk];
  const segments = segTexts.map(st => {
    const pts = [];
    const re = /<(?:\w+:)?trkpt\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?trkpt>)/gi;
    let m;
    while ((m = re.exec(st))) {
      const lat = parseFloat((m[1].match(/lat\s*=\s*["']([^"']+)/) || [])[1]);
      const lon = parseFloat((m[1].match(/lon\s*=\s*["']([^"']+)/) || [])[1]);
      const body = m[2] || "";
      const t = Date.parse(tag(body, "time") || "");
      const ele = parseFloat(tag(body, "ele"));
      if (Number.isFinite(lat) && Number.isFinite(lon) && Number.isFinite(t)) pts.push([lat, lon, t, Number.isFinite(ele) ? ele : null, null]);
    }
    return pts;
  }).filter(s => s.length);
  if (!segments.length) throw new Error("This GPX file has no timed points, so distance and pace can't be worked out.");
  const rawType = (unxml(tag(trk, "type")) || "").toLowerCase();
  const byNum = { "9": "run", "1": "ride", "11": "walk", "4": "hike" };
  const activity = byNum[rawType] || (/cycl|ride|bik/.test(rawType) ? "ride" : /hik/.test(rawType) ? "hike" : /walk/.test(rawType) ? "walk" : "run");
  return { name: unxml(tag(trk, "name")) || "", activity, segments };
}

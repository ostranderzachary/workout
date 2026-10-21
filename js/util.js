// Dates, escaping and number formatting shared across the app.

/* ---------- Dates ---------- */
export const pad = n => String(n).padStart(2, "0");
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
export const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
export const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
export const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
export const weekStart = d => addDays(d, -((d.getDay() + 6) % 7));

export function rangeFor(period, anchor, all) {
  const a = new Date(anchor);
  if (period === "day") return { start: a, end: a, label: `${DOW[a.getDay()]}, ${MON[a.getMonth()]} ${a.getDate()}`, sub: String(a.getFullYear()) };
  if (period === "week") {
    const s = weekStart(a), e = addDays(s, 6);
    const lab = s.getMonth() === e.getMonth() ? `${MON[s.getMonth()]} ${s.getDate()}–${e.getDate()}` : `${MON[s.getMonth()]} ${s.getDate()} – ${MON[e.getMonth()]} ${e.getDate()}`;
    return { start: s, end: e, label: lab, sub: String(e.getFullYear()) };
  }
  if (period === "month") return { start: new Date(a.getFullYear(), a.getMonth(), 1), end: new Date(a.getFullYear(), a.getMonth() + 1, 0), label: MONTHS[a.getMonth()], sub: String(a.getFullYear()) };
  if (period === "year") return { start: new Date(a.getFullYear(), 0, 1), end: new Date(a.getFullYear(), 11, 31), label: String(a.getFullYear()), sub: "Full year" };
  const dates = all.map(w => w.date).sort();
  return { start: dates.length ? parse(dates[0]) : today(), end: today(), label: "All time", sub: dates.length ? `Since ${MON[parse(dates[0]).getMonth()]} ${parse(dates[0]).getFullYear()}` : "No workouts yet" };
}
export function shift(period, anchor, dir) {
  const a = new Date(anchor);
  if (period === "day") return addDays(a, dir);
  if (period === "week") return addDays(a, 7 * dir);
  if (period === "month") return new Date(a.getFullYear(), a.getMonth() + dir, 1);
  if (period === "year") return new Date(a.getFullYear() + dir, 0, 1);
  return a;
}

export const $ = id => document.getElementById(id);
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const fmt = n => (Math.round(n * 10) / 10).toLocaleString();
export const uid = (p = "w") => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
